package com.schoolsis.exams.domain.repository;

import com.schoolsis.exams.domain.model.ReportCard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ReportCardRepository extends JpaRepository<ReportCard, UUID> {

    @Query("SELECT r FROM ReportCard r WHERE r.studentId = :studentId AND r.termId = :termId")
    Optional<ReportCard> findByStudentIdAndTermId(UUID studentId, UUID termId);

    @Query("SELECT r FROM ReportCard r WHERE r.tenantId = :tenantId AND r.termId = :termId ORDER BY r.rank")
    List<ReportCard> findByTenantIdAndTermId(UUID tenantId, UUID termId);

    @Query("SELECT r FROM ReportCard r WHERE r.tenantId = :tenantId AND r.studentId = :studentId")
    List<ReportCard> findByTenantIdAndStudentId(UUID tenantId, UUID studentId);
}
