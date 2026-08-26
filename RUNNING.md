# Running school-sis locally

This is the **local development** setup: the app and a project-local Postgres run on your
machine, with data in `./.pgdata` (git-ignored). No Docker required.

Production and preview deployments are a separate, GitHub-Actions-owned path to **Vercel**
(region `sin1`) and **Neon** — see [docs/devops/README.md](./docs/devops/README.md). Nothing
here deploys anything.

## Prerequisites
- **Node 24.x** and **pnpm 9.15.9** (`corepack enable`)
- **PostgreSQL 16** client + server — macOS: `brew install postgresql@16`
- **pgvector** (for AI/search embedding columns) — one-time:
  ```
  ./scripts/install-pgvector.sh
  ```

## First run
```bash
pnpm install
pnpm local:setup      # starts Postgres, creates the DB + pgvector, pushes schema, seeds demo data
pnpm dev              # → http://localhost:3000
```
Then log in with a seeded account (see the `apps/web/scripts/seed.ts` output for details).

## Everyday commands
| Command | What it does |
|---|---|
| `pnpm dev` | Start the app on http://localhost:3000 |
| `pnpm db:up` / `pnpm db:down` | Start / stop the local Postgres cluster |
| `pnpm db:reset` | Wipe `.pgdata` and recreate an empty cluster (then `pnpm local:setup`) |
| `pnpm db:push` | Apply schema changes to the local DB (`drizzle-kit push`) |
| `pnpm db:seed` | Reseed demo data |
| `pnpm db:studio` | Browse the DB (Drizzle Studio) |
| `pnpm scheduler` | Run the background-job/notification scheduler locally |

## How it fits together
- **App** — Next.js in `apps/web` (`next dev`, or `next build && next start`).
- **Database** — a project-local Postgres 16 + pgvector cluster on port **5433**,
  data in `./.pgdata`, managed by `scripts/local-db.sh`.
- **Background jobs & notifications** — `POST /api/jobs/dispatch`, triggered on an
  interval by `pnpm scheduler` locally. In deployed environments the same endpoint is
  driven on a schedule; see [docs/devops/README.md](./docs/devops/README.md).
- **Config** — `apps/web/.env.local` (copy of `apps/web/.env.example`). The only
  required vars are the DB URL and a few dev secrets; payments, storage, and AI
  providers are all opt-in.

## Deployment
Deployment is not done from a developer machine. Merging to `main` triggers the GitHub
Actions release pipeline, which migrates Neon and deploys `apps/web` to Vercel; pull requests
get an isolated preview on a Neon branch. The pipeline, required checks, environment
contract, and rollback procedure are documented in
[docs/devops/README.md](./docs/devops/README.md).

`apps/website` (marketing) and `apps/mobile` are separate surfaces with their own lifecycles.
