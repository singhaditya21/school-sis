package com.schoolsis.exams.application;

import com.schoolsis.exams.domain.model.GradeThreshold;
import com.schoolsis.exams.domain.model.GradingScheme;
import com.schoolsis.exams.domain.model.GradingScheme.SchemeType;
import com.schoolsis.exams.domain.repository.GradingSchemeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Service for managing grading schemes.
 */
@Service
@Transactional
public class GradingSchemeService {

    private final GradingSchemeRepository repository;

    public GradingSchemeService(GradingSchemeRepository repository) {
        this.repository = repository;
    }

    /**
     * Create a new grading scheme.
     */
    public GradingScheme createScheme(UUID tenantId, CreateSchemeRequest request) {
        if (repository.existsByTenantIdAndName(tenantId, request.name())) {
            throw new IllegalArgumentException("Grading scheme with name '" + request.name() + "' already exists");
        }

        GradingScheme scheme = new GradingScheme(request.name(), request.type(), request.description());
        scheme.setTenantId(tenantId);

        // If this is marked as default, unset other defaults
        if (request.isDefault()) {
            repository.findByTenantIdAndIsDefaultTrue(tenantId)
                    .ifPresent(existing -> {
                        existing.setDefault(false);
                        repository.save(existing);
                    });
            scheme.setDefault(true);
        }

        // Add thresholds
        if (request.thresholds() != null) {
            for (ThresholdRequest tr : request.thresholds()) {
                GradeThreshold threshold = new GradeThreshold(
                        tr.minPercentage(),
                        tr.maxPercentage(),
                        tr.grade(),
                        tr.gradePoint(),
                        tr.remark());
                threshold.setDisplayOrder(tr.displayOrder());
                scheme.addThreshold(threshold);
            }
        }

        return repository.save(scheme);
    }

    /**
     * Update an existing grading scheme.
     */
    public GradingScheme updateScheme(UUID tenantId, UUID schemeId, UpdateSchemeRequest request) {
        GradingScheme scheme = repository.findByIdWithThresholds(tenantId, schemeId)
                .orElseThrow(() -> new IllegalArgumentException("Grading scheme not found"));

        if (request.name() != null && !request.name().equals(scheme.getName())) {
            if (repository.existsByTenantIdAndName(tenantId, request.name())) {
                throw new IllegalArgumentException("Grading scheme with name already exists");
            }
            scheme.setName(request.name());
        }

        if (request.description() != null) {
            scheme.setDescription(request.description());
        }

        if (request.isActive() != null) {
            scheme.setActive(request.isActive());
        }

        if (request.isDefault() != null && request.isDefault() && !scheme.isDefault()) {
            repository.findByTenantIdAndIsDefaultTrue(tenantId)
                    .ifPresent(existing -> {
                        existing.setDefault(false);
                        repository.save(existing);
                    });
            scheme.setDefault(true);
        }

        return repository.save(scheme);
    }

    /**
     * Get all active grading schemes for a tenant.
     */
    @Transactional(readOnly = true)
    public List<GradingScheme> getActiveSchemes(UUID tenantId) {
        return repository.findByTenantIdAndIsActiveOrderByNameAsc(tenantId, true);
    }

    /**
     * Get all grading schemes for a tenant.
     */
    @Transactional(readOnly = true)
    public List<GradingScheme> getAllSchemes(UUID tenantId) {
        return repository.findByTenantIdOrderByNameAsc(tenantId);
    }

    /**
     * Get a grading scheme by ID with thresholds.
     */
    @Transactional(readOnly = true)
    public Optional<GradingScheme> getSchemeWithThresholds(UUID tenantId, UUID schemeId) {
        return repository.findByIdWithThresholds(tenantId, schemeId);
    }

    /**
     * Get the default grading scheme.
     */
    @Transactional(readOnly = true)
    public Optional<GradingScheme> getDefaultScheme(UUID tenantId) {
        return repository.findByTenantIdAndIsDefaultTrue(tenantId);
    }

    /**
     * Calculate grade for a given percentage using the default scheme.
     */
    @Transactional(readOnly = true)
    public GradeResult calculateGrade(UUID tenantId, double percentage) {
        GradingScheme scheme = repository.findByTenantIdAndIsDefaultTrue(tenantId)
                .orElseThrow(() -> new IllegalStateException("No default grading scheme configured"));

        String grade = scheme.calculateGrade(percentage);
        Double gradePoint = scheme.getGradePoint(percentage);

        return new GradeResult(grade, gradePoint, scheme.getName());
    }

    // Request/Response records
    public record CreateSchemeRequest(
            String name,
            SchemeType type,
            String description,
            boolean isDefault,
            List<ThresholdRequest> thresholds) {
    }

    public record UpdateSchemeRequest(
            String name,
            String description,
            Boolean isActive,
            Boolean isDefault) {
    }

    public record ThresholdRequest(
            BigDecimal minPercentage,
            BigDecimal maxPercentage,
            String grade,
            BigDecimal gradePoint,
            String remark,
            Integer displayOrder) {
    }

    public record GradeResult(
            String grade,
            Double gradePoint,
            String schemeName) {
    }
}
