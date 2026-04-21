# ScholarMind V6 — Production Infrastructure

> Last updated: 2026-04-21

---

## Production URL

| Layer | URL |
|-------|-----|
| **Primary App URL** | `https://app.scholarmind.io` |
| **Tenant white-label pattern** | `{tenant-domain}.scholarmind.app` |
| **Email sender** | `noreply@scholarmind.app` |
| **Edge CNAME target** | `edge.scholarmind.app` |

### Source references
- `apps/web/src/lib/services/email.ts` — `EMAIL_FROM` defaults to `noreply@scholarmind.app`
- `apps/web/src/` — `NEXT_PUBLIC_APP_URL: 'https://app.scholarmind.io'` (used in CI workflow)
- White-label domain logic: constructs `{domain}.scholarmind.app`

---

## Production Database

| Property | Value |
|----------|-------|
| **Provider** | Supabase (managed PostgreSQL) |
| **Region** | `ap-southeast-2` (Sydney, Australia) |
| **Engine** | PostgreSQL 16 + pgvector extension |
| **ORM** | Drizzle ORM (`drizzle.config.ts`) |
| **Connection** | `process.env.DIRECT_URL` (direct) or `process.env.DATABASE_URL` (pooled) |
| **Pooler** | Supabase connection pooler (Pgbouncer) via `DATABASE_URL` |

### Source references
- `render.yaml:5` — `region: singapore # Closest to your ap-southeast-2 Supabase database`
- `apps/web/drizzle.config.ts` — `url: process.env.DIRECT_URL || process.env.DATABASE_URL`
- `apps/web/.env.example` — `DATABASE_URL=postgresql://user:password@...?sslmode=require`

---

## Deployment Platform

| Service | Platform | Config file |
|---------|----------|-------------|
| **Frontend (Next.js)** | Render (primary) + Vercel (alt) | `render.yaml`, `vercel.json` |
| **Deployment region** | Singapore (`render.yaml`) — closest to Supabase ap-southeast-2 |
| **Build command** | `npm install -g pnpm && pnpm install && cd apps/web && pnpm run db:push && pnpm run build` |
| **Start command** | `cd apps/web && pnpm start` |
| **AI Agent Service** | Python FastAPI (native venv locally, Docker in prod) | `services/agents/Dockerfile` |

---

## Source Control

| Property | Value |
|----------|-------|
| **Repository** | `git@github.com:singhaditya21/school-sis.git` |
| **Default branch** | `main` |
| **CI pipeline** | `.github/workflows/ci.yml` (added Week 1-3) |

---

## Required Environment Variables (production)

| Variable | Purpose | Set in |
|----------|---------|--------|
| `DATABASE_URL` | Supabase pooler connection string | Render env vars |
| `DIRECT_URL` | Supabase direct connection (for migrations) | Render env vars |
| `SESSION_SECRET` | IronSession signing key (≥32 chars) | Render env vars |
| `PII_ENCRYPTION_KEY` | AES-256-GCM key for PII encryption | Render env vars |
| `ENCRYPTION_KEY` | Alias used locally | `.env` |
| `NEXT_PUBLIC_APP_URL` | Public app URL | `https://app.scholarmind.io` |
| `STRIPE_SECRET_KEY` | Stripe payments | Render env vars |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe frontend | Render env vars |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay (India) | Render env vars |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare R2 storage | Render env vars |
| `REDIS_URL` | Upstash Redis (job queue) | Render env vars |

> [!CAUTION]
> None of these values should ever be committed to source control.
> All secrets must be rotated after any suspected exposure.

---

## Migration Notes

- Drizzle migrations live in `apps/web/drizzle/`
- Currently applied: `0000` through `0007` + `002_rls_policies.sql` + `003_password_reset_tokens.sql`
- **Week 1-3 addition**: `0008_mfa_columns.sql` — adds `mfa_secret`, `mfa_enabled`, `mfa_backup_codes` to `users`
- Run migrations against production using `DIRECT_URL` (not the pooler) to avoid transaction conflicts

```bash
# Production migration flow (use direct URL, not pooler)
DIRECT_URL="postgresql://..." pnpm db:migrate
```
