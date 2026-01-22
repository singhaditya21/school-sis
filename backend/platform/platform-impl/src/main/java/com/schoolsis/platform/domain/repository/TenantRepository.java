package com.schoolsis.platform.domain.repository;

import com.schoolsis.platform.domain.model.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Repository for Tenant entity.
 */
@Repository
public interface TenantRepository extends JpaRepository<Tenant, UUID> {

    Optional<Tenant> findBySlug(String slug);

    Optional<Tenant> findByDomain(String domain);

    boolean existsBySlug(String slug);

    boolean existsByDomain(String domain);
}
