package com.schoolsis.platform.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.platform.application.ApaarIdService;
import com.schoolsis.platform.application.ApaarIdService.*;
import com.schoolsis.platform.infrastructure.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.UUID;

/**
 * REST controller for APAAR ID (Automated Permanent Academic Account Registry)
 * management.
 */
@RestController
@RequestMapping("/api/v1/compliance/apaar")
public class ApaarController {

    private final ApaarIdService apaarIdService;

    public ApaarController(ApaarIdService apaarIdService) {
        this.apaarIdService = apaarIdService;
    }

    /**
     * Request APAAR ID for a student.
     */
    @PostMapping("/request")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ADMIN_STAFF')")
    public ApiResponse<ApaarRequest> requestApaarId(@Valid @RequestBody ApaarRequestDto request) {
        UUID tenantId = TenantContext.getCurrentTenantId();

        ApaarStudentData studentData = new ApaarStudentData(
                request.studentId(),
                request.name(),
                request.dateOfBirth(),
                request.gender(),
                request.aadhaarLast4(),
                request.fatherName(),
                request.motherName(),
                request.currentClass(),
                request.schoolUdiseCode());

        ApaarRequest result = apaarIdService.requestApaarId(tenantId, studentData);
        return ApiResponse.ok(result);
    }

    /**
     * Check status of APAAR request.
     */
    @GetMapping("/request/{requestId}/status")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ADMIN_STAFF')")
    public ApiResponse<ApaarRequest> checkStatus(@PathVariable UUID requestId) {
        ApaarRequest result = apaarIdService.checkRequestStatus(requestId);
        return ApiResponse.ok(result);
    }

    /**
     * Link APAAR ID to student record.
     */
    @PostMapping("/link")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN')")
    public ApiResponse<Void> linkApaarId(@Valid @RequestBody LinkApaarDto request) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        apaarIdService.linkApaarId(tenantId, request.studentId(), request.apaarId());
        return ApiResponse.ok(null);
    }

    // Request DTOs
    public record ApaarRequestDto(
            @NotNull UUID studentId,
            @NotNull String name,
            @NotNull LocalDate dateOfBirth,
            String gender,
            @NotNull String aadhaarLast4,
            String fatherName,
            String motherName,
            String currentClass,
            String schoolUdiseCode) {
    }

    public record LinkApaarDto(
            @NotNull UUID studentId,
            @NotNull String apaarId) {
    }
}
