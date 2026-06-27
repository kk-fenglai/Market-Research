# saas-starter · 可复用建站脚手架

从 `delf-B2-website` 抽取的通用 SaaS 骨架：**登录 / 支付 / 后台 / 日志 / 邮件 / 反馈 / 部署** 开箱即用，
DELF 考试业务作为**可替换示例**保留。下次建站 clone 即用。

技术栈：React 18 + TS + Vite + Ant Design（前端） · Node + Express + Prisma + PostgreSQL（后端） · Fly.io + Vercel + Neon（部署）。

## 目录
```
saas-starter/
├── backend/          Express + Prisma
│   ├── prisma/schema/   00-core / 10-payment / 90-business-delf  ← 按模块分文件
│   ├── src/             routes / services / middleware / utils / constants / config
│   ├── Dockerfile  fly.toml  env.example
├── frontend/         React + Vite（vercel.json）
└── docs/模块地图.md   ← 每个模块的文件归属 + 删除清单（先看这个）
```

## 下次建站 5 步
1. **改名**：全局替换占位符 `market-research`（在 `fly.toml` / 两个 `vercel.json` / `frontend/src/api/baseUrl.ts` / `env.example` 等）。
2. **填配置**：`cd backend && cp env.example .env`，填 `DATABASE_URL`(Neon) + `openssl rand -hex 48` 生成两个 `JWT_*` + `SMTP_*` + `ADMIN_EMAIL`/`ADMIN_INITIAL_PASSWORD`（要支付再填 `STRIPE_*`）。
3. **业务取舍**：保留 DELF 示例练手，或按 `docs/模块地图.md` 的「删除业务清单」清成纯平台，再加自己的 module。改套餐档位见 `backend/src/constants/planMatrix.js` 顶部「★ 套餐切口」。
4. **起后端**：
   ```bash
   cd backend && npm install
   npx prisma generate
   npx prisma migrate dev        # 首次建表（删过业务可加 --name init）
   npm run seed                  # upsert 超管（ADMIN_EMAIL）
   npm run dev                   # → http://localhost:4000  /api/health
   ```
5. **起前端**：`cd frontend && npm install && npm run dev` → http://localhost:5173

## 部署（M9）
- 后端：Fly.io。改好 `fly.toml` 的 `app` 名后 `fly launch`/`fly deploy`；`release_command` 自动跑 `prisma migrate deploy`。
- 前端：Vercel。`vercel.json` 已把 `/api/*` 反代到 `https://market-research.fly.dev`。
- DB：Neon（dev/prod 两个 branch）。
- Stripe webhook：`/api/pay/stripe/webhook` 必须透传 raw body + 保留 `Stripe-Signature` 头。

## 安全基线（已内置，M1/M3/M7）
JWT 双令牌 + refresh 轮换/撤销 · 账户状态实时校验 · 邮箱验证 · 密码策略 · 管理员 2FA + 敏感操作二次确认 ·
IP 白名单 · 分级限流 · Helmet CSP/HSTS · 软删除优先 · 结构化日志脱敏 · 优雅关停 · `/api/health` 探活 · AdminLog 审计。

> 详细模块边界、依赖、删除/替换步骤见 **`docs/模块地图.md`**。
> 品牌名当前仍是示例 `DELFluent`（散落在 i18n / 页面文案）——换业务时按需替换。
