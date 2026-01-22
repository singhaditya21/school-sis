package com.schoolsis.admissions.domain.repository;

import com.schoolsis.admissions.domain.model.AdmissionLead;
import com.schoolsis.admissions.domain.model.LeadStage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AdmissionLeadRepository extends JpaRepository<AdmissionLead, UUID> {

    @Query("SELECT l FROM AdmissionLead l WHERE l.tenantId = :tenantId ORDER BY l.createdAt DESC")
    Page<AdmissionLead> findByTenantId(UUID tenantId, Pageable pageable);

    @Query("SELECT l FROM AdmissionLead l WHERE l.tenantId = :tenantId AND l.id = :id")
    Optional<AdmissionLead> findByTenantIdAndId(UUID tenantId, UUID id);

    @Query("SELECT l FROM AdmissionLead l WHERE l.tenantId = :tenantId AND l.stage = :stage")
    List<AdmissionLead> findByTenantIdAndStage(UUID tenantId, LeadStage stage);

    @Query("SELECT l.stage, COUNT(l) FROM AdmissionLead l WHERE l.tenantId = :tenantId GROUP BY l.stage")
    List<Object[]> countByTenantIdGroupByStage(UUID tenantId);
}
