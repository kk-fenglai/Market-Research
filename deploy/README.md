# M9 部署模块

部署相关文件（就近放在各自构建上下文里，本目录只做索引）：

| 文件 | 作用 |
|------|------|
| `backend/Dockerfile` | 后端镜像（多阶段，Debian slim，Prisma 引擎开箱即用） |
| `backend/fly.toml` | Fly.io 配置：常驻机 + `/api/health` 探活 + `release_command` 跑迁移 |
| `backend/env.example` | 后端环境变量模板（复制为 `.env`） |
| `vercel.json`（根） | 前端构建 + `/api/*` 反代到后端 |
| `frontend/vercel.json` | 仅部署 frontend 子目录时用 |

## 必须替换的占位符
- `market-research` → 你的应用名：`backend/fly.toml`(app)、`vercel.json` ×2(fly.dev 反代域名)、`frontend/src/api/baseUrl.ts`、`backend/env.example`(SMTP_FROM)。
- `primary_region`（fly.toml）→ 最近区域（`fly platform regions`）。

## 部署顺序
1. **DB**：Neon 建 project，dev/prod 各一 branch，拿 `DATABASE_URL`（Direct host，含 `sslmode=require`）。
2. **后端**：`cd backend && fly launch`（首次）/ `fly deploy`；用 `fly secrets set KEY=val` 注入 `.env` 里的密钥。
3. **前端**：Vercel 导入仓库，框架选 Vite，确认反代域名指向 Fly。
4. **Stripe**（如启用）：Dashboard 建 recurring Price 填到后台 `Price.stripePriceId`；加 webhook endpoint `/api/pay/stripe/webhook`；Nginx/反代**不要** strip raw body 或 `Stripe-Signature` 头。

## 业务示例相关（换业务时清理）
`Dockerfile` 末尾被注释的 `assets` / `eng.traineddata` / `content` 段、`fly.toml` 末尾的 `[mounts]` 录音卷
都是 DELF 业务（OCR/听力/口语录音）专用，纯平台不需要。
