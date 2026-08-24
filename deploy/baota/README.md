# 云邮盒 · 宝塔面板部署

这个压缩包已经包含构建后的前端 `dist/`，部署时不会携带开发电脑上的邮箱凭据、SQLite 数据、登录密钥或 `.env.local`。

## 1. 服务器要求

- Linux x64
- 宝塔面板、Nginx、PM2 管理器
- Node.js 24 LTS（最低 Node.js 22.13）
- 域名已经解析到服务器

只对公网开放 80 和 443 端口。Egg.js 的 7101 端口必须保持仅本机访问。

## 2. 解压和安装

把压缩包上传到例如 `/www/wwwroot/yunyouhe` 并解压，然后执行：

```bash
cd /www/wwwroot/yunyouhe
npm ci --omit=dev
npm install -g @tencent-qqmail/agently-cli pm2
mkdir -p server/data server/logs
```

确保运行 PM2 的 Linux 用户对 `server/data` 和 `server/logs` 有读写权限。

## 3. 在服务器登录 Agent Mail

必须使用“实际运行 PM2 的同一个 Linux 用户”执行授权，否则服务读取不到 CLI 凭据：

```bash
AGENTLY_WORKSPACE=codex agently-cli auth login
AGENTLY_WORKSPACE=codex agently-cli +me
```

先确认 `+me` 能返回真实邮箱，再继续启动应用。部署包不会复制开发电脑的 OAuth 凭据，新增的微信也可以在应用启动后通过“扫码添加新微信”连接。

## 4. 配置登录账号

```bash
cp deploy/baota/env.baota.example .env.baota
chmod 600 .env.baota
```

编辑 `.env.baota`，把 `SITE_ORIGIN` 换成正式 HTTPS 域名。默认控制台账号为 `admin`，默认密码为 `abadmin123ab`，正式使用前建议修改密码。

不填写 `DASHBOARD_TOKEN_SECRET` 时，Egg.js 会首次启动时生成随机密钥并保存到 `server/data/dashboard-token.secret`，后续重启不会让已登录 token 失效。

## 5. 用宝塔“Node 项目”启动（推荐）

在宝塔面板进入 **网站 → Node 项目 → 添加项目**，填写：

| 选项 | 填写内容 |
| --- | --- |
| 项目名称 | `yunyouhe` |
| 项目根目录 | `/www/wwwroot/yunyouhe` |
| Node 版本 | `v24.14.1` 或其他 Node.js 24 LTS |
| 启动方式/启动命令 | `npm run start:baota` |
| 运行端口 | `1265` |
| 运行用户 | 执行 Agent Mail 扫码授权的同一个用户，通常为 `www` |
| 开机启动 | 开启 |

`start:baota` 是统一启动器：宝塔只管理这一个项目，它会同时启动前端 `1265` 和 Egg.js `7101`，任意一个异常退出时会一起退出，由宝塔自动重启。不要再单独添加第二个 Egg.js 项目，也不要再运行 `ecosystem.config.cjs`，否则端口会冲突。

如果“启动方式”只能选择 `package.json` 中的脚本，请选择 `start:baota`；如果是自由输入框，则填写完整命令 `npm run start:baota`。

项目启动后检查：

```bash
curl http://127.0.0.1:7101/health
curl -i http://127.0.0.1:1265/api/session
```

第一个请求应返回 HTTP 200；第二个请求未携带 token，应返回 HTTP 401。

## 6. 命令行 PM2 启动（备选）

只有不使用宝塔“Node 项目”管理时，才执行：

```bash
chmod +x deploy/baota/start.sh
./deploy/baota/start.sh
pm2 status
```

## 7. 宝塔反向代理

在宝塔创建一个普通网站并申请 SSL 证书，把反向代理目标设置为：

```text
http://127.0.0.1:1265
```

`deploy/baota/nginx.conf.example` 提供了完整 Nginx 示例。不要把 7101 端口直接反向代理或开放到公网。

## 8. 更新与备份

- 更新代码后只需在项目根目录重新运行 `npm ci --omit=dev`，再执行启动脚本。
- 定期备份 `server/data/`，其中包含邮件索引、邮箱标签、星标和登录 token 密钥。
- 官方 OAuth 凭据由 Agent Mail CLI 管理；迁移服务器时建议在新服务器重新扫码授权。
