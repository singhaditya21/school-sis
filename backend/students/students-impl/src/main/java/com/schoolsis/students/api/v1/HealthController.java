package com.schoolsis.students.api.v1;

import com.schoolsis.students.application.HealthRecordService;
import com.schoolsis.students.domain.model.HealthRecord;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * REST API for Health & Physical Checkup (HPC) records.
 * Required for CBSE compliance and report card generation.
 */
@RestController
@RequestMapping("/api/v1/health-records")
public class HealthController {

        private final HealthRecordService healthRecordService;

        public HealthController(HealthRecordService healthRecordService) {
                this.healthRecordService = healthRecordService;
        }

        /**
         * Create or update health record for a student.
         */
        @PostMapping
        public ResponseEntity<HealthRecordResponse> createOrUpdateHealthRecord(
                        @RequestHeader("X-Tenant-Id") UUID tenantId,
                        @Valid @RequestBody CreateHealthRecordRequest request,
                        @AuthenticationPrincipal UserDetails user) {

                HealthRecordService.CreateHealthRecordRequest serviceRequest = new HealthRecordService.CreateHealthRecordRequest(
                                request.studentId(),
                                request.academicYearId(),
                                request.checkupDate(),
                                request.height(),
                                request.weight(),
                                request.bloodGroup(),
                                request.vision(),
                                request.dental(),
                                request.hearing(),
                                request.generalHealth(),
                                request.notes(),
                                UUID.fromString(user.getUsername()) // recordedBy
                );

                HealthRecord record = healthRecordService.saveHealthRecord(tenantId, serviceRequest);
                return ResponseEntity.ok(toResponse(record));
        }

        /**
         * Get health record for a student in an academic year.
         */
        @GetMapping("/students/{studentId}")
        public ResponseEntity<HealthRecordResponse> getHealthRecord(
                        @RequestHeader("X-Tenant-Id") UUID tenantId,
                        @PathVariable UUID studentId,
                        @RequestParam UUID academicYearId) {

                return healthRecordService.getHealthRecord(tenantId, studentId, academicYearId)
                                .map(record -> ResponseEntity.ok(toResponse(record)))
                                .orElse(ResponseEntity.notFound().build());
        }

        /**
         * Get health history for a student across all years.
         */
        @GetMapping("/students/{studentId}/history")
        public ResponseEntity<List<HealthRecordResponse>> getHealthHistory(
                        @RequestHeader("X-Tenant-Id") UUID tenantId,
                        @PathVariable UUID studentId) {

                List<HealthRecord> records = healthRecordService.getStudentHealthHistory(tenantId, studentId);
                List<HealthRecordResponse> responses = records.stream().map(this::toResponse).toList();
                return ResponseEntity.ok(responses);
        }

        /**
         * Get all health records for an academic year.
         */
        @GetMapping("/academic-years/{academicYearId}")
        public ResponseEntity<List<HealthRecordResponse>> getHealthRecordsByYear(
                        @RequestHeader("X-Tenant-Id") UUID tenantId,
                        @PathVariable UUID academicYearId) {

                List<HealthRecord> records = healthRecordService.getHealthRecordsByAcademicYear(tenantId,
                                academicYearId);
                List<HealthRecordResponse> responses = records.stream().map(this::toResponse).toList();
                return ResponseEntity.ok(responses);
        }

        /**
         * Bulk fetch health records for multiple students (for report cards).
         */
        @PostMapping("/bulk")
        public ResponseEntity<List<HealthRecordResponse>> getHealthRecordsForStudents(
                        @RequestHeader("X-Tenant-Id") UUID tenantId,
                        @RequestBody BulkHealthRecordRequest request) {

                List<HealthRecord> records = healthRecordService.getHealthRecordsForStudents(
                                tenantId, request.studentIds(), request.academicYearId());
                List<HealthRecordResponse> responses = records.stream().map(this::toResponse).toList();
                return ResponseEntity.ok(responses);
        }

        /**
         * Get health record coverage statistics.
         */
        @GetMapping("/coverage")
        public ResponseEntity<HealthCoverageResponse> getCoverage(
                        @RequestHeader("X-Tenant-Id") UUID tenantId,
                        @RequestParam UUID academicYearId) {

                long count = healthRecordService.countHealthRecords(tenantId, academicYearId);
                return ResponseEntity.ok(new HealthCoverageResponse(count, academicYearId));
        }

        // DTOs
        public record CreateHealthRecordRequest(
                        @NotNull UUID studentId,
                        @NotNull UUID academicYearId,
                        LocalDate checkupDate,
                        BigDecimal height,
                        BigDecimal weight,
                        String bloodGroup,
                        String vision,
                        String dental,
                        String hearing,
                        String generalHealth,
                        String notes) {
        }

        public record BulkHealthRecordRequest(
                        @NotNull List<UUID> studentIds,
                        @NotNull UUID academicYearId) {
        }

        public record HealthRecordResponse(
                        UUID id,
                        UUID studentId,
                        UUID academicYearId,
                        LocalDate checkupDate,
                        BigDecimal height,
                        BigDecimal weight,
                        BigDecimal bmi,
                        String bmiCategory,
                        String bloodGroup,
                        String vision,
                        String dental,
                        String hearing,
                        String generalHealth,
                        String notes,
                        UUID recordedBy) {
        }

        public record HealthCoverageResponse(
                        long recordCount,
                        UUID academicYearId) {
        }

        private HealthRecordResponse toResponse(HealthRecord record) {
                return new HealthRecordResponse(
                                record.getId(),
                                record.getStudentId(),
                                record.getAcademicYearId(),
                                record.getCheckupDate(),
                                record.getHeight(),
                                record.getWeight(),
                                record.getBmi(),
                                record.getBmiCategory(),
                                record.getBloodGroup(),
                                record.getVision(),
                                record.getDental(),
                                record.getHearing(),
                                record.getGeneralHealth(),
                                record.getNotes(),
                                record.getRecordedBy());
        }
}
