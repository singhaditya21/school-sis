package com.schoolsis.exams.domain.repository;

import com.schoolsis.exams.domain.model.Mark;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MarkRepository extends JpaRepository<Mark, UUID> {

    @Query("SELECT m FROM Mark m WHERE m.examId = :examId AND m.studentId = :studentId")
    List<Mark> findByExamIdAndStudentId(UUID examId, UUID studentId);

    @Query("SELECT m FROM Mark m WHERE m.examId = :examId AND m.studentId = :studentId AND m.subjectId = :subjectId")
    Optional<Mark> findByExamIdAndStudentIdAndSubjectId(UUID examId, UUID studentId, UUID subjectId);

    @Query("SELECT m FROM Mark m WHERE m.tenantId = :tenantId AND m.studentId = :studentId")
    List<Mark> findByTenantIdAndStudentId(UUID tenantId, UUID studentId);

    @Query("SELECT m FROM Mark m WHERE m.examId = :examId")
    List<Mark> findByExamId(UUID examId);

    // Verification workflow methods
    @Query("SELECT m FROM Mark m WHERE m.tenantId = :tenantId AND m.examId = :examId AND m.verificationStatus = :status")
    List<Mark> findByTenantIdAndExamIdAndVerificationStatus(UUID tenantId, UUID examId, Mark.VerificationStatus status);

    @Query("SELECT COUNT(m) FROM Mark m WHERE m.tenantId = :tenantId AND m.examId = :examId AND m.verificationStatus = :status")
    long countByTenantIdAndExamIdAndVerificationStatus(UUID tenantId, UUID examId, Mark.VerificationStatus status);
}
