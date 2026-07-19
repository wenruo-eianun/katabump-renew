const path = require('path');

const CHROME_ARGS = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,720',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--lang=en-US',
    '--accept-lang=en-US,en'
];

function buildBrowserLaunchOptions(proxyConfig) {
    const options = {
        headless: false,
        args: [...CHROME_ARGS]
    };

    if (proxyConfig) {
        options.proxy = { server: proxyConfig.server };
        if (proxyConfig.username) options.proxy.username = proxyConfig.username;
        if (proxyConfig.password) options.proxy.password = proxyConfig.password;
    }

    return options;
}

function classifyProxyResponse(status) {
    const numericStatus = Number(status);
    const result = {
        ok: false,
        reachable: true,
        status: numericStatus,
        category: 'unknown_response',
        error: null
    };

    if (numericStatus >= 200 && numericStatus <= 399) {
        return { ...result, ok: true, category: 'target_reachable' };
    }
    if (numericStatus === 407) {
        return { ...result, category: 'proxy_auth_failed', error: 'Proxy authentication required (407)' };
    }
    if ([502, 503, 504].includes(numericStatus) || numericStatus >= 500) {
        return { ...result, category: 'upstream_gateway_error', error: `Upstream HTTP ${numericStatus}` };
    }
    if (numericStatus >= 400 && numericStatus <= 499) {
        return { ...result, ok: true, category: 'target_reachable' };
    }

    return { ...result, reachable: false, error: `Unknown HTTP status ${status}` };
}

function classifyProxyError(error) {
    return {
        ok: false,
        reachable: false,
        status: error && error.response ? Number(error.response.status) : null,
        category: 'transport_error',
        error: error && error.message ? error.message : String(error || 'Unknown proxy error')
    };
}

function validateUsersConfig(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw || '');
    } catch {
        return { valid: false, reason: 'invalid_json', users: [] };
    }

    const users = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.users) ? parsed.users : null;
    if (!users) return { valid: false, reason: 'invalid_root', users: [] };
    if (users.length === 0) return { valid: false, reason: 'empty_users', users: [] };

    const normalized = users.map((user, index) => {
        if (!user || typeof user !== 'object' || Array.isArray(user)) {
            return { valid: false, index, reason: 'not_object', user: {} };
        }
        if (typeof user.username !== 'string' || !user.username.trim()) {
            return { valid: false, index, reason: 'invalid_username', user: {} };
        }
        if (typeof user.password !== 'string' || !user.password) {
            return { valid: false, index, reason: 'invalid_password', user: {} };
        }
        return { valid: true, index, user: { ...user, username: user.username.trim() } };
    });

    const invalid = normalized.filter(item => !item.valid);
    if (invalid.length > 0) {
        const first = invalid[0];
        return {
            valid: false,
            reason: `invalid_user_${first.index + 1}:${first.reason}`,
            users: [],
            invalid
        };
    }

    return { valid: true, users: normalized.map(item => item.user), invalid: [] };
}

function safeAccountLabel(user, index) {
    const username = user && typeof user.username === 'string' ? user.username : '';
    const label = username.replace(/[^a-z0-9]/gi, '_').replace(/^_+|_+$/g, '');
    return label || `user_${Number(index) + 1}`;
}

async function finalizeAccountResources({ page, context, ensureDir, screenshotName, logger = () => {} }) {
    const result = { screenshotError: null, pageCloseError: null, contextCloseError: null };

    if (page) {
        try {
            const photoDir = await ensureDir();
            await page.screenshot({ path: path.join(photoDir, screenshotName), fullPage: true });
        } catch (error) {
            result.screenshotError = error;
            logger(`[cleanup] screenshot failed: ${error.message}`);
        }
    }

    if (page) {
        try {
            await page.close();
        } catch (error) {
            result.pageCloseError = error;
            logger(`[cleanup] page.close failed: ${error.message}`);
        }
    }

    if (context) {
        try {
            await context.close();
        } catch (error) {
            result.contextCloseError = error;
            logger(`[cleanup] context.close failed: ${error.message}`);
        }
    }

    return result;
}

module.exports = {
    buildBrowserLaunchOptions,
    classifyProxyResponse,
    classifyProxyError,
    validateUsersConfig,
    safeAccountLabel,
    finalizeAccountResources
};
