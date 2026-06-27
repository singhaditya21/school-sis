## 2026-06-27T15:10:50Z
You are the E2E test builder worker.
Your working directory is: /Users/adityasingh/PersonalWork/school-sis/.agents/worker_e2e_builder_gen3.
Your parent conversation ID is: 6c5ea5a0-03b9-4c0b-ad91-71a1d5b68b38.

Task:
1. Fix NextJS build compilation errors:
   a. In `apps/web/src/lib/services/library/library.service.ts`, move `Book` and `BookIssue` interface definitions to `apps/web/src/lib/services/library/types.ts`. Remove them from `library.service.ts` to ensure it only exports async functions.
   b. In `apps/web/src/lib/services/hostel/hostel.service.ts`, move `Hostel` and `HostelRoom` interface definitions to `apps/web/src/lib/services/hostel/types.ts`. Convert the methods of `HostelService` object (`getHostels`, `getRooms`, `getStats`) into separate exported async functions, and delete the `HostelService` object export. Make sure it does not export any non-async-functions.
2. Edit `apps/web/scripts/seed.ts`:
   - Hardcode the tenant insertion values to use `id: '0c413c23-6f0f-40ab-bd41-73e6e996ff35'` for the Greenwood tenant.
   - For Aarav Sharma (the first student inserted, index 0), pass `id: 'ad50cb20-83f0-42bf-bce6-770addf54375'` to the insert values.
3. Create `apps/web/scripts/run-e2e-sql.ts` to execute `insert_e2e_users.sql` against the database:
   - Use the `DATABASE_URL` environment variable and `postgres` package (which is already a dependency of @school-sis/web) to read and run all statements inside `/Users/adityasingh/PersonalWork/school-sis/insert_e2e_users.sql`.
4. Initialize and seed the database:
   - Run `pnpm --filter @school-sis/web db:push`
   - Run `pnpm --filter @school-sis/web db:seed`
   - Run `pnpm --filter @school-sis/web tsx scripts/run-e2e-sql.ts`
5. Fix mismatch in existing E2E tests:
   - In `apps/web/e2e/complete-e2e.spec.ts` and `apps/web/e2e/phase1-features.spec.ts`, look for `page.waitForURL('/teacher/dashboard')` or `page.goto('/teacher/dashboard')` and change it to wait for/go to `/dashboard` (since teacher's login redirects to `/dashboard`).
6. Implement new E2E tests for the 5 migrated modules:
   - Create a new Playwright test file `apps/web/e2e/migrated-modules.spec.ts`.
   - Write tests for Gradebook (`/teacher/gradebook`), Hostel Fees (`/hostel/fees`), Timetable Substitution (`/timetable/substitution`), Library History/Issue (`/library/history` & `/library/issue`), and Diary/Appointments (`/diary` & `/appointments`).
   - Use the `admin@schoolsis.com` / `admin123` and `teacher@schoolsis.com` / `teacher123` credentials where appropriate.
7. Run and verify the tests:
   - Start the next dev server (or let Playwright do it via the webServer config in `playwright.config.ts`).
   - Run the E2E tests using `pnpm --filter @school-sis/web test:e2e`.
   - Verify that all tests compile and pass. Capture test results.
8. Document:
   - Write `TEST_INFRA.md` at project root documenting the test architecture, methodologies, and tiers.
   - Write `TEST_READY.md` at project root with a checklist of the test suites, execution commands, and verified results.
9. Report back with your findings and the absolute paths of created/edited files.
