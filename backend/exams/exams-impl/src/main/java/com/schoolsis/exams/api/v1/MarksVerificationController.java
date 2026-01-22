package com.schoolsis.exams.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.exams.domain.model.Mark;
import com.schoolsis.exams.domain.model.Mark.VerificationStatus;
import com.schoolsis.exams.domain.repository.MarkRepository;
import com.schoolsis.platform.application.AuditService;
import com.schoolsis.platform.infrastructure.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * REST controller for marks verification workflow.
 */
@RestController
@RequestMapping("/api/v1/marks/verification")
public class MarksVerificationController {

    private final MarkRepository markRepository;
    private final AuditService auditService;

    public MarksVerificationController(MarkRepository markRepository, AuditService auditService) {
        this.markRepository = markRepository;
        this.auditService = auditService;
    }

    /**
     * Get marks pending verification for an exam.
     */
    @GetMapping("/pending/exam/{examId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<List<MarkVerificationDto>> getPendingVerifications(@PathVariable UUID examId) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        List<Mark> marks = markRepository.findByTenantIdAndExamIdAndVerificationStatus(
                tenantId, examId, VerificationStatus.PENDING);

        List<MarkVerificationDto> dtos = marks.stream()
                .map(this::toDto)
                .toList();

        return ApiResponse.ok(dtos);
    }

    /**
     * Verify (approve) marks.
     */
    @PostMapping("/verify")
    @ResponseStatus(HttpStatus.OK)
    @Transactional
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<VerificationResultDto> verifyMarks(@Valid @RequestBody VerifyMarksRequest request) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        int verified = 0;

        for (UUID markId : request.markIds()) {
            Mark mark = markRepository.findById(markId).orElse(null);
            if (mark != null && mark.getTenantId().equals(tenantId) && mark.isPending()) {
                mark.verify(request.verifierId());
                markRepository.save(mark);
                verified++;
            }
        }

        auditService.log(tenantId, request.verifierId(), "VERIFY_MARKS", "Mark", request.markIds().get(0));

        return ApiResponse.ok(new VerificationResultDto(verified, 0, request.markIds().size()));
    }

    /**
     * Reject marks with reason.
     */
    @PostMapping("/reject")
    @ResponseStatus(HttpStatus.OK)
    @Transactional
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<VerificationResultDto> rejectMarks(@Valid @RequestBody RejectMarksRequest request) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        int rejected = 0;

        for (UUID markId : request.markIds()) {
            Mark mark = markRepository.findById(markId).orElse(null);
            if (mark != null && mark.getTenantId().equals(tenantId) && mark.isPending()) {
                mark.reject(request.verifierId(), request.reason());
                markRepository.save(mark);
                rejected++;
            }
        }

        auditService.log(tenantId, request.verifierId(), "REJECT_MARKS", "Mark", request.markIds().get(0));

        return ApiResponse.ok(new VerificationResultDto(0, rejected, request.markIds().size()));
    }

    /**
     * Get verification statistics for an exam.
     */
    @GetMapping("/stats/exam/{examId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<VerificationStatsDto> getVerificationStats(@PathVariable UUID examId) {
        UUID tenantId = TenantContext.getCurrentTenantId();

        long pending = markRepository.countByTenantIdAndExamIdAndVerificationStatus(
                tenantId, examId, VerificationStatus.PENDING);
        long verified = markRepository.countByTenantIdAndExamIdAndVerificationStatus(
                tenantId, examId, VerificationStatus.VERIFIED);
        long rejected = markRepository.countByTenantIdAndExamIdAndVerificationStatus(
                tenantId, examId, VerificationStatus.REJECTED);

        return ApiResponse.ok(new VerificationStatsDto(pending, verified, rejected));
    }

    private MarkVerificationDto toDto(Mark mark) {
        return new MarkVerificationDto(
                mark.getId(),
                mark.getExamId(),
                mark.getStudentId(),
                mark.getSubjectId(),
                mark.getMarksObtained(),
                mark.getEnteredBy(),
                mark.getVerificationStatus());
    }

    // DTOs
    public record MarkVerificationDto(
            UUID markId,
            UUID examId,
            UUID studentId,
            UUID subjectId,
            java.math.BigDecimal marksObtained,
            UUID enteredBy,
            VerificationStatus status) {
    }

    public record VerifyMarksRequest(
            @NotNull List<UUID> markIds,
            @NotNull UUID verifierId) {
    }

    public record RejectMarksRequest(
            @NotNull List<UUID> markIds,
            @NotNull UUID verifierId,
            @NotNull String reason) {
    }

    public record VerificationResultDto(
            int verified,
            int rejected,
            int total) {
    }

    public record VerificationStatsDto(
            long pending,
            long verified,
            long rejected) {
    }
}
