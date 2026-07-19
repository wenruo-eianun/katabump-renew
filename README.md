# Katabump Server Auto-Renewal Tool

[English Version](README_EN.md) | [中文说明](README.md)

这是一个用于 **KataBump 服务器自动续期检查 / 自动续期执行** 的 GitHub Actions 自动化项目。

项目会在定时任务中登录 KataBump，进入服务器详情页，尝试执行 Renew，并保存运行截图。它适合用于自己的 KataBump 账号和服务器，减少忘记续期导致实例过期的风险。

> 使用前请确保你有权操作对应 KataBump 账号，并遵守 KataBump、GitHub Actions、代理服务商的使用规则。若平台要求人工验证或人工确认，请以平台要求为准。

---

## ✅ 当前状态

当前版本已经支持：

- GitHub Actions 云端定时运行
- Node.js 24 运行环境
- 多账号批量处理
- `USERS_JSON` Secret 配置账号
- 可选 Telegram 通知
- 自动上传运行截图 Artifacts
- Webshare 代理列表自动下载
- 从 Webshare 10 个代理中随机选择一个出口
- 自动写入 `HTTP_PROXY` / `HTTPS_PROXY`
- 代理出口 IP 检查
- 识别 KataBump “还没到续期时间”的状态
- 到续期窗口后继续由 Cron 自动重试

---

## 🚀 GitHub Actions 云端运行（推荐）

这是最省心的方式。配置一次后，GitHub Actions 会每天自动运行。

### 1. Fork 仓库

先 Fork 本仓库到你自己的 GitHub 账号。

---

### 2. 配置 GitHub Secrets

进入你的仓库：

```text
Settings → Secrets and variables → Actions → New repository secret
```

至少需要添加下面这个 Secret：

### `USERS_JSON` 必填

格式必须是 JSON 数组，建议压缩成一行：

```json
[{"username":"your_email@example.com","password":"your_password"}]
```

多账号示例：

```json
[{"username":"account1@example.com","password":"password1"},{"username":"account2@example.com","password":"password2"}]
```

---

## 🌐 Webshare 代理配置（推荐）

地址：https://www.webshare.io/?referral_code=sfojw2m7nss0

如果 GitHub Actions 的默认出口 IP 不稳定，或者访问 KataBump 时容易触发限制，推荐使用 Webshare 代理列表。

当前 workflow 支持下面这个 Secret：

### `WEBSHARE_PROXY_LIST_URL` 可选，但推荐

这个值填写 Webshare 的代理列表下载链接。

Webshare 下载出来的代理列表格式一般是：

```text
IP:PORT:USERNAME:PASSWORD
```

例如：

```text
31.59.20.176:6754:username:password
```

代理输入格式已冻结为以下三种之一：

```text
HOST:PORT
HOST:PORT:USERNAME:PASSWORD
http://USERNAME:PASSWORD@HOST:PORT
```

其中 `PORT` 必须是 1 到 65535 的十进制端口。HTTP URL 中的用户名和密码按 URL 编码填写；不带 `http://` 的行只按 Webshare 格式解释，不会猜测为其他语法。路径、查询参数、片段、多余字段以及包含空白、`@` 或反斜杠的主机会被拒绝。

workflow 会自动执行：

```text
下载 Webshare 代理列表
↓
随机选择一条代理
↓
转换成 http://USERNAME:PASSWORD@IP:PORT
↓
写入 HTTP_PROXY / HTTPS_PROXY
↓
运行 action_renew.js
```

这样 Webshare 后续更换代理 IP 时，通常不需要手动更新 GitHub Secret。只要下载链接仍然有效，Actions 每次都会拉取最新代理列表。

> 注意：`WEBSHARE_PROXY_LIST_URL` 里包含下载 token，不要写进代码，不要公开贴到 README、Issue 或日志里，只放到 GitHub Secrets。

---

## 📬 Telegram 通知（可选）

如果希望续期成功、暂未到续期时间、登录失败等状态推送到 Telegram，可以添加：

### `TG_BOT_TOKEN`

从 Telegram 的 `@BotFather` 获取。

### `TG_CHAT_ID`

你的 Telegram 用户 ID 或群组 ID。

如果不配置，脚本会跳过 Telegram 通知，但 Actions 日志和截图仍然会保留。

---

## ⏰ 运行时间

当前 workflow 默认每天运行一次：

```yaml
- cron: '0 0 * * *'
```

对应时间：

```text
UTC 00:00
北京时间 08:00
```

你也可以进入 GitHub 仓库的 **Actions** 页面，手动点击：

```text
Run workflow
```

立即测试一次。

---

## 🧪 如何判断运行成功

进入 GitHub Actions 的运行日志，重点看这些步骤：

### 1. Webshare 代理选择

正常日志类似：

```text
Downloading Webshare proxy list...
Proxy list downloaded. Total lines: 10
Selected Webshare proxy: 191.96.254.138:6185
```

### 2. 代理检测

正常日志类似：

```text
Direct IP:
20.xx.xx.xx
Proxy IP:
191.96.xxx.xxx
```

如果 `Proxy IP` 检测失败，但后续 `action_renew.js` 显示代理连接成功，也可以继续观察后续结果。

### 3. 脚本检测到代理

正常日志类似：

```text
[代理] 检测到配置: 服务器=http://IP:PORT, 认证=是
[代理] 正在验证代理连接...
[代理] 连接成功！
```

这说明代理已经成功传入 `action_renew.js`。

---

## ⏳ “还没到续期时间”不是失败

如果日志出现：

```text
You can't renew your server yet. You will be able to as of 30 June
用户处理完成 | 状态: not_ready
```

这表示脚本已经成功登录、进入服务器页面并提交 Renew 请求，但 KataBump 后端判断当前还没到允许续期的时间窗口。

这种情况不是脚本失败。等待下一次 Cron 自动运行即可。

到可续期日期后，正常续期成功时通常会看到类似：

```text
Expiry 已变化: 2026-07-01 → 2026-07-05
续期成功
```

---

## 📸 截图与调试文件

每次运行都会上传截图 Artifact。

在 Actions 运行详情页底部可以看到：

```text
Artifacts → screenshots
```

里面可能包含：

```text
username.png
not_ready_after_x.png
not_ready_after_x.html
captcha_required_x.png
modal_unknown_state_x.png
error_x.png
```

这些文件用于排查登录、续期窗口、页面状态变化等问题。

---

## 💻 本地运行（Windows / Mac / Linux）

本地运行适合调试和观察页面行为。

### 1. 安装 Node.js

建议 Node.js 版本：

```text
Node.js 20+
推荐 Node.js 24
```

### 2. 安装依赖

在项目根目录运行：

```bash
npm ci
```

### 3. 配置账号

复制模板：

```text
login.json.template → login.json
```

填写：

```json
[
  {
    "username": "your_email@example.com",
    "password": "your_password"
  }
]
```

`login.json` 已加入 `.gitignore`，不会被提交到 GitHub。

### 4. 本地代理（可选）

如果本地需要代理，可以设置 `HTTP_PROXY` 环境变量。

PowerShell：

```powershell
$env:HTTP_PROXY="http://user:pass@127.0.0.1:7890"
node renew.js
```

CMD：

```cmd
set HTTP_PROXY=http://user:pass@127.0.0.1:7890
node renew.js
```

无代理直接运行：

```bash
node renew.js
```

---

## 🗂️ 项目结构

```text
.
├── action_renew.js                  # GitHub Actions 环境使用的续期脚本
├── renew.js                         # 本地运行脚本
├── login.json.template              # 本地账号模板
├── package.json
├── README.md                        # 中文说明
├── README_EN.md                     # 英文说明
└── .github/workflows/renew.yml      # GitHub Actions 定时任务
```

---

## 🔐 安全注意事项

请不要提交或公开以下内容：

```text
USERS_JSON
KataBump 邮箱密码
WEBSHARE_PROXY_LIST_URL
HTTP_PROXY 完整链接
代理用户名和密码
TG_BOT_TOKEN
TG_CHAT_ID
login.json
```

推荐全部放在 GitHub Secrets 中。

如果你曾经把 Webshare 下载链接、代理账号密码或 KataBump 密码公开贴出，建议立即去对应平台重新生成或修改。

---

## 🧯 常见问题

### 1. `WEBSHARE_PROXY_LIST_URL is empty`

说明你没有配置 Webshare 下载链接。脚本会不使用 Webshare 代理，继续直连运行。

### 2. `Proxy line format invalid`

说明 Webshare 下载到的代理列表不是：

```text
IP:PORT:USERNAME:PASSWORD
```

请检查 Webshare 下载链接的格式设置。

### 3. `用户处理完成 | 状态: not_ready`

说明还没到 KataBump 允许续期的时间。不是失败，等下一次 Cron 即可。

### 4. `登录失败`

检查：

```text
USERS_JSON 是否是合法 JSON
邮箱是否正确
密码是否正确
账号是否需要人工登录确认
```

### 5. Actions 有 Node 20 弃用提示

当前 workflow 已使用：

```yaml
node-version: '24'
```

如果你的 fork 里仍然看到 Node 20，请检查 `.github/workflows/renew.yml` 是否已经同步更新。
