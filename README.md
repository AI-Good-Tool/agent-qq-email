# 云邮盒

多微信账号邮件聚合工作台，使用 React、Ant Design、Vinext 路由与 SQLite 兼容的 Cloudflare D1 构建。

## 已完成

- 多个微信账号统一展示与独立筛选
- 发件人、主题和摘要搜索
- 邮件类型、未读、星标组合筛选
- 扫码会话创建、过期状态与 SQLite 持久化
- 微信账号、邮件、扫码会话三张关系表及查询索引
- 响应式桌面/平板/移动端布局

## 本地运行

```bash
npm install
npm run dev
```

默认运行在 `http://localhost:3000`。首次访问接口会初始化本地 D1/SQLite 数据并写入演示记录。

## 接入真实微信扫码

复制 `.env.example` 为 `.env.local`，填写微信开放平台网站应用的 AppID、密钥和回调地址。扫码接口会自动从演示模式切换为微信开放平台授权地址。

生产接入还需要在回调接口中完成 `code` 换取 access token、拉取用户信息，并将 token 加密后写入 `wechat_accounts.refresh_token_encrypted`。邮件同步应由邮箱服务商 OAuth/IMAP 能力完成；微信扫码本身不会直接授予任意邮箱读取权限。

## 数据结构

- `wechat_accounts`：微信身份和关联邮箱
- `emails`：聚合邮件，按微信账号外键归属
- `qr_sessions`：一次性扫码登录状态

迁移文件位于 `drizzle/`，可运行 `npm run db:generate` 生成新的迁移。
