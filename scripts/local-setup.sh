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

echo "▶ 1/4  Postgres (+ pgvector)"
./scripts/local-db.sh up

# Load local env so the migration runner + seed target the local cluster.
set -a; . apps/web/.env.local; set +a

# Build the local schema from the SAME raw-SQL migration chain the release applies to
# production (no Drizzle), so local and prod never drift. `--target ci` is idempotent
# (it skips already-applied migrations via the ledger) and also installs the tenant
# row-level-security policies, so there is no separate RLS step. It grants privileges
# to the tenant/platform runtime roles, which must exist first.
echo "▶ 2/4  schema + row-level security  (production migration chain)"
psql "$(./scripts/local-db.sh url)" -v ON_ERROR_STOP=1 -q <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'school_sis_runtime') THEN
    CREATE ROLE school_sis_runtime LOGIN PASSWORD 'local-tenant-runtime';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'school_sis_platform') THEN
    CREATE ROLE school_sis_platform LOGIN PASSWORD 'local-platform-runtime';
  END IF;
END $$;
SQL
pnpm db:migrate:deploy -- --target ci

# The app signs its tenant context and Postgres verifies the signature, so a local
# key must exist in BOTH app_private.tenant_context_signing_keys and .env.local.
# Without this the app starts but every authenticated request fails with
# "Database rejected the signed tenant context."
echo "▶ 3/4  local tenant-context signing key"
if ! grep -q '^TENANT_CONTEXT_SIGNING_SECRET=' apps/web/.env.local; then
  LOCAL_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")"
  {
    echo ""
    echo "# Local tenant-context signing. The same secret is stored in"
    echo "# app_private.tenant_context_signing_keys by scripts/local-setup.sh."
    echo "TENANT_CONTEXT_SIGNING_KEY_ID=local-dev"
    echo "TENANT_CONTEXT_AUDIENCE=school-sis:local"
    echo "TENANT_CONTEXT_SIGNING_SECRET=${LOCAL_SECRET}"
  } >> apps/web/.env.local
  echo "  generated a new local signing key"
else
  LOCAL_SECRET="$(grep '^TENANT_CONTEXT_SIGNING_SECRET=' apps/web/.env.local | cut -d= -f2-)"
  echo "  reusing the signing key already in .env.local"
fi
# Postgres HMACs with the raw bytes of the secret STRING, so store convert_to(...,'utf8').
psql "$(./scripts/local-db.sh url)" -v ON_ERROR_STOP=1 -c \
  "INSERT INTO app_private.tenant_context_signing_keys (key_id, audience, secret)
   VALUES ('local-dev', 'school-sis:local', convert_to('${LOCAL_SECRET}', 'utf8'))
   ON CONFLICT (key_id) DO UPDATE SET audience = EXCLUDED.audience, secret = EXCLUDED.secret;" >/dev/null
echo "  signing key installed in app_private"

echo "▶ 4/4  seed"
( cd apps/web && pnpm exec tsx scripts/seed.ts )

echo ""
echo "✔ Local stack ready.  Start the app:   pnpm dev"
echo "  App:   http://localhost:3000"
echo "  DB:    $(./scripts/local-db.sh url)"
