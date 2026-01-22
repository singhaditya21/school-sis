package com.schoolsis.exams.api.v1;

import com.schoolsis.exams.application.GradingSchemeService;
import com.schoolsis.exams.application.GradingSchemeService.*;
import com.schoolsis.exams.domain.model.GradeThreshold;
import com.schoolsis.exams.domain.model.GradingScheme;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * REST API for managing grading schemes.
 */
@RestController
@RequestMapping("/api/v1/grading-schemes")
public class GradingSchemeController {

    private final GradingSchemeService service;

    public GradingSchemeController(GradingSchemeService service) {
        this.service = service;
    }

    /**
     * Get all grading schemes for the tenant.
     */
    @GetMapping
    public ResponseEntity<List<GradingSchemeResponse>> getAllSchemes(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @RequestParam(defaultValue = "false") boolean activeOnly) {

        List<GradingScheme> schemes = activeOnly
                ? service.getActiveSchemes(tenantId)
                : service.getAllSchemes(tenantId);

        List<GradingSchemeResponse> responses = schemes.stream()
                .map(this::toResponse)
                .toList();

        return ResponseEntity.ok(responses);
    }

    /**
     * Get a grading scheme by ID with thresholds.
     */
    @GetMapping("/{id}")
    public ResponseEntity<GradingSchemeDetailResponse> getScheme(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @PathVariable UUID id) {

        return service.getSchemeWithThresholds(tenantId, id)
                .map(this::toDetailResponse)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Create a new grading scheme.
     */
    @PostMapping
    public ResponseEntity<GradingSchemeDetailResponse> createScheme(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @Valid @RequestBody CreateGradingSchemeRequest request) {

        CreateSchemeRequest serviceRequest = new CreateSchemeRequest(
                request.name(),
                request.type(),
                request.description(),
                request.isDefault() != null && request.isDefault(),
                request.thresholds() != null ? request.thresholds().stream()
                        .map(t -> new ThresholdRequest(
                                t.minPercentage(),
                                t.maxPercentage(),
                                t.grade(),
                                t.gradePoint(),
                                t.remark(),
                                t.displayOrder()))
                        .toList() : null);

        GradingScheme scheme = service.createScheme(tenantId, serviceRequest);
        return ResponseEntity.ok(toDetailResponse(scheme));
    }

    /**
     * Update a grading scheme.
     */
    @PutMapping("/{id}")
    public ResponseEntity<GradingSchemeResponse> updateScheme(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateGradingSchemeRequest request) {

        UpdateSchemeRequest serviceRequest = new UpdateSchemeRequest(
                request.name(),
                request.description(),
                request.isActive(),
                request.isDefault());

        GradingScheme scheme = service.updateScheme(tenantId, id, serviceRequest);
        return ResponseEntity.ok(toResponse(scheme));
    }

    /**
     * Get the default grading scheme.
     */
    @GetMapping("/default")
    public ResponseEntity<GradingSchemeDetailResponse> getDefaultScheme(
            @RequestHeader("X-Tenant-Id") UUID tenantId) {

        return service.getDefaultScheme(tenantId)
                .map(this::toDetailResponse)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Calculate grade for a percentage using default scheme.
     */
    @GetMapping("/calculate")
    public ResponseEntity<GradeResult> calculateGrade(
            @RequestHeader("X-Tenant-Id") UUID tenantId,
            @RequestParam double percentage) {

        GradeResult result = service.calculateGrade(tenantId, percentage);
        return ResponseEntity.ok(result);
    }

    // Request DTOs
    public record CreateGradingSchemeRequest(
            @NotBlank String name,
            @NotNull GradingScheme.SchemeType type,
            String description,
            Boolean isDefault,
            List<ThresholdDTO> thresholds) {
    }

    public record UpdateGradingSchemeRequest(
            String name,
            String description,
            Boolean isActive,
            Boolean isDefault) {
    }

    public record ThresholdDTO(
            @NotNull BigDecimal minPercentage,
            @NotNull BigDecimal maxPercentage,
            @NotBlank String grade,
            BigDecimal gradePoint,
            String remark,
            Integer displayOrder) {
    }

    // Response DTOs
    public record GradingSchemeResponse(
            UUID id,
            String name,
            String type,
            String description,
            boolean isDefault,
            boolean isActive) {
    }

    public record GradingSchemeDetailResponse(
            UUID id,
            String name,
            String type,
            String description,
            boolean isDefault,
            boolean isActive,
            List<ThresholdResponse> thresholds) {
    }

    public record ThresholdResponse(
            UUID id,
            BigDecimal minPercentage,
            BigDecimal maxPercentage,
            String grade,
            BigDecimal gradePoint,
            String remark,
            Integer displayOrder) {
    }

    // Mappers
    private GradingSchemeResponse toResponse(GradingScheme scheme) {
        return new GradingSchemeResponse(
                scheme.getId(),
                scheme.getName(),
                scheme.getType().name(),
                scheme.getDescription(),
                scheme.isDefault(),
                scheme.isActive());
    }

    private GradingSchemeDetailResponse toDetailResponse(GradingScheme scheme) {
        List<ThresholdResponse> thresholds = scheme.getThresholds().stream()
                .map(this::toThresholdResponse)
                .toList();

        return new GradingSchemeDetailResponse(
                scheme.getId(),
                scheme.getName(),
                scheme.getType().name(),
                scheme.getDescription(),
                scheme.isDefault(),
                scheme.isActive(),
                thresholds);
    }

    private ThresholdResponse toThresholdResponse(GradeThreshold threshold) {
        return new ThresholdResponse(
                threshold.getId(),
                threshold.getMinPercentage(),
                threshold.getMaxPercentage(),
                threshold.getGrade(),
                threshold.getGradePoint(),
                threshold.getRemark(),
                threshold.getDisplayOrder());
    }
}
