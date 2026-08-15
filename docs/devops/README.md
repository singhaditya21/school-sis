# School SIS DevOps and Release Runbook

School SIS uses one deployment owner: GitHub Actions. Vercel Git deployments are disabled in `apps/web/vercel.json`, so Vercel and GitHub cannot race or deploy the same commit twice.

The supported topology is:

```text
local development  -> local Postgres on port 5433
pull request       -> approval -> isolated preview credentials
                   -> fresh PII-free Neon branch -> separate Vercel preview -> readiness proof
main               -> required CI -> staged Vercel production build
                   -> Neon snapshot -> locked migration + RLS verification
                   -> candidate readiness -> promotion -> canonical readiness
```

## Toolchain

- Node.js 24.x
- pnpm 9.15.9, pinned by `packageManager`
- Vercel CLI 59.0.0, pinned as a root development dependency
- PostgreSQL with `pgvector`
- Drizzle migrations in `apps/web/drizzle`

Release-path GitHub Actions are pinned to immutable commit SHAs. Update those
pins deliberately and re-run the workflow syntax and shell checks with every
version bump.

Install with the lockfile:

```bash
pnpm install --frozen-lockfile
```

`pnpm audit:security` fails closed on every high or critical advisory except
the two named `image-size` advisories in `scripts/pnpm-audit-allowlist.json`.
Those exceptions are restricted to the two exact, version-pinned
React Native/Expo-to-Metro build-tool paths currently observed under
`apps/mobile`, expire on 2026-09-15, and exist only because no patched npm
release is available. A changed advisory, version, graph segment, terminal
module, report shape, or date is blocking; the Vercel web and release-tool
paths have no accepted high or critical exception.

## Database connection contract

The application and migration paths deliberately use different credentials:

| Purpose              | Variable                                             | Required endpoint                                                            |
| -------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Vercel runtime       | `DATABASE_URL`                                       | Neon pooled hostname containing `-pooler` and a least-privilege runtime role |
| GitHub migration job | `NEON_PRODUCTION_DIRECT_URL` mapped to `DIRECT_URL`  | Direct Neon hostname and a migration/DDL role                                |
| Preview migration    | Neon action `db_url` mapped to `DIRECT_URL`          | Direct URL for the isolated preview branch                                   |
| Preview runtime      | Neon action `db_url_pooled` mapped to `DATABASE_URL` | Pooled URL for the isolated preview branch                                   |

Set `DATABASE_SSL_MODE=verify-full`. Remote migration commands reject local, non-Neon, pooled, or TLS-downgraded URLs before connecting.

`db:push`, standalone `db:rls`, and the destructive RLS integration test are local-only. All remote changes must use:

```bash
pnpm db:migrate:deploy -- --target preview
pnpm db:migrate:deploy -- --target production
```

The deployment migrator:

- holds a PostgreSQL advisory lock on the same direct session used by Drizzle;
- refuses unknown, duplicate, reordered, or changed migration ledger rows;
- refuses a non-empty schema with no recognized ledger;
- creates `pgvector`, applies pending Drizzle migrations, and applies tenant RLS while locked;
- verifies that the configured runtime role exists, can log in, is not the migration owner, has no elevated attributes, inherited role membership, object ownership, or schema-creation access;
- grants only the required schema, table, sequence, and migration-ledger access to that role, including verified default privileges for future objects and only the three approved RLS helper functions;
- verifies the exact ledger and forced RLS/policy coverage before releasing the lock.

Automated releases are expand-only. Destructive contract changes require a separate maintenance operation:

```bash
pnpm audit:migrations:release
```

The immutable maintenance registry is
`scripts/destructive-migration-maintenance.json`. A record contains exactly the
Drizzle migration path, its journal timestamp, the lowercase SHA-256 of the SQL
file, an accountable owner, a single-line rollback plan, and an
`https://github.com/...` review or run URL. The record is evidence, not
permission for automation to execute destructive SQL: the production migrator
accepts it only when the production ledger already contains that exact
migration prefix.

For a destructive migration, use this reviewed maintenance sequence:

1. Stop normal production releases and take a verified Neon snapshot.
2. Prove the current production ledger and schema match the expected prefix.
3. Apply the reviewed SQL and its exact Drizzle ledger entry through a protected,
   single-session maintenance operation with the production advisory lock.
4. Verify application compatibility, schema/RLS state, and the exact ledger hash;
   execute the documented rollback plan if any proof fails.
5. Preserve the approving GitHub review/run as evidence, then add the exact
   immutable record to `scripts/destructive-migration-maintenance.json`.
6. Resume the normal release only after `pnpm audit:migrations:release` passes
   and `db:migrate:deploy -- --target production` proves that no recorded
   destructive migration is pending.

Never add a maintenance record before the protected operation has completed.
Changing the SQL file, journal timestamp, hash, or record later is blocking.

## Critical one-time Neon activation check

The current `0000_init_baseline` was created after the old 0000–0016 chain was reset on the assumption that no cloud database existed. Never point automation at a historical Neon database until it is reconciled.

Before enabling production release:

1. Create a Neon snapshot or an inspectable branch from production.
2. Read the production `drizzle.__drizzle_migrations` ledger and inventory the schema without changing it.
3. Build the current baseline in a disposable Neon branch.
4. Compare extensions, tables, columns, constraints, indexes, triggers, functions, and RLS policies.
5. If the schemas are exactly equivalent, perform a separately reviewed ledger adoption. If not, write an explicit reconciliation migration.
6. Run `db:migrate:deploy -- --target production` only after that review.

The automated migrator intentionally fails this case instead of guessing or marking the baseline applied.

## GitHub configuration

Do not put deployment credentials in repository-wide secrets. Use three
GitHub Environments so pull-request code can never receive a credential that
can reach production.

`production` Environment secrets:

| Secret                            | Purpose                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `VERCEL_TOKEN`                    | Token for the production Vercel workspace                     |
| `NEON_API_KEY`                    | Project-scoped key for production snapshots and branch checks |
| `NEON_PRODUCTION_DIRECT_URL`      | Direct migration-owner URL; never passed to Vercel runtime    |
| `METRICS_TOKEN`                   | Same bearer token configured in Vercel production             |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Production candidate and canonical readiness probes           |

`preview` Environment secrets:

| Secret                                    | Purpose                                                 |
| ----------------------------------------- | ------------------------------------------------------- |
| `VERCEL_PREVIEW_TOKEN`                    | Token for a separate preview-only Vercel workspace      |
| `NEON_PREVIEW_API_KEY`                    | Project-scoped key for a separate PII-free Neon project |
| `VERCEL_PREVIEW_AUTOMATION_BYPASS_SECRET` | Preview-only deployment-protection bypass               |

The `preview-cleanup` Environment contains only the same
`VERCEL_PREVIEW_TOKEN` and `NEON_PREVIEW_API_KEY`; it has no production
credential. Cleanup uses the default-branch workflow, direct provider APIs,
exact project/parent/metadata checks, and treats a confirmed 404 as already
clean. It never checks out pull-request code.

Repository variables:

| Variable                          | Example/purpose                                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `VERCEL_ORG_ID`                   | Production Vercel team/workspace ID                                                                               |
| `VERCEL_PROJECT_ID`               | Production Vercel project ID                                                                                      |
| `PRODUCTION_URL`                  | `https://school-sis-web.vercel.app`                                                                               |
| `NEON_PROJECT_ID`                 | Production Neon project ID                                                                                        |
| `NEON_PRODUCTION_BRANCH_ID`       | Protected production root-branch ID                                                                               |
| `NEON_DATABASE_NAME`              | Production database name                                                                                          |
| `NEON_MIGRATION_ROLE`             | Production DDL-owner role                                                                                         |
| `NEON_RUNTIME_ROLE`               | Production least-privilege runtime role                                                                           |
| `VERCEL_PREVIEW_ORG_ID`           | Separate preview-only Vercel workspace ID                                                                         |
| `VERCEL_PREVIEW_PROJECT_ID`       | Separate preview-only Vercel project ID                                                                           |
| `VERCEL_PREVIEW_APP_URL_TEMPLATE` | Canonical alias template with one `{pr}` placeholder, for example `https://school-sis-preview-pr-{pr}.vercel.app` |
| `NEON_PREVIEW_PROJECT_ID`         | Separate PII-free Neon project ID                                                                                 |
| `NEON_PREVIEW_TEMPLATE_BRANCH_ID` | Empty schema-only preview parent branch ID                                                                        |
| `NEON_PREVIEW_DATABASE_NAME`      | Preview database name                                                                                             |
| `NEON_PREVIEW_MIGRATION_ROLE`     | Preview-project DDL-owner role                                                                                    |
| `NEON_PREVIEW_RUNTIME_ROLE`       | Preview-project least-privilege runtime role                                                                      |

Keep these non-secret identifiers as repository variables so both isolated
workflows can prove that preview and production IDs differ. Protect both the
`production` and `preview` GitHub Environments with required reviewers.
Protect `main` with pull requests, blocked force-push/deletion, and these
required checks:

- `Dependency Review` on pull requests
- `validate`
- `Tenant RLS Integration`
- `Build & Lint`
- `Migration Chain`
- `Playwright Smoke`

Fork pull requests run secretless CI and do not receive preview/deployment
credentials. Same-repository pull requests receive only the isolated preview
credentials after the `preview` Environment is approved.

Create `NEON_PREVIEW_TEMPLATE_BRANCH_ID` inside the separate preview project.
On that template only, drop the application `public` and `drizzle` schemas,
recreate an empty `public` schema owned by the preview migration role, and
verify that it contains no user relations, data, or migration-ledger rows.
Each pull-request branch is a schema-only copy of this empty template, so the
locked migrator can exercise the complete chain without copying school PII or
falsely adopting a missing ledger.

## Vercel configuration

Use two projects in different Vercel workspaces: production project
`school-sis-web`, and a preview-only project whose token has no membership in
the production workspace. Both projects must use:

- Root Directory: `apps/web`
- Framework: Next.js
- Node.js: 24.x
- Function region: `iad1`
- automatic system environment variables: enabled
- `ENABLE_EXPERIMENTAL_COREPACK=1`
- no dashboard Build/Install/Output overrides that conflict with `apps/web/vercel.json`
- Standard Deployment Protection plus a project-specific Protection Bypass
  for Automation

Automatic Git deployment remains disabled for both projects by
`apps/web/vercel.json`; GitHub Actions is the only deployment owner. The
preview project stores no persistent application configuration other than
`ENABLE_EXPERIMENTAL_COREPACK=1`, and no production secrets. The workflow
rejects any unexpected pulled Preview variable, then removes downloaded Vercel
environment files before pull-request code runs. Database and core secrets are
created or supplied for one deployment only.

Production Vercel environment variables must include:

```env
DATABASE_URL=postgresql://runtime-role:...@...-pooler....neon.tech/school_sis
DATABASE_SSL_MODE=verify-full
SESSION_SECRET=at_least_32_random_characters
PII_ENCRYPTION_KEY=at_least_32_random_characters
NEXT_PUBLIC_APP_URL=https://school-sis-web.vercel.app
TENANT_BASE_HOSTS=school-sis-web.vercel.app
INTEGRATIONS_MODE=live
JOB_QUEUE_MODE=database
JOB_DISPATCH_SECRET=at_least_32_random_characters
METRICS_TOKEN=same_value_as_GitHub_secret
RATE_LIMIT_BACKEND=postgres
CSP_ENFORCE=true
```

Do not store the production direct migration URL or Neon API key in Vercel,
and remove any legacy production `DIRECT_URL`. Runtime receives only the
pooled `DATABASE_URL`. Environment changes require a new deployment.

## Neon production configuration

Use a paid production Neon project in `aws-us-east-1` so it is colocated with
Vercel `iad1` and can retain a pre-migration snapshot for every release. The
protected production branch must be the project root branch because Neon
snapshots cannot be created from child branches. Configure a recovery-history
window and scheduled snapshots appropriate for school data, then test a
restore into an inspectable branch before launch. A plan or branch that cannot
create another manual snapshot intentionally blocks deployment before any
schema change. Use a different PII-free Neon project for previews.

Use two database roles: a least-privilege runtime role in Vercel's pooled `DATABASE_URL`, and a DDL-owner migration role only in `NEON_PRODUCTION_DIRECT_URL`. Create the lowercase runtime role without inherited memberships, ownership, `SUPERUSER`, `BYPASSRLS`, `CREATEROLE`, `CREATEDB`, or `REPLICATION`; the migrator verifies this before every remote schema change and applies the exact runtime grants afterward. Start with `DB_POOL_MAX=3`, monitor Neon pooler waiters and active connections, and change the limit only from measured production capacity.

## Preview lifecycle

For approved, same-repository, non-draft pull requests,
`.github/workflows/preview.yml`:

1. proves the preview Vercel workspace/project and Neon project differ from production;
2. creates `preview/pr-<number>-<head-sha>`, a schema-only branch of the empty preview template;
3. pulls only the isolated Vercel preview project settings and deletes downloaded environment files;
4. validates the complete deployment contract;
5. builds before any database mutation;
6. runs the locked migrator against the isolated direct URL;
7. deploys the prebuilt artifact with ephemeral application secrets and only the pooled runtime URL;
8. assigns the deterministic per-PR alias produced by
   `VERCEL_PREVIEW_APP_URL_TEMPLATE`, so application-generated links and the
   tested origin are identical;
9. proves that the alias is Vercel-protected, then proves `/api/health` commit
   identity and authenticated `/api/ready` health through the bypass;
10. updates one pull-request comment with the verified preview URL.

`.github/workflows/preview-cleanup.yml` deletes the exact current Neon branch
and every metadata-matched Vercel preview deployment when the pull request
closes. Per-commit branch names prevent a rewritten migration or rebase from
contaminating a later preview; prior commit branches expire automatically
after one day.

## Production lifecycle

After `E2E Tests` succeeds for the current `main` SHA, `.github/workflows/deploy-production.yml`:

1. verifies that `main` still points to the exact triggering SHA;
2. waits for all required CI workflows/checks for that SHA;
3. pulls production Vercel settings and builds an immutable artifact;
4. captures the currently promoted Vercel deployment;
5. creates and verifies a pre-migration Neon snapshot;
6. rechecks `main`, then runs the expand-only, locked migration and RLS postflight;
7. deploys the prebuilt artifact with `--prod --skip-domain`;
8. proves the generated candidate URL is protected by Vercel Authentication,
   then uses the automation bypass to require exact commit, database,
   migration-ledger, and rate-limit readiness;
9. rechecks `main` again and promotes only the still-current candidate;
10. rechecks the canonical production URL.

If promotion or the canonical check fails, the workflow restores the captured
Vercel deployment. An unpromoted candidate, or a candidate safely removed from
the canonical alias by rollback, is ownership-verified and deleted. Database
migrations are forward-only; the workflow never automatically reverses or
restores a database. Every automatic migration must remain compatible with the
previous application version.

## Local verification

Start the disposable local pgvector cluster and exercise the same migrator twice:

```bash
pnpm db:up
DATABASE_URL=postgresql://postgres@localhost:5433/school_sis?sslmode=disable \
DATABASE_SSL_MODE=disable \
pnpm db:migrate:deploy -- --target ci
pnpm db:migrate:deploy -- --target ci
pnpm --filter @school-sis/web run db:test:rls
pnpm db:down
```

Static release checks:

```bash
pnpm db:manifest:check
pnpm audit:migrations:release
pnpm deployment:check -- --target production
pnpm test:unit
pnpm build
```

## Health and rollback evidence

Liveness identifies the exact Vercel commit and region:

```bash
curl "$PRODUCTION_URL/api/health"
```

Readiness is private and returns 503 unless the database, exact migration ledger, and shared rate limiter are all healthy:

```bash
curl "$PRODUCTION_URL/api/ready" \
  -H "Authorization: Bearer $METRICS_TOKEN"
```

Use the release workflow logs, snapshot ID, candidate URL, verified SHA, and canonical readiness result as the evidence bundle for issue #18.

## Related application operations

Local development remains local-first. Run `pnpm local:setup` for the guided setup, or use `pnpm db:up`, `pnpm dev`, and `pnpm db:down`. Schema source lives in `packages/api/src/db/schema`; generated Drizzle migrations live in `apps/web/drizzle`. `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:studio`, and `pnpm db:push` are local-development commands.

Cloudflare R2 is the preferred S3-compatible object store and AWS S3 is the fallback. Configure the matching variables documented in `apps/web/.env.example`. Uploads remain tenant-prefixed and are retrieved through authenticated signed URLs at `/api/files/...`.

Jobs and notifications are persisted in Postgres. Keep `JOB_QUEUE_MODE=database` and invoke `/api/jobs/dispatch` with `Authorization: Bearer $JOB_DISPATCH_SECRET` from one scheduler. Monitor `/api/metrics` and `/api/sre/status` with `METRICS_TOKEN`; dead-lettered work creates SRE incidents.

See [`TESTING_QUALITY_ARCHITECTURE.md`](../TESTING_QUALITY_ARCHITECTURE.md), [`PERFORMANCE_SCALE_ARCHITECTURE.md`](../PERFORMANCE_SCALE_ARCHITECTURE.md), and [`OBSERVABILITY_SRE_ARCHITECTURE.md`](../OBSERVABILITY_SRE_ARCHITECTURE.md) for the wider test, capacity, and operations contracts.
