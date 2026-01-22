package com.schoolsis.admissions.domain.repository;

import com.schoolsis.admissions.domain.model.Application;
import com.schoolsis.admissions.domain.model.ApplicationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ApplicationRepository extends JpaRepository<Application, UUID> {

    Optional<Application> findByLeadId(UUID leadId);

    @Query("SELECT a FROM Application a WHERE a.status = :status")
    List<Application> findByStatus(ApplicationStatus status);
}
