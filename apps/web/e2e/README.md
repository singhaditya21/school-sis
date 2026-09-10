# Maintained Playwright suite

`smoke.spec.ts` is the active Playwright suite. It includes the small unauthenticated
smoke group and registers `route-smoke.ts`, which provisions least-privilege users,
signs in through the current school-code/MFA contract, and renders every shipped staff
and parent navigation target against a migrated Postgres database.

The other `*.spec.ts` files predate the current login, tenant, and MFA contracts. They
remain only as rewrite references and are deliberately excluded by `playwright.config.ts`;
they are not counted as passing coverage. New maintained cases belong in
`smoke.spec.ts`, `route-smoke.ts`, or a new file explicitly added to `testMatch`.

Both pull requests and the nightly schedule run `pnpm test:e2e`, so scheduled coverage
and merge coverage cannot drift apart again.
