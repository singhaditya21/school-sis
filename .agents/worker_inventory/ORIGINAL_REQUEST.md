## 2026-06-28T07:32:12Z
<USER_REQUEST>
You are a Worker agent. Your task is to complete Milestone 6: Implement E2E tests for the Inventory module.

Specific tasks:
1. Create and implement `apps/web/e2e/inventory-core.spec.ts` with the 12 Inventory-related tests:
   - **E2E-IN-101**: View Assets Log (Verify assets table shows serial numbers, categories, locations, condition tags, purchase price).
   - **E2E-IN-102**: View Consumables Log (Verify consumables table displays current stock, unit, minimum stock, supplier).
   - **E2E-IN-103**: View Inventory Alert Dashboard (Verify KPI summary metrics match database records).
   - **E2E-IN-104**: View Reorder Suggestions (Verify suggestion list lists items that are low in stock and displays suggested quantities).
   - **E2E-IN-105**: Filter Stock Alerts by Severity (Verify filter by Critical severity limits rendered alerts).
   - **E2E-IN-201**: Consumable low-stock red background indicator (Verify row styling matches expectation for low-stock items).
   - **E2E-IN-202**: Stock Alerts empty alert dashboard (Resolve all alerts in DB, verify "Active Alerts" displays placeholder).
   - **E2E-IN-203**: Asset condition tag fallback check (Assert unknown condition value falls back to default badge rendering).
   - **E2E-IN-204**: Unauthenticated access block on alerts route (Assert redirects to `/login` when cookies are cleared).
   - **E2E-IN-205**: Alerts access rejected for Parent role (Verify Parent role redirects to `/unauthorized`).
   - **E2E-COM-305**: Inventory Asset condition change triggers Maintenance notification (Cross-Feature: change asset condition to NEEDS_REPAIR -> Verify warning/maintenance alert appears on UI).
   - **E2E-WRK-404**: End-of-Term Inventory Asset Auditing & Restock (Real-World Workload: update asset condition to DISPOSED, check low stock consumables, trigger restock, verify alerts update).
2. Examine Next.js routes under `apps/web/src/app/(admin)/inventory`, server actions in `src/lib/actions/inventory.ts`, and schema in `src/lib/db/schema/inventory.ts`. If the UI forms/pages lack implementation (e.g. form submission buttons or inputs that are static placeholder layouts), please make necessary changes to the frontend and backend files (actions, pages) to make them fully functional and testable.
3. Ensure these tests use Playwright properly, login using the helper functions (like `loginAsAdmin`, `loginAsParent`), and check the database correctly using a PG Pool `runQuery` utility or direct Drizzle operations.
4. Run the test command to verify that your new tests run and pass:
   `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/inventory-core.spec.ts --workers=1`
5. Write your handoff.md in `/Users/adityasingh/PersonalWork/school-sis/.agents/worker_inventory/` with the results of your implementation, and send a message back to parent (sub_orch_e2e, conversation ID: 5842a9f6-c89a-4e06-ae0c-01eaa5796f9b) notifying them of completion.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
</USER_REQUEST>
