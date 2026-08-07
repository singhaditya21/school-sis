# Open Pull Request Triage — 2026-08-07

Repository: `singhaditya21/school-sis`
Base reviewed: `main` at `ac9fbf901b9265404b6650eedfcc10b52a1b7a48`

This triage records disposition evidence for the nine pull requests that were
open when the security-roadmap remediation began. A PR is not considered safe
to merge merely because GitHub reports it as mergeable.

| PR | Scope | GitHub state observed | Disposition |
|---|---|---|---|
| [#2](https://github.com/singhaditya21/school-sis/pull/2) | PII encryption tests | Mergeable; historical CI succeeded; one test file; based on a March 2026 main SHA | Carry an updated version of the useful tests into the active remediation branch, including the 16-byte GCM tag regression. Close the stale PR as superseded after the replacement PR is published. |
| [#3](https://github.com/singhaditya21/school-sis/pull/3) | Batch attendance/marks queries | Non-mergeable; historical CI succeeded; 225-line mutation diff; based on a March 2026 main SHA | Do not merge. The optimization must be reimplemented against current tenant-validation and payment/auth changes, with current tests. Close as stale and track a fresh performance change separately. |
| [#4](https://github.com/singhaditya21/school-sis/pull/4) | `actions/cache` v6 | Mergeable; E2E and Vercel succeeded; main CI failed | Consolidated into the active branch with the other Node-24 action upgrades. Close as superseded after replacement CI passes. |
| [#5](https://github.com/singhaditya21/school-sis/pull/5) | `actions/checkout` v7 | Mergeable; E2E and Vercel succeeded; main CI failed | Consolidated into the active branch. Close as superseded after replacement CI passes. |
| [#6](https://github.com/singhaditya21/school-sis/pull/6) | `actions/upload-artifact` v7 | Mergeable; E2E and Vercel succeeded; main CI failed | Consolidated into the active branch. Close as superseded after replacement CI passes. |
| [#7](https://github.com/singhaditya21/school-sis/pull/7) | `actions/setup-node` v7 | Mergeable; E2E and Vercel succeeded; main CI failed | Consolidated into the active branch. Close as superseded after replacement CI passes. |
| [#8](https://github.com/singhaditya21/school-sis/pull/8) | `pnpm/action-setup` v6 | Mergeable; E2E and Vercel succeeded; main CI failed | Consolidated into the active branch. Close as superseded after replacement CI passes. |
| [#48](https://github.com/singhaditya21/school-sis/pull/48) | 19 development dependency updates | Mergeable; CI, E2E, and Vercel failed; approximately 4,800 lockfile/source line changes | Do not merge. Close and let Dependabot recreate independently reviewable updates under the revised configuration. |
| [#49](https://github.com/singhaditya21/school-sis/pull/49) | 43 production dependency updates | Mergeable; CI, E2E, and Vercel failed; approximately 4,700 lockfile/source line changes | Do not merge. Close and let Dependabot recreate independently reviewable updates under the revised configuration. |

## Applied triage changes

- Ported and strengthened the useful encryption coverage from #2.
- Consolidated #4–#8 into one coherent GitHub Actions runtime upgrade.
- Removed npm mega-grouping from `.github/dependabot.yml` so future updates are
  independently attributable and reviewable.

## Replacement validation and closure gate

The consolidated replacement passed the complete local unit suite (230 tests),
web type-check and production build, architecture and security audits, a real
144-table non-superuser Postgres RLS test, and the five-test Playwright smoke
suite. The dependency audit reports zero high or critical findings.

The replacement PR must also pass current GitHub CI before any superseded PR is
closed. Exact log-level causes for historical failures are not inferred from
status alone.
