# Provisioning the pilot school group

`apps/web/scripts/provision-pilot-group.ts` creates one company — the trust —
and one tenant per branch, then fills each branch with a realistic Indian school
population: staff, students, guardians, a fee plan, invoices and payments.

It creates **no administrator accounts**. Those carry real passwords and are
created with `create-branch-admin.ts` (below), then enrol two-factor on first
login. Note: `/setup` cannot be used for this — it only ever creates a brand-new
tenant, so it would orphan an empty workspace from the seeded branch data.

## Before you run it

The script needs a database URL and the tenant-context signing variables the
application uses. It writes through the same RLS-guarded pool as the app, so
those are not optional.

| variable | why |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | the target database |
| `DATABASE_SSL_MODE` | `verify-full` for Neon, `disable` for a local cluster |
| `TENANT_CONTEXT_SIGNING_KEY_ID` | tenant context is verified in-database |
| `TENANT_CONTEXT_SIGNING_SECRET` | must match the deployed key |
| `TENANT_CONTEXT_AUDIENCE` | must match the deployed audience |

Take them from the production environment rather than inventing them: a
mismatched signing secret does not fail loudly, it fails as **zero rows**,
because `app_private.verified_tenant_id()` rejects the context and every
RLS-guarded read returns nothing.

## Run it

Always dry-run first. Nothing is committed and it exercises every statement:

```bash
pnpm --filter @school-sis/web exec tsx scripts/provision-pilot-group.ts --dry-run
```

Then, for real — `--students` defaults to 120 per branch:

```bash
pnpm --filter @school-sis/web exec tsx scripts/provision-pilot-group.ts --students 120
```

Re-running is a no-op, not a second cohort. It matches on tenant code and on the
company name, and prints `skipped … already provisioned` for branches that
exist. Verified by running it twice against a database carrying the full
migration chain: the second run created 0 students.

## Then create the administrators

`/setup` is the wrong tool here — it always creates a new company and tenant, so
pointing it at a `-pilot` branch would make an empty workspace disconnected from
the seeded data. Create the admin directly against the existing tenant instead:

```bash
pnpm --filter @school-sis/web exec tsx scripts/create-branch-admin.ts \
  --tenant cambridge-spm-pilot \
  --email principal@your-domain.example \
  --first Meera --last Nair
```

It prints a generated password once (or pass `--password`), and is idempotent —
re-running for the same email is a no-op, not a second account. Repeat per
branch. On first login the admin is routed to `/mfa/setup` to enrol two-factor,
then has full access to that branch. Creating an admin requires database
credentials, which is the access gate; no admin can be minted from the web.

## Optional: enable a parent-portal login

The synthetic guardians are deliberately locked. To exercise the parent portal
with a real login, give one guardian a working account:

```bash
pnpm --filter @school-sis/web exec tsx scripts/create-parent-account.ts \
  --tenant cambridge-spm-pilot --student CSPM202600001 \
  --email a-real-parent@example.com
```

It links the student's primary guardian to a new PARENT user and prints the
login. PARENT is not an MFA-required role, so they sign in directly.

## What the data is, and how to be sure

The branch names and addresses are real — taken from the trust's public listing.
**No person in the data exists.** The safeguards are checked below against rows
that were actually written, not against the source comments:

```
tenant codes not ending -pilot     : 0
emails not on a .invalid domain    : 0
phones outside the reserved prefix : 0
students not flagged pilot         : 0

distinct password hashes: 1 across 155 users
```

- every tenant code ends `-pilot`
- every email is on `.invalid`, which RFC 2606 reserves so it can never resolve
  or receive mail
- every phone uses the non-assignable `+91-00000-` prefix
- every student carries `custom_data.pilot = true`, so the whole cohort is one
  query away from being identified or removed
- **every account shares one bcrypt hash**, of a random secret generated per run
  and never stored — so none of them can be signed into by anyone, including
  whoever ran the script

That last one is why a single distinct hash across every user is the expected
result rather than a defect.

## Removing it

The pilot flag exists for this. Scope by company, and check before deleting:

```sql
SELECT count(*) FROM students
WHERE custom_data->>'pilot' = 'true'
  AND tenant_id IN (SELECT id FROM tenants WHERE code LIKE '%-pilot');
```

Deleting the company cascades to its tenants and their rows. Confirm the count
above is what you expect first — a `-pilot` suffix is a convention, not a
constraint, and nothing stops a real tenant being named that way later.
