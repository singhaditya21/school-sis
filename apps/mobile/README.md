# School SIS mobile status

This Expo client is an internal development preview. It has no token login,
refresh flow, secure token storage, authenticated tenant context, or mobile E2E
coverage. Payment and Notifications are therefore intentionally absent from the
shipped navigator.

Production packaging is fail-closed in two places:

- `app.config.js` rejects Expo config resolution unless the target is the
  checked `development` or `preview` profile.
- EAS runs `scripts/mobile-release-gate.cjs` before dependency installation.

Use `pnpm start`, `pnpm android`, `pnpm ios`, `pnpm web`, or
`pnpm expo:dev -- <expo command>` for an explicitly labeled development build.
`pnpm release:check`, `pnpm build:production`, and `pnpm submit:production`
must fail while `release-readiness.json` contains incomplete capabilities.

Do not mark `productionReady` or any capability complete based on configuration
alone. Every item must be backed by implemented token login and refresh, secure
keychain/keystore storage, authenticated tenant-scoped API calls, and passing
mobile E2E coverage for login, invoice, notifications, and payment.
