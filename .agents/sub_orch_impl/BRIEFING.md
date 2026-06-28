# BRIEFING — 2026-06-28T12:17:14+05:30

## Mission
Coordinate the implementation of the 5 Core Operations modules (Hostel, Transport, Timetable, Library, Inventory) for the School SIS web application to move them from scaffolding to full comprehensive production features, fix the Turborepo build, and pass E2E tests and forensic audit.

## 🔒 My Identity
- Archetype: sub_orch_impl
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_impl
- Original parent: Project Orchestrator
- Original parent conversation ID: d3846d77-1626-4544-84bd-725bcaff6d7e

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_impl/SCOPE.md
1. **Decompose**: Decompose the task into milestones: 0) Fix build, 1) Hostel module, 2) Transport module, 3) Timetable module, 4) Library module, 5) Inventory module, 6) Final E2E Verification & Hardening.
2. **Dispatch & Execute** (pick ONE):
   - **Delegate (sub-orchestrator)**: When an item is too large, spawn a sub-orchestrator for it. (For now, we can run Explorer -> Worker -> Reviewer -> Challenger loop or spawn sub-orchestrators for milestones if needed. Actually, let's see. The task can be split into independent milestones. Let's decompose and dispatch them sequentially or parallelly. But wait, since we are `sub_orch_impl`, let's run the Project Pattern iteration loop or spawn workers/reviewers directly for each module. Wait! "Decompose until each milestone fits one Explorer -> Worker -> Reviewer cycle." So we can spawn Explorer, Worker, Reviewer, Challenger, and Forensic Auditor for our milestones!)
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: At 16 spawns, write handoff.md, spawn successor.
- **Work items**:
  1. Fix Monorepo Build [done]
  2. Hostel Module [done]
  3. Transport Module [done]
  4. Timetable Module [done]
  5. Library Module [done]
  6. Inventory Module [done]
  7. Final E2E Verification & Hardening [done]
- **Current phase**: 4
- **Current focus**: Synthesize results and handoff

## 🔒 Key Constraints
- Coordinate the implementation of the 5 Core Operations modules (Hostel, Transport, Timetable, Library, Inventory)
- Live Drizzle ORM server actions fetching directly from database
- Specific logic features: conflict-resolution in Timetable, barcode/ISBN processing in Library, routing mapping/GPS coordination in Transport
- Correct import path `@/components/ui/card` in `apps/website/src/app/(public)/apply-online/apply/page.tsx`
- Poll for `TEST_READY.md` before E2E verification
- Run E2E tests: `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e`
- Forensic Auditor verifications must be CLEAN
- Never reuse a subagent after it has delivered its handoff — always spawn fresh

## Current Parent
- Conversation ID: d3846d77-1626-4544-84bd-725bcaff6d7e
- Updated: not yet

## Key Decisions Made
- [TBD]

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| worker_m1 | teamwork_preview_worker | Fix Monorepo Build | completed | 7169b617-166d-4a4d-8765-3e65223add8c |
| worker_m2 | teamwork_preview_worker | Implement Core Modules | completed | 71091fec-5713-491e-96c8-ca1a5ed5195d |
| challenger_v1 | teamwork_preview_challenger | Verify all E2E and Jest tests | completed | 1585fe70-5ea4-497a-9f40-63526cc9ad33 |
| auditor_v1 | teamwork_preview_auditor | Perform forensic integrity audit | completed | ebb6bf45-bdc2-461f-ae51-d14b9e75ca5b |

## Succession Status
- Spawn count: 4 / 16
- Pending subagents: none
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: not started
- Safety timer: none
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_impl/ORIGINAL_REQUEST.md — Original request verbatim
- /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_impl/progress.md — Liveness and progress check
- /Users/adityasingh/PersonalWork/school-sis/.agents/sub_orch_impl/SCOPE.md — Milestone and architecture scope index
