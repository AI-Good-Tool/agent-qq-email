# 安全说明

## 支持范围

项目仍处于早期阶段，只对 `main` 分支的最新版本提供安全修复。

## 报告安全问题

仓库正式公开前，请由仓库所有者先在 GitHub 启用 **Private vulnerability reporting**。启用后，安全问题应通过 GitHub Security 页面私下报告，不要创建公开 Issue。

报告中建议包含：

- 受影响版本或 commit；
- 复现条件与最小复现步骤；
- 可能影响的数据或权限边界；
- 建议的缓解或修复方式。

## 敏感信息处理

- GitHub Token、OAuth Token、密码或邮件数据一旦被提交，应立即撤销对应凭据并清理 Git 历史。
- 生产环境必须修改默认管理员密码，并使用随机 `DASHBOARD_TOKEN_SECRET`。
- Egg.js 端口 `7101` 只应监听本机，不应直接暴露到公网。
- 不要将 `server/data/`、CLI 系统钥匙串或服务器 `.env.baota` 打包发布。
