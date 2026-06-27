# E2E Test Infra: School SIS Migrated Modules

## Test Philosophy

- Opaque-box, requirement-driven. We test user-facing flows of the migrated modules.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory

| #   | Feature                         | Source (Requirement)                    | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
| --- | ------------------------------- | --------------------------------------- | :----: | :----: | :----: | :----: |
| 1   | Gradebook Relative Grading      | /teacher/gradebook page                 |   5    |   5    |   ✓    |   ✓    |
| 2   | Hostel Fees Management          | /hostel/fees page                       |   5    |   5    |   ✓    |   ✓    |
| 3   | Timetable Substitution Requests | /timetable/substitution page            |   5    |   5    |   ✓    |   ✓    |
| 4   | Library Issue & Returns         | /library/issue & /library/history pages |   5    |   5    |   ✓    |   ✓    |
| 5   | Diary & Appointments            | /diary & /appointments pages            |   5    |   5    |   ✓    |   ✓    |

## Test Architecture

- **Test Runner**: Playwright
- **Invocation Command**: `LIMIT_DB_POOL_MAX=20 DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e e2e/migrated-modules.spec.ts`
- **Pass/Fail Semantics**: All tests must complete with exit code 0.
- **Directory Layout**: E2E tests are located in `apps/web/e2e/`.

## Real-World Application Scenarios (Tier 4)

| #   | Scenario                    | Features Exercised                                                                 | Complexity | Status |
| --- | --------------------------- | ---------------------------------------------------------------------------------- | ---------- | ------ |
| 1   | End-of-term grading         | Gradebook (selection, entries, relative curve, publish)                            | High       | Passed |
| 2   | Library rental lifecycle    | Library catalog search, student select, issue, return, history check               | Medium     | Passed |
| 3   | Daily school substitution   | Absentee check, new substitution request, assignment of substitute                 | Medium     | Passed |
| 4   | Term-end hostel fee audit   | Outstanding and paid fees filtering, metrics checking                              | Medium     | Passed |
| 5   | Parent communication loop   | Diary entry check by parent, appointment verification                              | High       | Passed |

## Coverage Summary

- **Tier 1 (Happy Path)**: 25 test cases (5 per module)
- **Tier 2 (Boundary & Corner Cases)**: 25 test cases (5 per module)
- **Tier 3 (Cross-Feature Combinations)**: 5 test cases
- **Tier 4 (Real-World Workloads)**: 5 test cases
- **Total E2E test cases**: 60 (100% pass rate)

