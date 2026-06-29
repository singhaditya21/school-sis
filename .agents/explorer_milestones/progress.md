# Progress — 2026-06-29T06:55:00Z

Last visited: 2026-06-29T06:55:00Z

- [x] Step 1: Examine `insert_e2e_users.sql` and `diary-appointments-services.test.ts`
- [x] Step 2: Read `diary.service.ts` and `appointments.service.ts`
- [x] Step 3: Read `apps/web/src/lib/actions/treasury.ts` and check `getTreasurySummaryAction` filters/isolation
- [x] Step 4: Locate and read Tally vouchers route under `apps/web/src/app/api/integrations/tally/vouchers/route.ts` and check SQL query column names
- [x] Step 5: Identify wiring of ledgers, exceptions list, and `/integrations/tally` export client component
- [x] Step 6: Read `apps/web/src/lib/actions/hq.ts` and check non-existent `updated_at` issue in `hq_groups` query
- [x] Step 7: Read `hq/broadcasts/page.tsx`, `hq/leads/page.tsx`, `hq/treasury/page.tsx`, and platform.ts/platform-broadcasts.ts actions to identify casing mismatches, non-existent columns/properties, and type mismatches
- [x] Step 8: Read `higher_ed.ts` and `alumni.ts` actions to check for the non-existent `updated_at` query issue
- [x] Step 9: Locate and read `alumni.service.ts` and check `alumni_profiles` versus `alumni` usage and correct columns
- [x] Step 10: Explore `/international` student operations (visas, host families, placements) and how to implement actions for them
- [x] Step 11: Explore other pages and files that need to be wired (metrics, events, placements, alumni, documents, diary)
- [ ] Step 12: Write comprehensive report to `analysis.md` and report back
