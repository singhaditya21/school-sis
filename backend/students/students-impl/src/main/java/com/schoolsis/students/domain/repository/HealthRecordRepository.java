package com.schoolsis.students.domain.repository;

import com.schoolsis.students.domain.model.HealthRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for HealthRecord entity.
 * All queries are tenant-scoped for multi-tenancy.
 */
@Repository
public interface HealthRecordRepository extends JpaRepository<HealthRecord, UUID> {

    /**
     * Find health record for a student in a specific academic year.
     */
    Optional<HealthRecord> findByTenantIdAndStudentIdAndAcademicYearId(
            UUID tenantId, UUID studentId, UUID academicYearId);

    /**
     * Find all health records for a student across all years.
     */
    List<HealthRecord> findByTenantIdAndStudentIdOrderByCheckupDateDesc(
            UUID tenantId, UUID studentId);

    /**
     * Find all health records for a tenant in a specific academic year.
     */
    List<HealthRecord> findByTenantIdAndAcademicYearIdOrderByCheckupDateDesc(
            UUID tenantId, UUID academicYearId);

    /**
     * Find health records for multiple students in an academic year.
     * Useful for section-wise report generation.
     */
    @Query("SELECT h FROM HealthRecord h WHERE h.tenantId = :tenantId " +
            "AND h.studentId IN :studentIds AND h.academicYearId = :academicYearId")
    List<HealthRecord> findByTenantIdAndStudentIdsAndAcademicYearId(
            @Param("tenantId") UUID tenantId,
            @Param("studentIds") List<UUID> studentIds,
            @Param("academicYearId") UUID academicYearId);

    /**
     * Find health records checked up on a specific date.
     */
    List<HealthRecord> findByTenantIdAndCheckupDate(UUID tenantId, LocalDate checkupDate);

    /**
     * Check if a health record exists for a student in an academic year.
     */
    boolean existsByTenantIdAndStudentIdAndAcademicYearId(
            UUID tenantId, UUID studentId, UUID academicYearId);

    /**
     * Count students with health records in an academic year.
     */
    @Query("SELECT COUNT(h) FROM HealthRecord h WHERE h.tenantId = :tenantId " +
            "AND h.academicYearId = :academicYearId")
    long countByTenantIdAndAcademicYearId(
            @Param("tenantId") UUID tenantId,
            @Param("academicYearId") UUID academicYearId);
}
