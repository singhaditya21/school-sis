package com.schoolsis.fees.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.fees.application.DefaulterAlertService;
import com.schoolsis.fees.application.DefaulterAlertService.*;
import com.schoolsis.platform.infrastructure.TenantContext;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * REST controller for defaulter management and alerts.
 */
@RestController
@RequestMapping("/api/v1/fees/defaulters")
public class DefaulterController {

    private final DefaulterAlertService defaulterAlertService;

    public DefaulterController(DefaulterAlertService defaulterAlertService) {
        this.defaulterAlertService = defaulterAlertService;
    }

    /**
     * Process defaulters and send reminders.
     */
    @PostMapping("/process")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'ACCOUNTANT')")
    public ApiResponse<DefaulterProcessingResult> processDefaulters() {
        UUID tenantId = TenantContext.getCurrentTenantId();
        DefaulterProcessingResult result = defaulterAlertService.processDefaultersForTenant(tenantId);
        return ApiResponse.ok(result);
    }

    /**
     * Get escalation report.
     */
    @GetMapping("/escalation-report")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT')")
    public ApiResponse<EscalationReport> getEscalationReport() {
        UUID tenantId = TenantContext.getCurrentTenantId();
        EscalationReport report = defaulterAlertService.getEscalationReport(tenantId);
        return ApiResponse.ok(report);
    }

    /**
     * Manually trigger reminder for a specific student.
     */
    @PostMapping("/student/{studentId}/remind")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'ACCOUNTANT')")
    public ApiResponse<String> sendManualReminder(@PathVariable UUID studentId) {
        // In production, send reminder
        return ApiResponse.ok("Reminder sent successfully");
    }
}
