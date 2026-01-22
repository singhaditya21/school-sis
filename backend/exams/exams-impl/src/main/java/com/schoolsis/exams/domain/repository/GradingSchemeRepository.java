package com.schoolsis.exams.domain.repository;

import com.schoolsis.exams.domain.model.GradingScheme;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for GradingScheme entity.
 */
@Repository
public interface GradingSchemeRepository extends JpaRepository<GradingScheme, UUID> {

    /**
     * Find all active grading schemes for a tenant.
     */
    List<GradingScheme> findByTenantIdAndIsActiveOrderByNameAsc(UUID tenantId, boolean isActive);

    /**
     * Find the default grading scheme for a tenant.
     */
    Optional<GradingScheme> findByTenantIdAndIsDefaultTrue(UUID tenantId);

    /**
     * Find a grading scheme by name.
     */
    Optional<GradingScheme> findByTenantIdAndName(UUID tenantId, String name);

    /**
     * Find a grading scheme by ID with thresholds eagerly loaded.
     */
    @Query("SELECT gs FROM GradingScheme gs LEFT JOIN FETCH gs.thresholds WHERE gs.id = :id AND gs.tenantId = :tenantId")
    Optional<GradingScheme> findByIdWithThresholds(@Param("tenantId") UUID tenantId, @Param("id") UUID id);

    /**
     * Check if a grading scheme name already exists.
     */
    boolean existsByTenantIdAndName(UUID tenantId, String name);

    /**
     * Get all grading schemes for a tenant.
     */
    List<GradingScheme> findByTenantIdOrderByNameAsc(UUID tenantId);
}
