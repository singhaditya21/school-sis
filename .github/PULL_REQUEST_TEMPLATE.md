## Summary

- 

## Risk Areas

- [ ] Auth, sessions, roles, MFA, SSO, or SCIM
- [ ] Tenant isolation, RLS, or cross-tenant data access
- [ ] Payments, refunds, chargebacks, invoices, or ledger state
- [ ] PII exports, documents, files, or retention/deletion
- [ ] Background jobs, notification delivery, or webhooks
- [ ] AI agents, tool permissions, embeddings, or approval flows
- [ ] Schema, Drizzle migrations, Neon, Vercel, or environment variables
- [ ] Generated artifacts, audit evidence, or repository hygiene

## Migration And Environment Notes

- Migrations:
- New or changed env vars:
- Provider/webhook changes:
- Rollback notes:

## Verification

- [ ] `pnpm test:unit`
- [ ] `pnpm test:architecture`
- [ ] `pnpm audit:ci`
- [ ] `pnpm --filter @school-sis/web exec drizzle-kit check`
- [ ] `pnpm --filter @school-sis/web exec tsc --noEmit --pretty false --incremental false`
- [ ] `pnpm --filter @school-sis/web run build`
- [ ] E2E/smoke tests, if applicable:

## Production Evidence

- Deploy URL:
- Smoke checks:
- Audit or runbook evidence:
- Follow-up risks:
