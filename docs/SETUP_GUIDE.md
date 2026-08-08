# School SIS setup guide

The previous guide described a retired Docker/npm/Prisma setup and is no longer
valid for this repository.

Use these maintained guides instead:

- [Continue on another laptop](./NEW_LAPTOP_SETUP.md) — clone the active branch,
  install locked dependencies, run a source-only build, and understand which
  machine-local items are intentionally excluded from Git.
- [Running locally](../RUNNING.md) — create the PostgreSQL 16 + pgvector local
  stack, apply the Drizzle schema, seed demo data, and start the app.

The short reproducibility check is:

```sh
pnpm install --frozen-lockfile
pnpm build:portable
```

Never commit `.env.local`, personal access tokens, provider credentials, local
database files, uploads, or backups. Their safe recreation or transfer is
documented in the new-laptop guide.
