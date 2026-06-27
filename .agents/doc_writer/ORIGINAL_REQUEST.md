## 2026-06-27T07:01:21Z
Please create a new file at `/Users/adityasingh/PersonalWork/school-sis/TEST_INFRA.md` documenting the E2E test infrastructure.
Use the following content structure:

# E2E Test Infra: School SIS Migrated Modules

## Test Philosophy
- Opaque-box, requirement-driven. We test user-facing flows of the migrated modules.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Gradebook Relative Grading | /teacher/gradebook page | 5 | 1 | ✓ |
| 2 | Hostel Fees Management | /hostel/fees page | 5 | 1 | ✓ |
| 3 | Timetable Substitution Requests | /timetable/substitution page | 5 | 1 | ✓ |
| 4 | Library Issue & Returns | /library/issue & /library/history pages | 5 | 1 | ✓ |
| 5 | Diary & Appointments | /diary & /appointments pages | 5 | 1 | ✓ |

## Test Architecture
- **Test Runner**: Playwright
- **Invocation Command**: `pnpm --filter @school-sis/web test:e2e`
- **Pass/Fail Semantics**: All tests must complete with exit code 0.
- **Directory Layout**: E2E tests are located in `apps/web/e2e/`.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Teacher End-of-Term Grading | Gradebook (selection, entries, relative curve, publish) + Diary entry announcement | High |
| 2 | Library Lending Lifecycle | Library search, select student, issue, return, history status check | Medium |

## Coverage Thresholds
- Tier 1: >=5 test cases per feature/module.
- Tier 2: Boundary value and empty states coverage.
- Tier 3: Cross-feature combinations (Lending flow to history).
- Tier 4: Real-world user workload scenarios.

Verify the file compiles and looks correct on disk.

## 2026-06-27T16:02:05Z
Please create a file at `/Users/adityasingh/PersonalWork/school-sis/TEST_READY.md` with the following content:

# E2E Test Suite Ready

## Test Runner
- Command: `DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e`
- Expected: all tests pass with exit code 0

## Coverage Summary
| Tier | Count | Description |
|------|------:|-------------|
| 1. Feature Coverage | 25 | 5 test cases per feature for 5 migrated modules |
| 2. Boundary & Corner | 15 | Boundary case inputs and empty states |
| 3. Cross-Feature | 10 | Combinations (e.g. checkout -> history -> return) |
| 4. Real-World Application | 10 | Comprehensive workflows (end-of-term grading, library book lifecycle) |
| **Total** | **60** | |

## Feature Checklist
| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---------|:------:|:------:|:------:|:------:|
| Gradebook | 5 | 2 | ✓ | ✓ |
| Hostel Fees | 5 | 1 | ✓ | |
| Timetable Substitution | 5 | 2 | ✓ | |
| Library | 5 | 1 | ✓ | ✓ |
| Diary & Appointments | 5 | 2 | | |

Verify the file compiles and looks correct on disk.

