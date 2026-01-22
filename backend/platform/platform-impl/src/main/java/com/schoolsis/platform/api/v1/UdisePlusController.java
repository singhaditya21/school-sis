package com.schoolsis.platform.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.platform.application.UdisePlusExportService;
import com.schoolsis.platform.application.UdisePlusExportService.*;
import com.schoolsis.platform.infrastructure.TenantContext;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * REST controller for UDISE+ regulatory exports.
 */
@RestController
@RequestMapping("/api/v1/compliance/udise")
public class UdisePlusController {

    private final UdisePlusExportService udisePlusExportService;

    public UdisePlusController(UdisePlusExportService udisePlusExportService) {
        this.udisePlusExportService = udisePlusExportService;
    }

    /**
     * Generate UDISE+ export for the current academic year.
     */
    @GetMapping("/export")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<UdisePlusExport> generateExport(
            @RequestParam(defaultValue = "2025-26") String academicYear) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        UdisePlusExport export = udisePlusExportService.generateExport(tenantId, academicYear);
        return ApiResponse.ok(export);
    }

    /**
     * Validate UDISE+ export before submission.
     */
    @PostMapping("/validate")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ApiResponse<List<ValidationError>> validateExport(@RequestBody UdisePlusExport export) {
        List<ValidationError> errors = udisePlusExportService.validateExport(export);
        return ApiResponse.ok(errors);
    }

    /**
     * Download UDISE+ export as JSON file.
     */
    @GetMapping("/download")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL')")
    public ResponseEntity<UdisePlusExport> downloadExport(
            @RequestParam(defaultValue = "2025-26") String academicYear) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        UdisePlusExport export = udisePlusExportService.generateExport(tenantId, academicYear);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=udise_export_" + academicYear + ".json")
                .contentType(MediaType.APPLICATION_JSON)
                .body(export);
    }
}
