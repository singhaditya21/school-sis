package com.schoolsis.exams.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.exams.application.CbseReportCardService;
import com.schoolsis.exams.application.CbseReportCardService.*;
import com.schoolsis.platform.infrastructure.TenantContext;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * REST controller for report card generation.
 */
@RestController
@RequestMapping("/api/v1/report-cards")
public class ReportCardController {

    private final CbseReportCardService reportCardService;

    public ReportCardController(CbseReportCardService reportCardService) {
        this.reportCardService = reportCardService;
    }

    /**
     * Generate CBSE report card for a student.
     */
    @GetMapping("/student/{studentId}/exam/{examId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER', 'PARENT')")
    public ApiResponse<CbseReportCard> generateReportCard(
            @PathVariable UUID studentId,
            @PathVariable UUID examId) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        CbseReportCard reportCard = reportCardService.generateReportCard(tenantId, studentId, examId);
        return ApiResponse.ok(reportCard);
    }

    /**
     * Download report card as PDF.
     */
    @GetMapping("/student/{studentId}/exam/{examId}/pdf")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER', 'PARENT')")
    public ResponseEntity<byte[]> downloadReportCardPdf(
            @PathVariable UUID studentId,
            @PathVariable UUID examId) {
        UUID tenantId = TenantContext.getCurrentTenantId();

        // Generate report card data (used for PDF generation in production)
        CbseReportCard reportCard = reportCardService.generateReportCard(tenantId, studentId, examId);
        // TODO: Implement actual PDF generation using reportCard data
        byte[] pdfBytes = new byte[0]; // Placeholder - would use reportCard.student().name(), etc.
        String filename = "report_card_" + reportCard.student().name().replace(" ", "_") + ".pdf";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=" + filename)
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdfBytes);
    }

    /**
     * Bulk generate report cards for a class.
     */
    @PostMapping("/bulk/class/{classId}/exam/{examId}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER')")
    public ApiResponse<BulkGenerationResult> bulkGenerateReportCards(
            @PathVariable UUID classId,
            @PathVariable UUID examId) {
        // In production, iterate through all students in class
        return ApiResponse.ok(new BulkGenerationResult(0, 0, 0));
    }

    public record BulkGenerationResult(
            int totalStudents,
            int generated,
            int failed) {
    }
}
