# E2E Test Suite Ready

## Test Runner

- Command: `DATABASE_URL="postgresql://adityasingh@localhost:5432/school_sis" pnpm --filter @school-sis/web test:e2e`
- Expected: all tests pass with exit code 0

## Coverage Summary

| Tier                      |  Count | Description                                                           |
| ------------------------- | -----: | --------------------------------------------------------------------- |
| 1. Feature Coverage       |     25 | 5 test cases per feature for 5 migrated modules                       |
| 2. Boundary & Corner      |     15 | Boundary case inputs and empty states                                 |
| 3. Cross-Feature          |     10 | Combinations (e.g. checkout -> history -> return)                     |
| 4. Real-World Application |     10 | Comprehensive workflows (end-of-term grading, library book lifecycle) |
| **Total**                 | **60** |                                                                       |

## Feature Checklist

| Feature                | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
| ---------------------- | :----: | :----: | :----: | :----: |
| Gradebook              |   5    |   2    |   ✓    |   ✓    |
| Hostel Fees            |   5    |   1    |   ✓    |        |
| Timetable Substitution |   5    |   2    |   ✓    |        |
| Library                |   5    |   1    |   ✓    |   ✓    |
| Diary & Appointments   |   5    |   2    |        |        |
