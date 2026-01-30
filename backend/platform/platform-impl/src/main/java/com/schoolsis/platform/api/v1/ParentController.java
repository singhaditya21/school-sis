package com.schoolsis.platform.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.platform.infrastructure.TenantContext;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

import java.time.LocalDate;
import java.util.*;

/**
 * REST controller for parent-specific endpoints.
 * Parents can view their children's fees, attendance, and results.
 */
@RestController
@RequestMapping("/api/v1/parent")
@PreAuthorize("hasAnyRole('PARENT', 'SUPER_ADMIN')")
public class ParentController {

        // ========== Children Endpoints ==========

        @GetMapping("/children")
        public ApiResponse<List<ChildResponse>> getChildren() {
                // TODO: Use tenantId for multi-tenant filtering
                // UUID tenantId = TenantContext.getCurrentTenantId();

                // TODO: Implement actual parent-child relationship lookup
                // For now, return mock data for demo
                List<ChildResponse> children = List.of(
                                new ChildResponse(
                                                UUID.randomUUID(),
                                                "Aarav Singh",
                                                "STU-2024-001",
                                                "Grade 8",
                                                "Section A",
                                                "https://api.dicebear.com/7.x/avataaars/svg?seed=Aarav"));

                return ApiResponse.ok(children);
        }

        // ========== Fees Endpoints ==========

        @GetMapping("/fees")
        public ApiResponse<List<InvoiceResponse>> getChildFees(
                        @RequestParam(required = false) UUID childId) {
                UUID tenantId = TenantContext.getCurrentTenantId();

                // TODO: Implement actual invoice lookup by parent's child
                // For now, return mock data for demo
                List<InvoiceResponse> invoices = List.of(
                                new InvoiceResponse(
                                                UUID.randomUUID(),
                                                "INV-2026-001",
                                                BigDecimal.valueOf(45000),
                                                BigDecimal.ZERO,
                                                BigDecimal.valueOf(45000),
                                                LocalDate.of(2026, 2, 15),
                                                "PENDING",
                                                "Term 3 Tuition Fee"),
                                new InvoiceResponse(
                                                UUID.randomUUID(),
                                                "INV-2026-002",
                                                BigDecimal.valueOf(5000),
                                                BigDecimal.valueOf(2500),
                                                BigDecimal.valueOf(2500),
                                                LocalDate.of(2026, 1, 30),
                                                "PARTIAL",
                                                "Transport Fee - Q4"),
                                new InvoiceResponse(
                                                UUID.randomUUID(),
                                                "INV-2025-012",
                                                BigDecimal.valueOf(43000),
                                                BigDecimal.valueOf(43000),
                                                BigDecimal.ZERO,
                                                LocalDate.of(2025, 11, 15),
                                                "PAID",
                                                "Term 2 Tuition Fee"));

                return ApiResponse.ok(invoices);
        }

        // ========== Attendance Endpoints ==========

        @GetMapping("/attendance")
        public ApiResponse<AttendanceResponse> getChildAttendance(
                        @RequestParam(required = false) UUID childId,
                        @RequestParam(required = false) Integer month,
                        @RequestParam(required = false) Integer year) {
                // TODO: Use tenantId for attendance lookup
                // UUID tenantId = TenantContext.getCurrentTenantId();

                // Default to current month/year if not provided
                int targetMonth = month != null ? month : LocalDate.now().getMonthValue();
                int targetYear = year != null ? year : LocalDate.now().getYear();

                // TODO: Implement actual attendance lookup
                // For now, return mock data
                List<AttendanceRecord> records = generateMockAttendance(targetYear, targetMonth);

                // Calculate stats
                long totalDays = records.stream().filter(r -> r.status() != null && !r.status().equals("HOLIDAY"))
                                .count();
                long presentDays = records.stream()
                                .filter(r -> "PRESENT".equals(r.status()) || "LATE".equals(r.status()))
                                .count();
                long absentDays = records.stream().filter(r -> "ABSENT".equals(r.status())).count();
                double percentage = totalDays > 0 ? (presentDays * 100.0 / totalDays) : 0;

                AttendanceStats stats = new AttendanceStats(
                                (int) totalDays,
                                (int) presentDays,
                                (int) absentDays,
                                Math.round(percentage * 10) / 10.0);

                return ApiResponse.ok(new AttendanceResponse(records, stats));
        }

        // ========== Results Endpoints ==========

        @GetMapping("/results")
        public ApiResponse<List<ExamResultResponse>> getChildResults(
                        @RequestParam(required = false) UUID childId,
                        @RequestParam(required = false) String term) {
                UUID tenantId = TenantContext.getCurrentTenantId();

                // TODO: Implement actual exam results lookup
                // For now, return mock data
                List<ExamResultResponse> results = List.of(
                                new ExamResultResponse(
                                                UUID.randomUUID(),
                                                "Mid-Term Examination",
                                                "Term 1",
                                                List.of(
                                                                new SubjectMark("Mathematics", 100, 92, "A1"),
                                                                new SubjectMark("Science", 100, 88, "A2"),
                                                                new SubjectMark("English", 100, 85, "A2"),
                                                                new SubjectMark("Hindi", 100, 78, "B1"),
                                                                new SubjectMark("Social Science", 100, 82, "A2")),
                                                500,
                                                425,
                                                85.0,
                                                "A",
                                                5),
                                new ExamResultResponse(
                                                UUID.randomUUID(),
                                                "Unit Test 2",
                                                "Term 1",
                                                List.of(
                                                                new SubjectMark("Mathematics", 50, 45, "A1"),
                                                                new SubjectMark("Science", 50, 42, "A2"),
                                                                new SubjectMark("English", 50, 40, "A2")),
                                                150,
                                                127,
                                                84.67,
                                                "A",
                                                null));

                // Filter by term if provided
                if (term != null && !term.isEmpty()) {
                        results = results.stream()
                                        .filter(r -> r.term().equals(term))
                                        .toList();
                }

                return ApiResponse.ok(results);
        }

        // ========== Helper Methods ==========

        private List<AttendanceRecord> generateMockAttendance(int year, int month) {
                List<AttendanceRecord> records = new ArrayList<>();
                LocalDate startDate = LocalDate.of(year, month, 1);
                int daysInMonth = startDate.lengthOfMonth();
                LocalDate today = LocalDate.now();

                String[] statuses = { "PRESENT", "PRESENT", "PRESENT", "PRESENT", "PRESENT", "ABSENT", "LATE" };
                Random random = new Random(year * 100 + month); // Consistent random for demo

                for (int day = 1; day <= daysInMonth; day++) {
                        LocalDate date = LocalDate.of(year, month, day);
                        String status = null;

                        if (date.isAfter(today)) {
                                status = null; // Future date
                        } else if (date.getDayOfWeek().getValue() == 7) {
                                status = "HOLIDAY"; // Sunday
                        } else {
                                status = statuses[random.nextInt(statuses.length)];
                        }

                        records.add(new AttendanceRecord(date.toString(), status));
                }

                return records;
        }

        // ========== Response Records ==========

        public record ChildResponse(
                        UUID id,
                        String name,
                        String admissionNumber,
                        String grade,
                        String section,
                        String avatarUrl) {
        }

        public record InvoiceResponse(
                        UUID id,
                        String invoiceNumber,
                        BigDecimal amount,
                        BigDecimal paidAmount,
                        BigDecimal balanceAmount,
                        LocalDate dueDate,
                        String status,
                        String description) {
        }

        public record AttendanceResponse(
                        List<AttendanceRecord> records,
                        AttendanceStats stats) {
        }

        public record AttendanceRecord(
                        String date,
                        String status) {
        }

        public record AttendanceStats(
                        int totalDays,
                        int presentDays,
                        int absentDays,
                        double percentage) {
        }

        public record ExamResultResponse(
                        UUID id,
                        String examName,
                        String term,
                        List<SubjectMark> subjects,
                        int totalMarks,
                        int obtainedMarks,
                        double percentage,
                        String grade,
                        Integer rank) {
        }

        public record SubjectMark(
                        String subject,
                        int maxMarks,
                        int obtainedMarks,
                        String grade) {
        }
}
