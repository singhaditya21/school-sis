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

| Purpose                 | Variable                                                     | Required endpoint                                                                     |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Vercel tenant runtime   | `DATABASE_URL`                                               | Neon pooled hostname containing `-pooler` and the least-privilege tenant runtime role |
| Vercel platform runtime | `PLATFORM_DATABASE_URL`                                      | Same pooled branch/database with the dedicated `school_sis_platform` role             |
| GitHub migration job    | `NEON_PRODUCTION_DIRECT_URL` mapped to `DIRECT_URL`          | Direct Neon hostname and a migration/DDL role                                         |
| Preview migration       | Neon action `db_url` mapped to `DIRECT_URL`                  | Direct URL for the isolated preview branch                                            |
| Preview application     | Two Neon `db_url_pooled` outputs mapped to both runtime URLs | Pooled tenant and platform roles on the same isolated preview branch                  |

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

Capture repeatable reconciliation evidence from the historical database and
the disposable current-baseline database with the read-only catalog auditor:

```bash
mkdir -p apps/web/artifacts/reconciliation

MIGRATION_RECONCILIATION_DATABASE_URL="$HISTORICAL_READ_ONLY_DATABASE_URL" \
  DATABASE_SSL_MODE=verify-full \
  pnpm --silent db:reconciliation:audit \
  > apps/web/artifacts/reconciliation/historical.json

MIGRATION_RECONCILIATION_DATABASE_URL="$BASELINE_READ_ONLY_DATABASE_URL" \
  DATABASE_SSL_MODE=verify-full \
  pnpm --silent db:reconciliation:audit \
  > apps/web/artifacts/reconciliation/current-baseline.json
```

The URL is accepted only through `MIGRATION_RECONCILIATION_DATABASE_URL` and
is never included in output. Prefer a provider read-only credential. The
auditor starts `REPEATABLE READ READ ONLY`, verifies that transaction mode,
and emits canonical JSON without timestamps or database identity. The report
contains normalized catalog rows and SHA-256 fingerprints for extensions,
schemas, relations, columns, sequences, types, constraints, indexes, views,
triggers, functions, and RLS policies. It fingerprints the Drizzle ledger separately;
`schema.fingerprint` deliberately excludes the internal `drizzle` schema and
`drizzle.__drizzle_migrations` so the old-chain catalog can be compared with
the current baseline without falsely treating ledger history as an application
schema difference.

```bash
jq -e -s '.[0].schema.fingerprint == .[1].schema.fingerprint' \
  apps/web/artifacts/reconciliation/historical.json \
  apps/web/artifacts/reconciliation/current-baseline.json

jq '{schema: .schema.fingerprint, ledger: .ledger, invariants}' \
  apps/web/artifacts/reconciliation/historical.json
```

A matching schema fingerprint is evidence for review, not authorization to
adopt a ledger. Preserve both complete reports with the snapshot and review;
any mismatch requires catalog-row review and an explicit reconciliation
migration. This command has no adoption or provider-write mode.

## GitHub configuration

Do not put deployment credentials in repository-wide secrets. Use three
GitHub Environments so pull-request code can never receive a credential that
can reach production.

`production` Environment secrets:

| Secret                                   | Purpose                                                       |
| ---------------------------------------- | ------------------------------------------------------------- |
| `VERCEL_TOKEN`                           | Token for the production Vercel workspace                     |
| `NEON_API_KEY`                           | Project-scoped key for production snapshots and branch checks |
| `NEON_PRODUCTION_DIRECT_URL`             | Direct migration-owner URL; never passed to Vercel runtime    |
| `METRICS_TOKEN`                          | Same bearer token configured in Vercel production             |
| `VERCEL_AUTOMATION_BYPASS_SECRET`        | Production candidate and canonical readiness probes           |
| `TENANT_CONTEXT_SIGNING_SECRET`          | Current 256-bit-or-stronger production HMAC credential        |
| `TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET` | Previous production HMAC credential during rotation only      |

`preview` Environment secrets:

| Secret                                    | Purpose                                                              |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `VERCEL_PREVIEW_TOKEN`                    | Project-scoped token that can access only the preview Vercel project |
| `NEON_PREVIEW_API_KEY`                    | Project-scoped key for a separate PII-free Neon project              |
| `VERCEL_PREVIEW_AUTOMATION_BYPASS_SECRET` | Preview-only deployment-protection bypass                            |
| `TENANT_CONTEXT_SIGNING_SECRET`           | Preview-only 256-bit-or-stronger HMAC credential                     |
| `TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET`  | Previous preview HMAC credential during rotation only                |

The `preview-cleanup` Environment contains only the same
`VERCEL_PREVIEW_TOKEN` and `NEON_PREVIEW_API_KEY`; it has no production
credential. Cleanup uses the default-branch workflow, direct provider APIs,
exact project/parent/metadata checks, and treats a confirmed 404 as already
clean. It never checks out pull-request code.

Repository variables:

| Variable                                          | Example/purpose                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `VERCEL_ORG_ID`                                   | Production Vercel team/workspace ID                                                                               |
| `VERCEL_PROJECT_ID`                               | Production Vercel project ID                                                                                      |
| `PRODUCTION_URL`                                  | `https://school-sis-web.vercel.app`                                                                               |
| `NEON_PROJECT_ID`                                 | Production Neon project ID                                                                                        |
| `NEON_PRODUCTION_BRANCH_ID`                       | Protected production root-branch ID                                                                               |
| `NEON_DATABASE_NAME`                              | Production database name                                                                                          |
| `NEON_MIGRATION_ROLE`                             | Production DDL-owner role                                                                                         |
| `NEON_RUNTIME_ROLE`                               | Production least-privilege runtime role                                                                           |
| `NEON_PLATFORM_ROLE`                              | Exact production platform role: `school_sis_platform`                                                             |
| `VERCEL_PREVIEW_ORG_ID`                           | Team/workspace ID that owns the preview project; it may equal `VERCEL_ORG_ID`                                     |
| `VERCEL_PREVIEW_PROJECT_ID`                       | Separate preview-only Vercel project ID                                                                           |
| `VERCEL_PREVIEW_APP_URL_TEMPLATE`                 | Canonical alias template with one `{pr}` placeholder, for example `https://school-sis-preview-pr-{pr}.vercel.app` |
| `NEON_PREVIEW_PROJECT_ID`                         | Separate PII-free Neon project ID                                                                                 |
| `NEON_PREVIEW_TEMPLATE_BRANCH_ID`                 | Empty schema-only preview parent branch ID                                                                        |
| `NEON_PREVIEW_DATABASE_NAME`                      | Preview database name                                                                                             |
| `NEON_PREVIEW_MIGRATION_ROLE`                     | Preview-project DDL-owner role                                                                                    |
| `NEON_PREVIEW_RUNTIME_ROLE`                       | Preview-project least-privilege runtime role                                                                      |
| `NEON_PREVIEW_PLATFORM_ROLE`                      | Exact preview-project platform role: `school_sis_platform`                                                        |
| `PRODUCTION_TENANT_CONTEXT_SIGNING_SECRET_SHA256` | Lowercase SHA-256 of the current production signing secret; repository/org scope only                             |
| `PREVIEW_TENANT_CONTEXT_SIGNING_SECRET_SHA256`    | Lowercase SHA-256 of the current preview signing secret; repository/org scope only                                |

The `production` and `preview` Environments each define their own
`TENANT_CONTEXT_SIGNING_KEY_ID`, optional `TENANT_CONTEXT_PREVIOUS_KEY_ID`, and
optional `TENANT_CONTEXT_RETIRE_PREVIOUS_KEY` variables. Current production
and preview key IDs must differ. The two current signing secrets must be
independently generated from at least 32 random bytes; copying one value into
both environments is prohibited. Same-repository pull-request code receives
the preview secret, so reusing it in production would collapse the production
credential boundary even though audiences differ.

The reviewed source of truth is
`.github/tenant-context-key-contract.json`, whose exact version, keys, key-ID
formats, fingerprint formats, and cross-environment differences are checked by
both workflows. The two repository variables above are an exact public mirror
used by the no-Environment preflight job to prevent pull-request code from
substituting that tracked artifact; never define same-named Environment
variables. The JSON at the exact deployment SHA remains authoritative: mirror
drift can only block a deployment and can never replace or override the
reviewed values. Each protected job then hashes its own secret without printing it
and requires its key ID and fingerprint to match the preflight outputs. A key
rotation updates the reviewed JSON, the matching repository fingerprint, the
Environment key ID, and the protected secret as one coordinated fail-closed
change; intermediate states intentionally cannot deploy.

Both protected workflows also validate the entire optional rotation tuple
before checkout or any Neon/Vercel API call: the previous key ID and secret must be supplied
together, both must have the canonical shapes and differ from the current key,
and `TENANT_CONTEXT_RETIRE_PREVIOUS_KEY` must be unset or exactly `true`.
Retirement cannot be requested while a previous verification key is still
configured. Invalid intermediate rotation states therefore fail before a
pre-migration snapshot is consumed.

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

Use two separate Vercel projects: production project `school-sis-web` and a
preview-only project. They may share a team/workspace only when
`VERCEL_PREVIEW_TOKEN` is project-scoped to the preview project and cannot
access the production project. Before checkout, the preview workflow calls the
raw Vercel Projects API with that token, verifies that the preview response is
the exact configured project and team, and requires the production-project
request to return `403` or `404`. A `200` or any other status fails closed.
If a sufficiently restricted token is unavailable, place the preview project
in a separate workspace whose token cannot reach production. Both projects
must use:

- Root Directory: `apps/web`
- Framework: Next.js
- Node.js: 24.x
- Function region: production `sin1`; preview `iad1`
- automatic system environment variables: enabled
- `ENABLE_EXPERIMENTAL_COREPACK=1`
- no dashboard Build/Install/Output overrides that conflict with `apps/web/vercel.json`
- Standard Deployment Protection plus a project-specific Protection Bypass
  for Automation

Automatic Git deployment remains disabled for both projects by
`apps/web/vercel.json`; GitHub Actions is the only deployment owner. The
preview project stores no persistent application configuration other than
`ENABLE_EXPERIMENTAL_COREPACK=1`, and no production secrets. The workflow
rejects any unexpected pulled Preview variable. It also requires Vercel's exact
generated Nx/Turborepo build controls (`NX_DAEMON=false`,
`TURBO_CACHE=remote:rw`, `TURBO_DOWNLOAD_LOCAL_ENABLED=true`,
`TURBO_REMOTE_ONLY=true`, and `TURBO_RUN_SUMMARY=true`). The downloaded Vercel
environment files—including those build controls—are then removed and rebuilt
from the isolated per-deployment application allowlist before the application
build or deployment runs. Database and core secrets are created or supplied for
one deployment only.

Vercel CLI 59.0.0 is pinned and patched through pnpm so `vercel pull` accepts
the CLI's existing project-scoped owner-lookup fallback when the exact Project
is readable but its owning Team is intentionally not. Preview CI forces the
reviewed JavaScript CLI path and verifies the installed patch before any
provider mutation; do not replace this with a Team-wide preview token.

Production Vercel environment variables must include:

```env
DATABASE_URL=postgresql://runtime-role:...@...-pooler....neon.tech/school_sis
PLATFORM_DATABASE_URL=postgresql://school_sis_platform:...@...-pooler....neon.tech/school_sis
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
TENANT_CONTEXT_AUDIENCE=production:<neon-project-id>:<root-branch-id>
TENANT_CONTEXT_SIGNING_KEY_ID=production-v1
TENANT_CONTEXT_SIGNING_SECRET=current_production_base64url_secret
```

Do not store the production direct migration URL or Neon API key in Vercel,
and remove any legacy production `DIRECT_URL`. Runtime receives only the two
pooled application URLs and the current signing credential; previous signing
keys are verification-only migration inputs and never enter Vercel. The
migration, tenant-runtime, and platform-runtime URLs must have nonempty,
pairwise-distinct decoded passwords in addition to distinct role names.
Environment changes require a new deployment.

## Neon production configuration

Use the paid production Neon project in Singapore `aws-ap-southeast-1`,
colocated with Vercel `sin1`, and retain a pre-migration snapshot for every
release. The PII-free preview Neon project remains in `aws-us-east-1` and its
Vercel functions deploy explicitly to `iad1`. The
protected production branch must be the project root branch because Neon
snapshots cannot be created from child branches. Configure a recovery-history
window and scheduled snapshots appropriate for school data, then test a
restore into an inspectable branch before launch. A plan or branch that cannot
create another manual snapshot intentionally blocks deployment before any
schema change. Use a different PII-free Neon project for previews.

Use three distinct database roles: the exact least-privilege
`school_sis_runtime` role in Vercel's pooled `DATABASE_URL`, the exact
dedicated `school_sis_platform` role in
pooled `PLATFORM_DATABASE_URL`, and a DDL-owner migration role only in
`NEON_PRODUCTION_DIRECT_URL`. Both application roles must have `LOGIN`, no
ownership in any non-system schema or global object class, no database/schema
`CREATE`, no database `TEMPORARY`, no role/database defaults, and no
`SUPERUSER`, `BYPASSRLS`, `CREATEROLE`, `CREATEDB`, or `REPLICATION`. A role
may have zero membership edges, or exactly one Neon owner-management edge:
the migration owner is the member, the application role is the granted role,
and the edge is `ADMIN TRUE`, `INHERIT FALSE`, `SET FALSE`. Any other,
additional, inheritable, settable, or non-admin edge fails deployment. The
migration owner must have `BYPASSRLS` for forced-RLS maintenance and effective
`pg_signal_backend` capability for the first TEMP cutover drain.

Before approving the first production release, rotate the exact
`school_sis_platform` role to an independently generated strong password through
the direct migration-owner connection, then replace production Vercel's pooled
`PLATFORM_DATABASE_URL` with that role and percent-encoded password. Its decoded
password must differ from both `DATABASE_URL` and
`NEON_PRODUCTION_DIRECT_URL`; the production contract rejects the release
otherwise. Treat that password and rebuilt URL as secrets: mask them, never
write them to the repository, and create a new Vercel deployment after the
environment update. The preview workflow performs the equivalent rotation and
login verification automatically on each isolated preview branch before URL
validation or migration.

The migrator revokes database `TEMPORARY` from `PUBLIC` and both application
roles. It records a database-clock cutoff, terminates exact app-role backends
that predate that cutoff, verifies none remain, and only then records the drain
complete. An interrupted drain is retry-safe: a later run resumes from the
persisted incomplete marker even though TEMP is already revoked. Failure to
prove the exact roles, sessions, or termination capability blocks deployment.

Tenant identity is a database-verified HMAC context, not a trusted custom GUC.
After `BEGIN`, the tenant pool reads the database clock and current `xid8`,
builds a canonical payload containing the audience, key ID, transaction ID,
tenant UUID, expiry, and nonce, signs it with the app-held current secret, and
installs every value with parameterized `SET LOCAL` calls. The protected
database verifier reads its key from an `app_private` table that neither app
role can read, binds the token to the same transaction and database audience,
and compares the fixed-width HMAC in constant time. A persisted or forged GUC
therefore fails in another transaction, tenant, database audience, or after
expiry. Nonces are replay metadata rather than a consumed nonce store; the
five-minute replay window is made transaction-local by the `xid8` binding.

Every checkout overlays a safe `search_path` and protected GUC values, and a
dirty checkout is reset with `DISCARD ALL` or destroyed. Keep one explicit
contextual transaction per unit of work. `pg_current_xact_id()` consumes an
XID, so monitor XID allocation and vacuum headroom at the expected workload:

```sql
SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY 2 DESC;
SELECT n.nspname, c.relname, age(c.relfrozenxid)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p') ORDER BY 3 DESC LIMIT 20;
```

In strict mode, `app_private.rls_bypass()` requires both transaction-local
`app.bypass_rls=on` and exact `school_sis_platform` identity. The application
routes that credential only inside a branded, reviewed bypass context; an
ordinary platform connection remains RLS-restricted. Start with
`DB_POOL_MAX=3` per pool, monitor Neon pooler waiters and active connections,
and change the limits only from measured production capacity.

## Preview lifecycle

For approved, same-repository, non-draft pull requests,
`.github/workflows/preview.yml`:

1. proves the preview Vercel project and Neon project differ from production,
   proves through the raw Vercel API that the preview token can access only
   the configured preview target, and proves through the Neon API that the
   preview key gets `200` for the exact preview project but `403`/`404` for
   production;
2. creates or reuses `preview/pr-<number>`, a schema-only root branch initialized from the empty preview template, and refreshes its exact one-day expiry on every approved run;
3. pulls only the isolated Vercel preview project settings and deletes downloaded environment files;
4. validates the complete deployment contract;
5. builds before any database mutation;
6. runs the locked migrator against the isolated direct URL;
7. deploys the prebuilt artifact to `iad1` with ephemeral application secrets,
   the preview-only tenant-context signer, and only the two pooled
   tenant/platform application URLs;
8. assigns the deterministic per-PR alias produced by
   `VERCEL_PREVIEW_APP_URL_TEMPLATE`, so application-generated links and the
   tested origin are identical;
9. proves that the alias is Vercel-protected, then proves `/api/health` commit
   identity and exact `iad1` region plus authenticated `/api/ready` tenant
   signer/runtime-role, platform-role/bypass, ledger, and dependency health;
10. updates one pull-request comment with the verified preview URL.

`.github/workflows/preview-cleanup.yml` deletes the exact current Neon branch
and every metadata-matched Vercel preview deployment when the pull request
closes. Per-commit branch names prevent a rewritten migration or rebase from
contaminating a later preview; prior commit branches expire automatically
after one day.

## Production lifecycle

After `E2E Tests` succeeds for the current `main` SHA, `.github/workflows/deploy-production.yml`:

1. verifies that protected `main` still points to the exact triggering SHA and
   that the SHA is the reviewed merge commit of one approved pull request;
2. waits for all required CI workflows/checks for that SHA;
3. pulls production Vercel settings and builds an immutable artifact;
4. captures the currently promoted Vercel deployment;
5. creates and verifies a pre-migration Neon snapshot;
6. rechecks `main`, then runs the expand-only, locked migration and RLS postflight;
7. deploys the prebuilt artifact to `sin1` with `--prod --skip-domain`;
8. proves the generated candidate URL is protected by Vercel Authentication,
   then uses the automation bypass to require exact commit, `sin1` region,
   migration-ledger, tenant signer/runtime identity, platform identity/bypass,
   and rate-limit readiness;
9. rechecks `main` again and promotes only the still-current candidate;
10. rechecks the canonical production URL.

If promotion or the canonical check fails, the workflow restores the captured
Vercel deployment. An unpromoted candidate, or a candidate safely removed from
the canonical alias by rollback, is ownership-verified and deleted. Database
migrations are forward-only; the workflow never automatically reverses or
restores a database. Every automatic migration must remain compatible with the
previous application version.

### Signed-context rollout and rotation

The initial production cutover is deliberately two releases. Do not combine
the phases:

1. Phase 1 provisions the protected key/audience tables and strict
   `verified_tenant_id()`, deploys an application that signs every tenant
   transaction, and temporarily leaves policy-facing `current_tenant_id()`
   compatible with the exact legacy runtime role. Legacy bypass compatibility
   is likewise limited to that exact runtime role. The authenticated candidate
   and canonical probes must prove the signed runtime and platform paths.
2. After promotion, the workflow records the exact canonical deployment ID,
   commit SHA, current key ID, and audience. A follow-up reviewed release
   changes `PRODUCTION_TENANT_CONTEXT_ENFORCEMENT_PHASE` from `1` to `2`.
   Before applying strict mode, the migrator requires that the recorded phase-1
   deployment is exactly the currently serving prior deployment. Phase 2 then
   removes unsigned tenant and runtime-bypass compatibility. Both the live
   phase-1 app and its rollback image already sign, so migration-before-promotion
   remains safe.

Rotate a production key with the same expand/contract discipline:

1. Generate a new independent base64url secret and key ID. Make them current
   in production, retain the old pair as `TENANT_CONTEXT_PREVIOUS_*`, update the
   repository-level production SHA-256 pin through review, and leave
   `TENANT_CONTEXT_RETIRE_PREVIOUS_KEY` unset. The migrator keeps both DB-side
   verification keys while the old canonical deployment is still serving.
2. Promote and verify a candidate that signs with the new key. The post-promotion
   marker must record that exact canonical deployment, key ID, audience, and
   SHA. A failed promotion or rollback does not change the marker or retire the
   old key.
3. On a later release, remove the previous-key variables/secret and set
   `TENANT_CONTEXT_RETIRE_PREVIOUS_KEY=true`. Retirement is allowed only when
   the currently serving prior deployment exactly matches the earlier marker
   for the current key. After the retirement release succeeds, unset the flag.

Preview and production always use different current and previous secrets,
different key IDs, and database-specific audiences. The database key is
provisioned inside the locked migration transaction through parameters; no
workflow prints it, and artifact scans include both current and previous
tenant-context secrets.

## One-time legacy production ledger adoption

The legacy-ledger adoption is a manual, one-time bridge for the exact historical
16-row production ledger. It replaces only those rows with the reviewed `0000`
baseline, leaves `0001_reconcile_production_integrity` pending, and never runs a
migration, deploys Vercel, promotes a candidate, or runs on an ordinary push or
pull request. The normal deploy migrator is unchanged. Do not invoke this path
after the ledger has been adopted.

The only approved entry point is the `workflow_dispatch` workflow
`.github/workflows/adopt-legacy-production.yml`, which invokes:

```bash
pnpm --silent db:adopt:legacy-production
```

Do not run that package command by hand. The protected workflow supplies and
cross-checks the complete GitHub Actions identity (`GITHUB_ACTOR`,
`GITHUB_TRIGGERING_ACTOR`, `GITHUB_EVENT_NAME`, `GITHUB_REF`,
`GITHUB_REF_NAME`, `GITHUB_REF_TYPE`, `GITHUB_REF_PROTECTED`,
`GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `GITHUB_SHA`,
`GITHUB_WORKSPACE`, and `RUNNER_TEMP`) plus `GITHUB_TOKEN`. It also supplies the
following runtime inputs and fingerprinted approval material; none of these
values may be inferred from a local shell:

```text
LEGACY_LEDGER_ADOPTION_CONFIRMATION
LEGACY_LEDGER_ADOPTION_SNAPSHOT_CONFIRMATION
LEGACY_LEDGER_ADOPTION_RESTORE_DRILL_ATTESTATION
LEGACY_LEDGER_ADOPTION_APPROVAL_FINGERPRINT
LEGACY_LEDGER_ADOPTION_APPROVED_AT
LEGACY_LEDGER_ADOPTION_APPROVED_BY
LEGACY_LEDGER_ADOPTION_DATABASE_URL
LEGACY_LEDGER_ADOPTION_NEON_API_KEY
LEGACY_LEDGER_ADOPTION_SSL_MODE
LEGACY_LEDGER_ADOPTION_EXPECTED_NEON_HOST
LEGACY_LEDGER_ADOPTION_EXPECTED_NEON_PROJECT_ID
LEGACY_LEDGER_ADOPTION_EXPECTED_NEON_BRANCH_ID
LEGACY_LEDGER_ADOPTION_EXPECTED_DATABASE
LEGACY_LEDGER_ADOPTION_EXPECTED_ROLE
LEGACY_LEDGER_ADOPTION_EXPECTED_RUNTIME_ROLE
LEGACY_LEDGER_ADOPTION_EXPECTED_PLATFORM_ROLE
LEGACY_LEDGER_ADOPTION_EXPECTED_HISTORICAL_COMMIT_SHA
LEGACY_LEDGER_ADOPTION_GITHUB_COMMIT_SHA
LEGACY_LEDGER_ADOPTION_GITHUB_PULL_REQUEST_URL
LEGACY_LEDGER_ADOPTION_GITHUB_REPOSITORY
LEGACY_LEDGER_ADOPTION_GITHUB_RUN_URL
LEGACY_LEDGER_ADOPTION_RECONCILIATION_DISPOSITION
LEGACY_LEDGER_ADOPTION_NEON_SNAPSHOT_CONSOLE_URL
LEGACY_LEDGER_ADOPTION_NEON_SNAPSHOT_NAME
LEGACY_LEDGER_ADOPTION_APPROVED_SOURCE_SCHEMA_FINGERPRINT
LEGACY_LEDGER_ADOPTION_APPROVED_SOURCE_EVIDENCE_FINGERPRINT
LEGACY_LEDGER_ADOPTION_SOURCE_EVIDENCE_URL
LEGACY_LEDGER_ADOPTION_APPROVED_TARGET_SCHEMA_FINGERPRINT
LEGACY_LEDGER_ADOPTION_APPROVED_TARGET_EVIDENCE_FINGERPRINT
LEGACY_LEDGER_ADOPTION_TARGET_EVIDENCE_ARTIFACT_PATH
LEGACY_LEDGER_ADOPTION_TARGET_EVIDENCE_ARTIFACT_SHA256
LEGACY_LEDGER_ADOPTION_TARGET_EVIDENCE_URL
```

The `production` GitHub environment must have an independent required reviewer.
It must provide `NEON_API_KEY` and the strict direct
`NEON_PRODUCTION_DIRECT_URL` secrets, plus `NEON_PROJECT_ID`,
`NEON_PRODUCTION_BRANCH_ID`, `NEON_DATABASE_NAME`, `NEON_MIGRATION_ROLE`,
`NEON_RUNTIME_ROLE`, and `NEON_PLATFORM_ROLE` variables. The reviewed canonical
transition evidence must be tracked at
`docs/devops/evidence/legacy-production-transition-target-v2.json`. Do not
dispatch if that artifact is absent or its raw SHA-256, schema fingerprint, or
evidence fingerprint differs from the reviewed constants in the adoption CLI.

### First-release sequence

Merging PR #59 causes the normal `Production Release` to be created after E2E.
Both workflows deliberately use the `production-release` concurrency group and
the `production` environment. Follow this order exactly:

1. Do **not** approve the initial `Production Release`. Cancel or decline it
   while it is still waiting at the production-environment gate. That gate is
   on the whole job and precedes every step, so a release stopped there cannot
   create its pre-migration snapshot or touch Neon. Wait until the run is
   concluded and the concurrency group is free.
2. Confirm that the adoption PR is merged at the current protected `main` SHA,
   and that a non-author reviewer whose current repository permission is
   `write`, `maintain`, or `admin` approved the PR's exact final head commit.
3. Freeze provider/IAM changes and manual DDL for the entire approved window.
   Do not create, rename, restore, or delete Neon branches/snapshots; change
   roles, grants, default privileges, GitHub configuration, or Vercel settings;
   or run another migration. Coordinate an application maintenance window:
   reads can continue, but the adoption transaction temporarily blocks writes
   to all 144 public tables.
4. Verify that a recent non-production Neon snapshot restore drill proved
   database readability and that the manual recovery runbook is current. The
   dispatch attestation is mandatory. Neon list metadata (`id`, `name`,
   `created_at`, `full_size`, `source_branch_id`, and `manual`) does **not** by
   itself prove restorability.
5. Dispatch the adoption from `main` with attempt 1 only. Copy every fingerprint
   from the reviewed constants/artifact; do not retype, normalize, or substitute
   a clean-build target:

   ```bash
   gh workflow run adopt-legacy-production.yml --ref main \
     -f target_sha='<current-40-character-protected-main-sha>' \
     -f approved_pull_request_url='https://github.com/singhaditya21/school-sis/pull/59' \
     -f approve_exact_legacy_ledger_adoption=true \
     -f attest_restore_drill_and_same_run_snapshot=true \
     -f historical_commit_sha='f5d781ca354ec00450ee49e109642d243c5158af' \
     -f source_schema_fingerprint='<reviewed-64-character-source-schema-sha256>' \
     -f source_evidence_fingerprint='<reviewed-64-character-source-evidence-sha256>' \
     -f target_schema_fingerprint='<reviewed-64-character-transition-schema-sha256>' \
     -f target_evidence_fingerprint='<reviewed-64-character-transition-evidence-sha256>' \
     -f target_artifact_sha256='<reviewed-64-character-tracked-artifact-sha256>'
   ```

6. Require a result status of `adopted` or
   `adopted-with-lock-cleanup-warning`, with only
   `0001_reconcile_production_integrity` pending. Then rerun the original
   cancelled release with `gh run rerun <production-release-run-id>`. The normal
   production workflow takes its own pre-migration snapshot, applies the locked
   migration and RLS postflight, stages and verifies Vercel, and promotes the
   exact commit.

The adoption CLI verifies the immutable historical SQL/ledger, current
migration SQL/journal/RLS bytes, direct TLS Neon identity, role/ACL/ownership
contract, canonical source and target evidence, data invariants, protected-main
SHA, current first-attempt workflow, and reviewed PR. It then holds both
migration advisory locks, takes an `ACCESS EXCLUSIVE` ledger lock and one
`SHARE ROW EXCLUSIVE` lock across the exact 144-table set, repeats the audit,
and writes the exact live pre-mutation source audit to `RUNNER_TEMP`. Only while
those locks remain held does it issue the single non-retried Neon snapshot
`POST`, poll any returned operations, and re-GET the exact retained snapshot.
It rechecks GitHub, provider identity, snapshot freshness, and the ten-minute
run deadline before the ledger write and again before `COMMIT`.

The workflow uploads the raw live source audit, tracked target audit, actual
snapshot metadata, and result JSON as a non-secret evidence bundle retained for
90 days. Download and archive that bundle with the release record before it
expires; the pre-mutation source bytes cannot be reconstructed later. The
same-run recovery snapshot is intentionally retained and is never
automatically deleted or restored.

Treat outcomes conservatively:

- A normal refusal before `COMMIT` rolls back the database transaction. If the
  message says the snapshot `POST` outcome is ambiguous, do not retry until the
  deterministic snapshot name has been inspected in Neon.
- Exit status 2 means the `COMMIT` acknowledgement was lost. Do not retry;
  inspect the exact production ledger first.
- Exit status 3 means the ledger commit is known to have succeeded but fresh
  verification failed. Do not retry and do not run the deploy migrator until
  the ledger and evidence are reconciled.
- Workflow reruns are rejected. After any inspected, recoverable pre-commit
  failure, use a newly approved dispatch rather than rerunning the old attempt.

The snapshot restore API is Beta. A non-finalizing restore creates another
provider branch and must finish its operations before a database connection can
prove readability. That mutation, connection provisioning, and cleanup are not
performed while production write locks are held. Recovery therefore requires
the separately tested manual procedure attested above; this workflow never
restores production automatically. See the
[Neon snapshot restore API](https://api-docs.neon.tech/reference/restoresnapshot).

## Local verification

Start the disposable local pgvector cluster and exercise the same migrator twice:

```bash
pnpm db:up
DATABASE_URL=postgresql://postgres@localhost:5433/school_sis?sslmode=disable \
PLATFORM_DATABASE_URL=postgresql://postgres@localhost:5433/school_sis?sslmode=disable \
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

Readiness is private and returns 503 unless the database, exact migration
ledger, shared rate limiter, signed tenant context, and dedicated platform
connection are all healthy. The tenant probe signs a synthetic nonexistent
tenant inside a real transaction and requires exact `school_sis_runtime`, the
configured key ID/audience, and bypass false. The platform probe requires exact
`school_sis_platform` and bypass true without reading or changing tenant data:

```bash
curl "$PRODUCTION_URL/api/ready" \
  -H "Authorization: Bearer $METRICS_TOKEN"
```

Use the release workflow logs, snapshot ID, candidate URL, verified SHA, and canonical readiness result as the evidence bundle for issue #18.

## Related application operations

Local development remains local-first. Run `pnpm local:setup` for the guided setup, or use `pnpm db:up`, `pnpm dev`, and `pnpm db:down`. Schema source lives in `packages/api/src/db/schema`; generated Drizzle migrations live in `apps/web/drizzle`. `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:studio`, and `pnpm db:push` are local-development commands.

When all three tenant-context signing variables are absent, a non-production
runtime whose `DATABASE_URL` resolves strictly to localhost uses the same
well-known `local-ci-v1` credential as the local migrator. A partial tuple, a
remote URL, or `NODE_ENV=production` never receives that fallback and fails
closed. The matching explicit local-only values remain documented in
`apps/web/.env.example` for reproducibility.

Cloudflare R2 is the preferred S3-compatible object store and AWS S3 is the fallback. Configure the matching variables documented in `apps/web/.env.example`. Uploads remain tenant-prefixed and are retrieved through authenticated signed URLs at `/api/files/...`.

Jobs and notifications are persisted in Postgres. Keep `JOB_QUEUE_MODE=database` and invoke `/api/jobs/dispatch` with `Authorization: Bearer $JOB_DISPATCH_SECRET` from one scheduler. Monitor `/api/metrics` and `/api/sre/status` with `METRICS_TOKEN`; dead-lettered work creates SRE incidents.

See [`TESTING_QUALITY_ARCHITECTURE.md`](../TESTING_QUALITY_ARCHITECTURE.md), [`PERFORMANCE_SCALE_ARCHITECTURE.md`](../PERFORMANCE_SCALE_ARCHITECTURE.md), and [`OBSERVABILITY_SRE_ARCHITECTURE.md`](../OBSERVABILITY_SRE_ARCHITECTURE.md) for the wider test, capacity, and operations contracts.
