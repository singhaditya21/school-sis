# ScholarMind Marketing & Pilot Assessment Site (`apps/website`)

Public marketing, architecture overview, synthetic Experience Cloud admission preview, and pilot enquiry frontend for ScholarMind.

This Next.js application is deployed separately from the multi-tenant SaaS core (`apps/web`) so public content iterations remain isolated from tenant databases and authenticated school workflows.

Live: https://school-sis-website.vercel.app. The product it links to is https://school-sis-web.vercel.app.

## Key Surfaces

- `/` — Executive overview of multi-campus fee reconciliation, approval governance, and pilot engagement.
- `/architecture` — Interactive monorepo and security boundary walkthrough.
- `/pricing` — Design-partner pilot assessment and rollout structure.
- `/solutions/ai-agents` — Bounded, human-reviewed decision-support evaluation principles.
- `/apply-online` & `/apply-online/apply` — Read-only synthetic Experience Cloud admissions sandbox preview (collects zero student/parent PII).
- `/book-demo` & `POST /api/leads` — Origin-validated, size-bounded enquiry proxy forwarding pilot requests to `apps/web` (`/api/leads`) with `x-lead-proxy-token` and `x-lead-client-ip`.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical HTTPS origin of the marketing site used for strict `Origin` validation on `/api/leads`. |
| `NEXT_PUBLIC_APP_URL` | Base HTTPS URL of `apps/web` for the navbar `Sign In` link (falls back to `http://localhost:3000` in development and `/book-demo` if unset in production). |
| `LEAD_CAPTURE_API_URL` | Upstream `apps/web` HTTPS base URL receiving proxied `/api/leads` submissions. |
| `LEAD_CAPTURE_PROXY_SECRET` | Shared secret (32+ chars in production) sent in `x-lead-proxy-token` when forwarding verified visitor IP (`x-lead-client-ip`). |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional Cloudflare Turnstile site key rendered on `/book-demo`. |

## Commands

Run from the repository root:

```bash
pnpm --filter website dev
pnpm --filter website typecheck
pnpm --filter website lint
node scripts/check-website-claims.mjs
```
