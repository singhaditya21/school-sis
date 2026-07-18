#!/usr/bin/env bash
#
# One command to get a fully-seeded local stack ready. Idempotent.
#
#   ./scripts/local-setup.sh      (or: pnpm local:setup)
#   pnpm dev                      # then start the app
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f apps/web/.env.local ]; then
  echo "▶ creating apps/web/.env.local from the example"
  cp apps/web/.env.example apps/web/.env.local
  echo "  (edit apps/web/.env.local if you need non-default secrets)"
fi

echo "▶ 1/3  Postgres (+ pgvector)"
./scripts/local-db.sh up

# Load local env so drizzle + seed target the local cluster.
set -a; . apps/web/.env.local; set +a

echo "▶ 2/3  schema  (drizzle-kit push)"
pnpm --filter @school-sis/web exec drizzle-kit push --force

echo "▶ 3/3  seed"
( cd apps/web && pnpm exec tsx scripts/seed.ts )

echo ""
echo "✔ Local stack ready.  Start the app:   pnpm dev"
echo "  App:   http://localhost:3000"
echo "  DB:    $(./scripts/local-db.sh url)"
