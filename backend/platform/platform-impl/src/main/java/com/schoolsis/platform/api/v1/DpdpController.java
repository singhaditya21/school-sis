package com.schoolsis.platform.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.platform.application.DpdpComplianceService;
import com.schoolsis.platform.application.DpdpComplianceService.*;
import com.schoolsis.platform.infrastructure.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * REST controller for DPDP (Digital Personal Data Protection) compliance.
 * Handles data subject rights requests.
 */
@RestController
@RequestMapping("/api/v1/compliance/dpdp")
public class DpdpController {

        private final DpdpComplianceService dpdpService;

        public DpdpController(DpdpComplianceService dpdpService) {
                this.dpdpService = dpdpService;
        }

        /**
         * Request access to personal data.
         */
        @PostMapping("/access")
        @PreAuthorize("hasAnyRole('PARENT', 'STUDENT') or hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN')")
        public ApiResponse<DataAccessResponse> requestDataAccess(@Valid @RequestBody DataAccessRequestDto request) {
                UUID tenantId = TenantContext.getCurrentTenantId();
                DataAccessResponse response = dpdpService.processAccessRequest(
                                tenantId, request.dataSubjectId(), request.verificationToken());
                return ApiResponse.ok(response);
        }

        /**
         * Request data portability export.
         */
        @PostMapping("/portability")
        @PreAuthorize("hasAnyRole('PARENT', 'STUDENT') or hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN')")
        public ResponseEntity<DataPortabilityResponse> requestPortability(
                        @Valid @RequestBody PortabilityRequestDto request) {
                UUID tenantId = TenantContext.getCurrentTenantId();
                DataPortabilityResponse response = dpdpService.processPortabilityRequest(
                                tenantId, request.dataSubjectId(), request.format());

                String filename = "personal_data_export." + request.format().name().toLowerCase();
                return ResponseEntity.ok()
                                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + filename)
                                .body(response);
        }

        /**
         * Request data deletion.
         */
        @PostMapping("/deletion")
        @PreAuthorize("hasAnyRole('PARENT', 'STUDENT') or hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN')")
        public ApiResponse<DeletionResponse> requestDeletion(@Valid @RequestBody DeletionRequestDto request) {
                UUID tenantId = TenantContext.getCurrentTenantId();
                DeletionResponse response = dpdpService.processDeletionRequest(
                                tenantId, request.dataSubjectId(), request.reason());
                return ApiResponse.ok(response);
        }

        /**
         * Request data correction.
         */
        @PostMapping("/correction")
        @PreAuthorize("hasAnyRole('PARENT', 'STUDENT') or hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN')")
        public ApiResponse<CorrectionResponse> requestCorrection(@Valid @RequestBody CorrectionRequestDto request) {
                UUID tenantId = TenantContext.getCurrentTenantId();
                CorrectionResponse response = dpdpService.processCorrectionRequest(
                                tenantId, request.dataSubjectId(), request.corrections());
                return ApiResponse.ok(response);
        }

        /**
         * Create grievance ticket.
         */
        @PostMapping("/grievance")
        @PreAuthorize("hasAnyRole('PARENT', 'STUDENT') or hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN')")
        public ApiResponse<GrievanceTicket> createGrievance(@Valid @RequestBody GrievanceRequestDto request) {
                UUID tenantId = TenantContext.getCurrentTenantId();
                GrievanceTicket ticket = dpdpService.createGrievance(
                                tenantId, request.dataSubjectId(), request.category(), request.description());
                return ApiResponse.ok(ticket);
        }

        // Request DTOs
        public record DataAccessRequestDto(
                        @NotNull UUID dataSubjectId,
                        @NotNull String verificationToken) {
        }

        public record PortabilityRequestDto(
                        @NotNull UUID dataSubjectId,
                        @NotNull ExportFormat format) {
        }

        public record DeletionRequestDto(
                        @NotNull UUID dataSubjectId,
                        String reason) {
        }

        public record CorrectionRequestDto(
                        @NotNull UUID dataSubjectId,
                        @NotNull Map<String, String> corrections) {
        }

        public record GrievanceRequestDto(
                        @NotNull UUID dataSubjectId,
                        @NotNull String category,
                        @NotNull String description) {
        }
}
