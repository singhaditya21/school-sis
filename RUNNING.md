# Running school-sis locally

Everything needed for local development runs on your machine — **no Vercel,
Neon, or Docker is required**. Postgres lives in `./.pgdata` (git-ignored).

## Prerequisites
- **Node 24** (pinned in `.nvmrc`, matching CI)
- **pnpm 9.15.9** (`corepack enable && corepack install --global pnpm@9.15.9`,
  or `npm install --global pnpm@9.15.9` when Corepack is unavailable)
- **PostgreSQL 16** client + server — macOS: `brew install postgresql@16`
- **pgvector** (for AI/search embedding columns) — one-time:
  ```
  ./scripts/install-pgvector.sh
  ```

## First run
```bash
pnpm install --frozen-lockfile
pnpm local:setup      # starts Postgres, creates the DB + pgvector, pushes schema, seeds demo data
pnpm dev              # → http://localhost:3000
```
Then log in with a seeded account (see the `apps/web/scripts/seed.ts` output for details).

To verify only that a fresh Git checkout builds, no database or environment file
is required:

```bash
pnpm install --frozen-lockfile
pnpm build:portable
```

For the exact clone and branch handoff, see
[docs/NEW_LAPTOP_SETUP.md](./docs/NEW_LAPTOP_SETUP.md).

## Everyday commands
| Command | What it does |
|---|---|
| `pnpm dev` | Start the app on http://localhost:3000 |
| `pnpm db:up` / `pnpm db:down` | Start / stop the local Postgres cluster |
| `pnpm db:reset` | Wipe `.pgdata` and recreate an empty cluster (then `pnpm local:setup`) |
| `pnpm db:push` | Apply schema changes to the local DB (`drizzle-kit push`) |
| `pnpm db:seed` | Reseed demo data |
| `pnpm db:studio` | Browse the DB (Drizzle Studio) |
| `pnpm scheduler` | Run the background-job/notification scheduler (replaces the cron) |

## How it fits together
- **App** — Next.js in `apps/web` (`next dev`, or `next build && next start`).
- **Database** — a project-local Postgres 16 + pgvector cluster on port **5433**,
  data in `./.pgdata`, managed by `scripts/local-db.sh`.
- **Background jobs & notifications** — `POST /api/jobs/dispatch`, triggered on an
  interval by `pnpm scheduler` (this replaced the Vercel cron).
- **Config** — `apps/web/.env.local` (copy of `apps/web/.env.example`). The only
  required vars are the DB URL and a few dev secrets; payments, storage, and AI
  providers are all opt-in.

## Local and hosted environments

The local stack does not depend on a hosted environment. Hosted previews and
production configuration are separate from `.pgdata` and `.env.local`.
`apps/website` and `apps/mobile` are separate surfaces; an external agent service
is not shipped in this repository and is release-gated when configured.
