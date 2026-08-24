# 云邮盒

Agent Mail 聚合工作台，使用 React、Ant Design、Vinext、Egg.js 4 与 SQLite 构建。邮件能力完全通过腾讯官方 `agently-cli` 调用。

## 已完成

- Agent Mail 邮箱别名统一展示与独立筛选
- 发件人、主题和摘要搜索
- 邮件按接收时间倒序排列，点击行后在当前页面读取完整正文和附件信息
- 邮件类型、未读、星标组合筛选
- 官方 CLI 设备 OAuth 登录、当前页二维码、授权状态轮询与 SQLite 快照
- 官方接口分页读取全部邮件，CLI 暂时不可用时回退到最近一次 SQLite 快照
- 响应式桌面/平板/移动端布局

## 本地运行

```bash
npm install
npm run dev
```

先按官方文档安装并授权 CLI：

```bash
npm install -g @tencent-qqmail/agently-cli
AGENTLY_WORKSPACE=codex agently-cli auth login
AGENTLY_WORKSPACE=codex agently-cli +me
```

然后分别启动 Egg.js 服务和前端：

```bash
cd server && npm install && npm run dev
# 新终端，在项目根目录
npm install && npm run dev
```

Egg.js 默认监听 `7101`，前端默认运行在 `http://localhost:3000`。服务固定使用 CLI 的 `codex` 凭据工作区，避免从不同终端启动时切换账号。Egg.js 会调用 `agently-cli +me` 和 `agently-cli message +list`，并把真实邮件快照保存在 `server/data/agent-mail.sqlite`；不会写入演示账号或邮件。

## 登录方式

点击“扫码添加”时，Egg.js 会执行官方 `agently-cli auth login`，把 CLI 输出的原始 Agent Mail 授权 URL 转成二维码，并轮询 CLI 的完成状态。不需要微信开放平台 AppID 或 AppSecret。OAuth token 由官方 CLI 保存在系统钥匙串中，应用不会读取、复制或上传 token。

## 数据结构

- `server/data/agent-mail.sqlite`：Egg.js 保存的真实账号与邮件快照
- 系统钥匙串：官方 CLI 管理 OAuth 凭据与自动刷新

本机 Egg.js 仅监听 `127.0.0.1`，不会把 CLI 或系统钥匙串暴露到公网。托管网页若要读取真实邮件，需要另行部署一个受身份验证保护的 Egg.js 服务；纯 Cloudflare Worker 无法直接执行本机 CLI。
