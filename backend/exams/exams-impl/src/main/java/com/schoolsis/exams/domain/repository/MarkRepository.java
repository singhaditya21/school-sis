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

    @Query("SELECT m FROM Mark m WHERE m.examId = :examId AND m.studentId = :studentId AND m.subject = :subject")
    Optional<Mark> findByExamIdAndStudentIdAndSubject(UUID examId, UUID studentId, String subject);

    @Query("SELECT m FROM Mark m WHERE m.tenantId = :tenantId AND m.studentId = :studentId")
    List<Mark> findByTenantIdAndStudentId(UUID tenantId, UUID studentId);

    @Query("SELECT m FROM Mark m WHERE m.examId = :examId")
    List<Mark> findByExamId(UUID examId);
}
