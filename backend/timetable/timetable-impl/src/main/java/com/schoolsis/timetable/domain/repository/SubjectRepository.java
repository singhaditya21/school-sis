package com.schoolsis.timetable.domain.repository;

import com.schoolsis.timetable.domain.model.Subject;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface SubjectRepository extends JpaRepository<Subject, UUID> {

    @Query("SELECT s FROM Subject s WHERE s.tenantId = :tenantId AND s.active = true ORDER BY s.name")
    List<Subject> findActiveByTenantId(UUID tenantId);
}
