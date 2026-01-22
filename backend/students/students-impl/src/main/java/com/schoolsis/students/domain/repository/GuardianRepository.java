package com.schoolsis.students.domain.repository;

import com.schoolsis.students.domain.model.Guardian;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for Guardian entity.
 */
@Repository
public interface GuardianRepository extends JpaRepository<Guardian, UUID> {

    @Query("SELECT g FROM Guardian g WHERE g.tenantId = :tenantId")
    List<Guardian> findByTenantId(UUID tenantId);

    @Query("SELECT g FROM Guardian g WHERE g.tenantId = :tenantId AND g.id = :id")
    Optional<Guardian> findByTenantIdAndId(UUID tenantId, UUID id);

    @Query("SELECT g FROM Guardian g " +
           "JOIN StudentGuardianLink sgl ON g.id = sgl.guardianId " +
           "WHERE sgl.studentId = :studentId")
    List<Guardian> findByStudentId(UUID studentId);
}
