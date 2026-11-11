# 云邮盒 · 宝塔面板部署

部署包里已经包含构建好的前端页面，服务器上**不需要**再构建前端，只需要 Python 3.8+ 和 Node.js（运行腾讯官方 `agently-cli` 用）。

## 一、准备

1. 宝塔面板 7.x / 8.x / 9.x，Linux x64。
2. 「软件商店」安装：
   - **Python 项目管理器**（或系统自带 Python 3.8+，推荐 3.10 以上）
   - **Node.js 版本管理器**，安装 Node.js 20 或 22（`agently-cli` 依赖）
   - **Nginx**（用于域名访问和 HTTPS）

## 二、一键安装（推荐，与第四节二选一）

1. 在宝塔「文件」中把压缩包上传到 `/www/wwwroot/`，右键解压，得到 `/www/wwwroot/yunyouhe`。
2. 打开宝塔「终端」，执行：

```bash
cd /www/wwwroot/yunyouhe && bash deploy/baota/install.sh
```

脚本会自动完成：

| 步骤 | 说明 |
| --- | --- |
| 检查 Python | 自动寻找 3.8+ 版本，包括宝塔 Python 项目管理器安装的版本 |
| 安装依赖 | 创建 `.venv` 虚拟环境；默认源失败时自动切换阿里云、清华镜像 |
| 生成配置 | 首次安装生成 `.env`、**随机登录密码**和 Token 密钥（结束时打印出来） |
| 安装 CLI | 找到宝塔安装的 Node.js 后自动 `npm install -g @tencent-qqmail/agently-cli` |
| 启动服务 | 注册 systemd 服务 `yunyouhe`，开机自启、异常自动重启 |
| 健康检查 | 确认 `http://127.0.0.1:1265/health` 可以访问 |

可选参数：

| 参数 | 作用 |
| --- | --- |
| `--port 8080` | 修改端口（默认 1265） |
| `--public` | 监听 `0.0.0.0`，允许通过 `IP:端口` 直接访问 |
| `--user www` | 以其他 Linux 用户运行（默认 root） |
| `--no-service` | 只装依赖、生成配置，不启动 |
| `--config-only` | 只生成 `.env` 并安装 agently-cli（宝塔「Python 项目」的初始化命令用它，见第四节） |
| `--skip-cli` | 跳过 agently-cli 安装 |

## 三、绑定域名

1. 宝塔「网站 → 添加站点」，填写域名，PHP 版本选「纯静态」。
2. 站点设置 →「反向代理」→ 添加，目标 URL 填 `http://127.0.0.1:1265`。
3. 站点设置 →「SSL」申请 Let's Encrypt 证书并开启强制 HTTPS。

完整 Nginx 示例见 `deploy/baota/nginx.conf.example`。服务默认只监听 `127.0.0.1`，不需要在防火墙放行 1265 端口。

## 四、改用宝塔「Python 项目」界面部署（与第二节二选一）

想在宝塔界面里启停、看日志，就用这种方式，**不要**再执行第二节的一键脚本（否则两个进程会抢同一个端口）。

**第 1 步：创建虚拟环境。** 宝塔不允许直接使用系统 Python（会提示「系统Python不能直接作为项目环境，请先基于它创建虚拟环境」）。在「添加Python项目」窗口点「Python环境」右侧的**环境管理**，基于 Python 3.8 或以上版本（例如 3.13.5）新建一个虚拟环境，然后回到下拉框选中它。

**第 2 步：按下表填写：**

| 选项 | 填写 |
| --- | --- |
| 项目名称 | `yunyouhe` |
| Python环境 | 第 1 步创建的虚拟环境 |
| 启动方式 | **命令行启动**（不要选 uwsgi / gunicorn） |
| 项目路径 | `/www/wwwroot/yunyouhe`（解压后的根目录，不是 `deploy/baota`） |
| 启动命令 | `python3 run.py` |
| 环境变量 | 无（程序会自动读取项目根目录的 `.env`） |
| 启动用户 | `root` |
| 安装依赖包 | `/www/wwwroot/yunyouhe/requirements.txt` |
| 项目初始化命令（更多设置里） | `bash deploy/baota/install.sh --config-only` |

项目初始化命令会生成 `.env`（含随机登录密码）并安装 agently-cli，**不会**再建一套虚拟环境或启动进程。登录密码在 `/www/wwwroot/yunyouhe/.env` 的 `DASHBOARD_PASSWORD` 里查看；如果初始化命令没有执行，也可以在终端手动运行一次同样的命令，然后在宝塔里重启项目。

**第 3 步：绑定域名。** 按第三节添加站点并反向代理到 `http://127.0.0.1:1265`；或者使用 Python 项目自带的「外网映射」功能绑定域名。

注意：
- 只能运行**一个**进程，扫码授权会话保存在进程内存里，所以不要用 gunicorn / uwsgi 多 worker。
- `install.sh` 里提到的 `.venv`、systemd 服务只属于第二节的一键方式，用宝塔界面部署时用不到。

## 五、日常管理

```bash
bash deploy/baota/yunyouhe.sh status    # 查看状态
bash deploy/baota/yunyouhe.sh restart   # 修改 .env 后重启生效
bash deploy/baota/yunyouhe.sh logs      # 查看日志
```

- 修改登录密码：编辑 `.env` 中的 `DASHBOARD_PASSWORD`，然后重启。
- 首次登录后，点击「扫码添加微信」连接邮箱。授权页需要在**电脑**上打开，用手机微信扫码。

## 六、升级与备份

- 升级：先备份 `data/` 和 `.env`，解压新包覆盖到同一目录（不要删除 `data/`、`.env`、`.venv/`），再执行一次 `bash deploy/baota/install.sh`。
- 备份：定期备份 `data/` 目录（邮件索引、标签、星标、登录密钥）。
- 从旧版（Node.js / Egg.js 版）迁移：把旧项目的 `server/data/agent-mail.sqlite` 和 `server/data/dashboard-token.secret` 复制到新项目的 `data/` 目录后重启，表结构完全兼容。旧版通过命令行授权的 `codex` 工作区需要服务以同一个 Linux 用户运行。

## 七、常见问题

| 现象 | 处理 |
| --- | --- |
| 扫码提示「找不到 agently-cli」 | 安装 Node.js 后执行 `npm install -g @tencent-qqmail/agently-cli`，再运行一次安装脚本，它会把 CLI 路径写入 `.env` |
| 健康检查失败 | `tail -n 50 logs/yunyouhe.log` 查看原因，常见是端口被占用（`--port` 换一个） |
| 邮箱显示「已失效」 | 授权过期，在「管理邮箱账号」里点「重新扫码」，原账号的标签和星标会保留 |
| 页面能打开但接口 502 | 检查反向代理目标端口是否与 `.env` 中的 `PORT` 一致 |
