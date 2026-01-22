package com.schoolsis.exams.domain.repository;

import com.schoolsis.exams.domain.model.Exam;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ExamRepository extends JpaRepository<Exam, UUID> {

    @Query("SELECT e FROM Exam e WHERE e.tenantId = :tenantId AND e.active = true ORDER BY e.startDate DESC")
    List<Exam> findActiveByTenantId(UUID tenantId);

    @Query("SELECT e FROM Exam e WHERE e.tenantId = :tenantId AND e.id = :id")
    Optional<Exam> findByTenantIdAndId(UUID tenantId, UUID id);

    @Query("SELECT e FROM Exam e WHERE e.tenantId = :tenantId AND e.academicYearId = :academicYearId ORDER BY e.startDate")
    List<Exam> findByTenantIdAndAcademicYearId(UUID tenantId, UUID academicYearId);
}
