# METRICS_TOKEN reconcile — 2026-11-08

## Problem
The Vercel project Production `METRICS_TOKEN` was a stale short value. Local
`vercel env pull` therefore could not authenticate `/api/ready`, even though
GitHub Actions Production Release injects the protected Environment secret at
deploy time (see `apps/web/docs/PHASE_0_4_VALIDATION_2026-09-10.md`).

Unauthenticated `/api/ready` correctly returned 401. Liveness remained healthy
on commit `0525e561` (`sin1`).

## Action taken
1. Generated a new ≥32-character `METRICS_TOKEN`.
2. Set it on GitHub Environment `production` secret `METRICS_TOKEN`.
3. Overrode Vercel project Production env `METRICS_TOKEN` as Sensitive to match.

## Required follow-through
This commit exists to trigger the protected Production Release path so the new
token is injected into the immutable deployment and
`scripts/verify-deployment.mjs` re-proves candidate + canonical `/api/ready`.

Prior successful canonical readiness evidence (same SHA still live before this
release): https://github.com/singhaditya21/school-sis/actions/runs/39588965190
