const assert = require('assert');
const {
    buildBrowserLaunchOptions,
    classifyProxyResponse,
    classifyProxyError,
    validateUsersConfig,
    safeAccountLabel,
    finalizeAccountResources
} = require('../lib/runtime_helpers');
const { sendTelegramNotification } = require('../lib/telegram');

async function tests() {
    const noProxy = buildBrowserLaunchOptions(null);
    assert.strictEqual(noProxy.headless, false);
    assert.strictEqual(noProxy.proxy, undefined);
    assert.ok(Array.isArray(noProxy.args));

    const proxy = buildBrowserLaunchOptions({
        server: 'http://proxy.example.com:80',
        username: 'user',
        password: 'pa@ss:word'
    });
    assert.deepStrictEqual(proxy.proxy, {
        server: 'http://proxy.example.com:80',
        username: 'user',
        password: 'pa@ss:word'
    });
    assert.strictEqual(proxy.httpCredentials, undefined);

    for (const status of [200, 204, 302, 399, 401, 403, 404, 429]) {
        const result = classifyProxyResponse(status);
        assert.strictEqual(result.ok, true, `HTTP ${status} should prove target reachability`);
        assert.strictEqual(result.reachable, true);
    }
    assert.strictEqual(classifyProxyResponse(407).ok, false);
    assert.strictEqual(classifyProxyResponse(407).category, 'proxy_auth_failed');
    for (const status of [500, 502, 503, 504]) {
        const result = classifyProxyResponse(status);
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.category, 'upstream_gateway_error');
    }
    assert.strictEqual(classifyProxyResponse(0).reachable, false);
    assert.strictEqual(classifyProxyError({ message: 'timeout of 10000ms exceeded' }).category, 'transport_error');

    assert.strictEqual(validateUsersConfig('not-json').valid, false);
    assert.strictEqual(validateUsersConfig('{}').reason, 'invalid_root');
    assert.strictEqual(validateUsersConfig('[]').reason, 'empty_users');
    assert.strictEqual(validateUsersConfig('[{"username":"" ,"password":"p"}]').reason, 'invalid_user_1:invalid_username');
    assert.strictEqual(validateUsersConfig('[{"username":"u"}]').reason, 'invalid_user_1:invalid_password');
    const validUsers = validateUsersConfig('{"users":[{"username":" u@example.com ","password":"p"}]}');
    assert.strictEqual(validUsers.valid, true);
    assert.strictEqual(validUsers.users[0].username, 'u@example.com');
    assert.strictEqual(safeAccountLabel({ username: 'a/b@c' }, 0), 'a_b_c');
    assert.strictEqual(safeAccountLabel({}, 2), 'user_3');

    let pageClosed = 0;
    let contextClosed = 0;
    const cleanupResult = await finalizeAccountResources({
        page: {
            screenshot: async () => { throw new Error('read-only screenshots'); },
            close: async () => { pageClosed++; }
        },
        context: { close: async () => { contextClosed++; } },
        ensureDir: async () => { throw new Error('disk full'); },
        screenshotName: 'account.png',
        logger: () => {}
    });
    assert.strictEqual(pageClosed, 1);
    assert.strictEqual(contextClosed, 1);
    assert.ok(cleanupResult.screenshotError);
    assert.strictEqual(cleanupResult.pageCloseError, null);

    let closeAfterScreenshot = 0;
    let contextCloseAfterPageError = 0;
    const secondCleanup = await finalizeAccountResources({
        page: {
            screenshot: async () => {},
            close: async () => { closeAfterScreenshot++; throw new Error('page close failed'); }
        },
        context: { close: async () => { contextCloseAfterPageError++; throw new Error('context close failed'); } },
        ensureDir: async () => '/tmp',
        screenshotName: 'account.png',
        logger: () => {}
    });
    assert.strictEqual(closeAfterScreenshot, 1);
    assert.strictEqual(contextCloseAfterPageError, 1);
    assert.ok(secondCleanup.pageCloseError);
    assert.ok(secondCleanup.contextCloseError);

    const axiosCalls = [];
    const axios = {
        post: async (...args) => {
            axiosCalls.push(args);
            if (axiosCalls.length === 1) throw new Error('telegram timeout');
        }
    };
    const errors = [];
    const fs = {
        existsSync: () => true,
        createReadStream: file => ({ file })
    };
    class FakeFormData {
        constructor() { this.fields = []; }
        append(name, value) { this.fields.push([name, value]); }
        getHeaders() { return { 'content-type': 'multipart/form-data; boundary=test' }; }
    }
    const telegramResult = await sendTelegramNotification({
        axios,
        FormData: FakeFormData,
        fs,
        token: 'token-for-test',
        chatId: 'chat-for-test',
        message: 'status',
        imagePath: '/tmp/account.png',
        logger: { error: (...args) => errors.push(args.join(' ')) }
    });
    assert.strictEqual(telegramResult.textSent, false);
    assert.strictEqual(telegramResult.imageSent, true);
    assert.strictEqual(axiosCalls.length, 2);
    assert.strictEqual(errors.length, 1);
    assert.strictEqual((await sendTelegramNotification({ axios, FormData: FakeFormData, fs, token: '', chatId: 'chat', message: 'x' })).skipped, true);

    console.log('[runtime helper tests] all tests passed');
}

tests().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
