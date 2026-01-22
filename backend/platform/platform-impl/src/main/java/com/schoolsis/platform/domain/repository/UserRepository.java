package com.schoolsis.platform.domain.repository;

import com.schoolsis.platform.domain.model.Role;
import com.schoolsis.platform.domain.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for User entity with tenant-aware queries.
 */
@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String email);

    Optional<User> findByEmailAndActiveTrue(String email);

    @Query("SELECT u FROM User u WHERE u.tenantId = :tenantId AND u.active = true")
    List<User> findActiveByTenantId(UUID tenantId);

    @Query("SELECT u FROM User u WHERE u.tenantId = :tenantId AND u.role = :role AND u.active = true")
    List<User> findActiveByTenantIdAndRole(UUID tenantId, Role role);

    boolean existsByEmail(String email);
}
