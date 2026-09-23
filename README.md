# MarketIntel AI · 市场调研

**AI 驱动的市场调研与可行性分析平台。** 输入一个产品方向，平台跑一条 6 步 AI 流水线（市场规模 → 竞品 → 用户画像 → 搜索趋势 → 进入壁垒 → 综合结论），输出一份结构化、"玻璃盒"式的调研报告，附机会评分和 Go / No-Go 建议。报告生成后，还可以就这份报告向 AI 提问，或让 AI 按指令改写某个分区，改动可预览 diff、确认后写入、随时回滚。

> 技术栈：**React 18 + TypeScript + Vite + Tailwind**（Aura 浅色 UI）· **Node + Express + Prisma + PostgreSQL（Neon）** · 部署：**Vercel + Fly.io + Neon**

---

## ✨ 功能

### 调研流水线
- **6 步调研** — 市场规模（TAM/SAM/SOM）· 竞品 · 用户画像与痛点 · 搜索趋势 · 进入壁垒 · 加权结论。作为进程内后台任务运行，前端实时显示每一步进度。
- **多模型路由**，每次调研可选方案：

  | 方案 | 引擎 | 说明 |
  |------|------|------|
  | **Economy** | DeepSeek 全程 | 最便宜；无联网，仅依赖模型先验 |
  | **Balanced** | Perplexity（联网）+ DeepSeek | 有真实来源与引用 |
  | **Premium** | Perplexity（联网）+ Claude | 质量最高 |

- **报告** — 机会评分拆解、TAM/SAM/SOM 条形图、**竞品（可点击官网）+ 价格对比图**、付费意愿/定价情报、兴趣趋势、进入壁垒、数据来源矩阵。
- **重跑与对比** — 以相同方案/模板重跑一次调研，两份报告并排对比。
- **成本与盈亏平衡** — 填入月成本和计划定价，算出盈亏平衡客户数。
- **Markdown 导出** 任意已完成报告。

### AI 助手
- **Ask AI 对话** — 通用问答，支持流式输出（SSE）、可选联网检索（Perplexity，附来源链接）。**对话历史落库**，可在侧栏查看、重命名、删除，URL 形如 `/chat/:conversationId`。
- **报告助手**（报告页侧边抽屉）
  - **提问**：以当前报告为上下文作答，报告未覆盖的内容会明确标注为推断。报告问答与通用对话分开存储。
  - **改写**：用自然语言指令让 AI 重写某个分区（如"补充两家欧洲竞品""结论改成更保守的口径"）。流程是：生成提案 → 查看 JSON diff → 确认后才写入报告 → 可回滚。新增条目类指令只让模型产出新条目、由代码追加，避免模型重抄时漏掉原有条目；输出一律经原 zod schema 校验。

### 平台基础（来自可复用的 SaaS 模板）
JWT 双 token + refresh 轮换、邮箱验证、密码策略、**带 2FA 的管理后台**（用户 / 日志 / 登录记录 / 支付 / 反馈）、结构化日志、限流、Helmet CSP/HSTS、`/api/health` 探针。可选支付：Stripe（默认），另有微信 / 支付宝脚手架。

字体和图标（Inter、Hanken Grotesk、JetBrains Mono、Material Symbols）已通过 npm 本地自托管，不依赖 Google Fonts，离线或网络受限时也能正常显示。

---

## 📁 目录结构

```
.
├── backend/                     Express + Prisma API
│   ├── prisma/
│   │   ├── schema/              00-core · 10-payment · 90-business-research · 91-business-chat
│   │   ├── migrations/
│   │   └── seed.js
│   ├── src/
│   │   ├── routes/              auth, admin*, research, chat, payments, user …
│   │   ├── services/
│   │   │   ├── ai/              deepseek · perplexity · claude · router · chat
│   │   │   └── research/        orchestrator · prompts · schemas · markdown · revise
│   │   ├── middleware/  config/  utils/  constants/
│   │   └── index.js
│   └── env.example
├── frontend/                    React + Vite
│   └── src/
│       ├── pages/               Login/Register, Projects, Library, Chat, ResearchNew,
│       │   │                    ProjectWorkspace, ResearchCompare …
│       │   ├── research/        报告面板 · CostPanel
│       │   └── admin/           管理后台
│       ├── components/research/ AppShell · ReportAssistant · jsonDiff · UI 原子组件
│       └── api/                 axios 客户端 · research · chat
├── research_agent_UI/           设计系统与 HTML 原型
├── deploy/                      部署说明
└── docs/                        模块地图
```

---

## 🚀 本地运行

**前置条件：** Node 18+、一个 PostgreSQL 数据库（免费的 [Neon](https://console.neon.tech) 即可）、`DEEPSEEK_API_KEY`（Economy 方案必需）。

### 1. 后端 → http://localhost:4000

```bash
cd backend
npm install
cp env.example .env          # 按下文填写
npx prisma generate
npx prisma migrate deploy     # 建表（开发中改 schema 时用 `migrate dev`）
npm run seed                  # 写入管理员 + 测试账号
npm run dev                   # → http://localhost:4000/api/health  →  {"db":"ok"}
```

### 2. 前端 → http://localhost:5173

```bash
cd frontend
npm install
npm run dev                   # Vite 会把 /api 代理到 http://localhost:4000
```

打开 http://localhost:5173 即可登录。

### 测试账号

| 账号 | 登录名 | 密码 | 用途 |
|------|--------|------|------|
| 标准用户 | `t@t.com` | `Test1234` | 调研应用（`/login`） |
| 免费用户 | `free@example.com` | `Test1234` | 调研应用（`/login`） |
| 超级管理员 | `.env` 中的 `ADMIN_EMAIL` | `ADMIN_INITIAL_PASSWORD` | 管理后台（`/admin/login`，2FA） |

> 测试账号只在 `NODE_ENV != production` 时写入。**首次登录后请立即修改管理员密码。** 本地未配置 SMTP 时，管理员 2FA 验证码会打印在后端终端（找 `📧` 那一行）。

---

## 🔧 环境变量（`backend/.env`）

| 变量 | 必需 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | 带 `?sslmode=require` 的 Postgres URL。Neon 请用 **Direct** 主机（不带 `-pooler`），pooler 主机会导致 `prisma migrate` 失败。 |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ✅ | 32 位以上且互不相同。可用 `openssl rand -hex 48` 生成。 |
| `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` | ✅ | 超级管理员初始化（`npm run seed` 使用）。 |
| `DEEPSEEK_API_KEY` | ✅ | Economy 方案与 Ask AI 默认引擎。 |
| `PERPLEXITY_API_KEY` | ⛅ | Balanced / Premium 方案及 Ask AI 联网检索。 |
| `ANTHROPIC_API_KEY` | ⛅ | Premium 方案（Claude 推理）。 |
| `FRONTEND_URL` | ✅ | CORS 与邮件链接（默认 `http://localhost:5173`）。 |
| `SMTP_*` | 生产 | 邮箱验证 / 2FA / 重置密码。未配置时降级为打印到终端。 |
| `STRIPE_*` / `WECHAT_*` / `ALIPAY_*` | 可选 | 支付；未配置时返回 mock / 503。 |

`.env` 已被 git 忽略，**切勿提交真实密钥**。完整注释见 `backend/env.example`。

---

## 🔌 主要 API

所有 `/api/research/*` 和 `/api/chat/*` 都需要登录，并按当前用户隔离数据。

**调研**
```
GET    /api/research                              当前用户的报告列表
POST   /api/research/start                        开始调研 → { reportId }
GET    /api/research/:id/status                   轮询流水线进度
GET    /api/research/:id/result                   已完成报告 + 成本输入
PATCH  /api/research/:id                          保存成本 / 盈亏平衡输入
GET    /api/research/:id/export?format=md         导出 Markdown
DELETE /api/research/:id                          删除报告
```

**报告改写**
```
POST   /api/research/:id/revise                   按指令生成分区改写提案（不写库）
GET    /api/research/:id/revisions                改写历史
POST   /api/research/:id/revisions/:revId/apply   应用提案，写回报告
POST   /api/research/:id/revisions/:revId/rollback 回滚到改前内容
DELETE /api/research/:id/revisions/:revId         丢弃提案
```

**Ask AI**
```
POST   /api/chat                                  流式问答（SSE），带 reportId 即为报告问答
GET    /api/chat/conversations[?reportId=]        会话列表
GET    /api/chat/conversations/:id                会话全部消息
PATCH  /api/chat/conversations/:id                重命名
DELETE /api/chat/conversations/:id                删除
```

**其他**
```
GET    /api/health                                存活 + 数据库状态
POST   /api/auth/login | /register                JWT 认证
```

---

## ☁️ 部署

- **前端 → Vercel。** `vercel.json` 会把 `/api/*` 代理到后端。
- **后端 → Fly.io。** 修改 `backend/fly.toml` 中的 `app`，再 `fly launch` / `fly deploy`；`release_command` 会执行 `prisma migrate deploy`。
- **数据库 → Neon**（建议开发 / 生产分支分开）。
- **Stripe webhook**（`/api/pay/stripe/webhook`）必须接收原始 body 并保留 `Stripe-Signature` 请求头。

详见 [`deploy/README.md`](./deploy/README.md)。

---

## 🔒 安全基线

JWT 双 token + refresh 轮换/吊销 · 实时账号状态校验 · 邮箱验证 · 密码策略 · 管理员 2FA + 敏感操作二次认证 · 可选管理后台 IP 白名单 · 分级限流 · Helmet CSP/HSTS · 优先软删除 · 带脱敏的结构化日志 · 优雅停机 · `/api/health` · AdminLog 审计日志。

---

## 📝 说明

- Economy 方案的数字是模型估算，没有实时引用，只能当数量级参考；需要有来源的数据请用 Balanced / Premium。
- AI 改写只在你点"应用"后才会修改报告，每次应用都保留改前内容，可随时回滚。
- 本地默认关闭后台 worker（`RUN_BG_WORKERS=false`），调研流水线在进程内运行。

## License

见 [LICENSE](./LICENSE)。
