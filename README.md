# MarketIntel AI · 市场调研

**AI-driven market research & feasibility analysis.** Enter a product direction and the platform runs a 6-step AI pipeline — market sizing, competitors, user personas, search trends, entry barriers, conclusion — then renders a structured, "glass-box" report with an opportunity score and a Go / No-Go recommendation.

> Stack: **React 18 + TypeScript + Vite + Tailwind** (Synthetica dark UI) · **Node + Express + Prisma + PostgreSQL (Neon)** · Deploy on **Vercel + Fly.io + Neon**.

---

## ✨ Features

- **6-step research pipeline** — market size (TAM/SAM/SOM) · competitors · user personas & pain points · search trends · entry barriers · weighted conclusion. Runs as an in-process fire-and-forget job with live step-by-step progress.
- **Multi-model AI routing** — pick a plan per run:
  | Plan | Engine | Notes |
  |------|--------|-------|
  | **Economy** | DeepSeek end-to-end | Cheapest; no live web access (model priors only) |
  | **Balanced** | Perplexity (web) + DeepSeek | Real sources & citations |
  | **Premium** | Perplexity (web) + Claude | Highest quality |
- **Rich report** — opportunity score breakdown, TAM/SAM/SOM bars, **competitors with clickable official sites + a price-comparison chart**, WTP/pricing intelligence, interest-over-time trend, entry barriers, data-source matrix.
- **Re-run & compare** — re-run a study (keeps plan/template) and diff two reports side by side.
- **Cost & break-even panel** — enter your monthly costs + planned price to see break-even customers.
- **Markdown export** of any finished report.
- **Platform foundation** (from a reusable SaaS starter) — JWT dual-token auth with refresh rotation, email verification, password policy, **admin console with 2FA** (users / logs / login history / payments / feedback), structured logging, rate limiting, Helmet CSP/HSTS, `/api/health` probe.
- **Payments (optional)** — Stripe (default), plus WeChat / Alipay scaffolding.

---

## 📁 Repository layout

```
.
├── backend/                 Express + Prisma API
│   ├── prisma/schema/       00-core · 10-payment · 90-business-research
│   ├── src/
│   │   ├── routes/          auth, admin*, research, payments, user …
│   │   ├── services/
│   │   │   ├── ai/          deepseek · perplexity · claude · router
│   │   │   └── research/    orchestrator · prompts · schemas · markdown
│   │   ├── middleware/  config/  utils/  constants/
│   │   └── index.js
│   └── env.example
├── frontend/                React + Vite (Synthetica dark UI)
│   └── src/
│       ├── pages/           Login/Register, Projects, ResearchNew,
│       │   ├── ProjectWorkspace, ResearchCompare
│       │   ├── research/    Dashboard panels · CostPanel
│       │   └── admin/       platform admin console
│       ├── components/research/  AppShell · AuthShell · dark atoms
│       └── api/             axios clients + research API
├── research_agent_UI/       Synthetica design system + HTML mockups (DESIGN.md)
└── docs/                    module map & notes
```

---

## 🚀 Quick start

**Prerequisites:** Node 18+, a PostgreSQL database (a free [Neon](https://console.neon.tech) project works), and a `DEEPSEEK_API_KEY` (Economy plan).

### 1. Backend → http://localhost:4000

```bash
cd backend
npm install
cp env.example .env          # then fill in the values below
npx prisma generate
npx prisma migrate deploy     # create tables  (use `migrate dev` in active development)
npm run seed                  # upsert admin + demo/free test accounts
npm run dev                   # → http://localhost:4000/api/health  →  {"db":"ok"}
```

### 2. Frontend → http://localhost:5173

```bash
cd frontend
npm install
npm run dev                   # Vite proxies /api → http://localhost:4000
```

Open http://localhost:5173 → you land on the dark **MarketIntel** login.

### Seed accounts

| Account | Login | Password | Use |
|---------|-------|----------|-----|
| Standard user | `demo@example.com` | `demo1234` | the research app (`/login`) |
| Free user | `free@example.com` | `demo1234` | the research app (`/login`) |
| Super admin | `ADMIN_EMAIL` (your `.env`) | `ADMIN_INITIAL_PASSWORD` | the admin console (`/admin/login`, 2FA) |

> Demo/free accounts are only seeded when `NODE_ENV != production`. **Change the admin password immediately after first login.** Locally, the admin 2FA code is printed to the backend terminal (look for the `📧` line) when SMTP isn't configured.

---

## 🔧 Environment variables (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Postgres URL with `?sslmode=require`. For Neon, use the **Direct** host (no `-pooler`) — the pooler host breaks `prisma migrate`. |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ✅ | 32+ chars, must differ. Generate with `openssl rand -hex 48`. |
| `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` | ✅ | Super-admin bootstrap (used by `npm run seed`). |
| `DEEPSEEK_API_KEY` | ✅ | Required for the Economy research plan. |
| `PERPLEXITY_API_KEY` | ⛅ | Needed for Balanced / Premium (live web search). |
| `ANTHROPIC_API_KEY` | ⛅ | Needed for the Premium plan (Claude reasoning). |
| `FRONTEND_URL` | ✅ | CORS + email links (default `http://localhost:5173`). |
| `SMTP_*` | prod | Email verification / 2FA / password reset. Degrades gracefully if unset. |
| `STRIPE_*` / `WECHAT_*` / `ALIPAY_*` | optional | Payments; mock/503 until configured. |

`.env` is git-ignored — **never commit real secrets.** See `backend/env.example` for the full annotated list.

---

## 🔌 Key API endpoints

```
GET  /api/health                     liveness + db status
POST /api/auth/login | /register     JWT auth
POST /api/research/start             start a study  → { reportId }
GET  /api/research                   list current user's reports
GET  /api/research/:id/status        poll pipeline progress
GET  /api/research/:id/result        finished report + cost inputs
PATCH/api/research/:id               save cost/break-even inputs
GET  /api/research/:id/export?format=md   Markdown export
DELETE /api/research/:id             delete a report
```

All `/api/research/*` routes require auth and are scoped to the requesting user.

---

## ☁️ Deployment

- **Frontend → Vercel.** `frontend/vercel.json` proxies `/api/*` to the backend.
- **Backend → Fly.io.** Edit `app` in `backend/fly.toml`, then `fly launch` / `fly deploy`; the `release_command` runs `prisma migrate deploy`.
- **Database → Neon** (separate dev / prod branches recommended).
- **Stripe webhook** (`/api/pay/stripe/webhook`) must receive the raw body and keep the `Stripe-Signature` header.

---

## 🔒 Security baseline (built-in)

JWT dual-token + refresh rotation/revocation · live account-status checks · email verification · password policy · admin 2FA + sensitive-action re-auth · optional admin IP allowlist · tiered rate limiting · Helmet CSP/HSTS · soft-delete-first · structured logging with redaction · graceful shutdown · `/api/health` · AdminLog audit trail.

---

## 📝 Notes

- The design system ("Synthetica" dark command-center theme) lives in `research_agent_UI/synthetica_research_system/DESIGN.md`.
- Economy-plan numbers are model estimates without live citations — treat them as order-of-magnitude. Use Balanced/Premium for sourced data.
- Background workers are off locally (`RUN_BG_WORKERS=false`); the research pipeline runs in-process.

## License

See [LICENSE](./LICENSE).
