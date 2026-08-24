# 参与贡献

感谢你关注云邮盒。当前项目仍处于早期阶段，建议先通过 Issue 说明问题、使用场景或功能方案，再提交较大的代码改动。

## 开发流程

1. Fork 仓库并从 `main` 创建功能分支。
2. 在根目录运行 `npm install` 安装前端与 `server` workspace 依赖。
3. 保持改动聚焦，不要把重构、格式调整和功能修改混在同一个提交中。
4. 提交前运行：

```bash
npm run lint
npm run build
npm audit --omit=dev
```

## 提交内容要求

- 不得提交真实邮件、邮箱地址、微信账号或联系人信息。
- 不得提交 `.env`、SQLite 数据库、OAuth 凭据、GitHub Token 或生产密码。
- 修复问题时请说明复现步骤、原因、修改内容和验证结果。
- UI 改动建议附带匿名化截图，并覆盖常见桌面宽度。
- 新增环境变量时同步更新 README 和部署示例。

## Commit 与 Pull Request

Commit 信息建议使用简短的英文祈使句，例如：

```text
Fix mailbox selection persistence
Add trash folder actions
Document BaoTa deployment
```

Pull Request 应说明用户可见变化、兼容性风险以及是否涉及数据结构或部署配置。
