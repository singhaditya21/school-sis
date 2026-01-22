package com.schoolsis.students.domain.repository;

import com.schoolsis.students.domain.model.Student;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for Student entity with tenant-aware queries.
 */
@Repository
public interface StudentRepository extends JpaRepository<Student, UUID> {

    @Query("SELECT s FROM Student s WHERE s.tenantId = :tenantId AND s.active = true")
    List<Student> findActiveByTenantId(UUID tenantId);

    @Query("SELECT s FROM Student s WHERE s.tenantId = :tenantId AND s.active = true")
    Page<Student> findActiveByTenantId(UUID tenantId, Pageable pageable);

    @Query("SELECT s FROM Student s WHERE s.tenantId = :tenantId AND s.id = :id")
    Optional<Student> findByTenantIdAndId(UUID tenantId, UUID id);

    @Query("SELECT s FROM Student s WHERE s.tenantId = :tenantId AND s.admissionNumber = :admissionNumber")
    Optional<Student> findByTenantIdAndAdmissionNumber(UUID tenantId, String admissionNumber);

    @Query("SELECT s FROM Student s WHERE s.tenantId = :tenantId AND s.classGroupId = :classGroupId AND s.active = true")
    List<Student> findActiveByTenantIdAndClassGroupId(UUID tenantId, UUID classGroupId);

    @Query("SELECT COUNT(s) FROM Student s WHERE s.tenantId = :tenantId AND s.active = true")
    long countActiveByTenantId(UUID tenantId);

    boolean existsByAdmissionNumber(String admissionNumber);
}
