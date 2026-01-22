package com.schoolsis.platform.domain.repository;

import com.schoolsis.platform.domain.model.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.UUID;

/**
 * Repository for AuditLog entity.
 */
@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    @Query("SELECT a FROM AuditLog a WHERE a.tenantId = :tenantId ORDER BY a.timestamp DESC")
    Page<AuditLog> findByTenantId(UUID tenantId, Pageable pageable);

    @Query("SELECT a FROM AuditLog a WHERE a.tenantId = :tenantId AND a.entityType = :entityType ORDER BY a.timestamp DESC")
    Page<AuditLog> findByTenantIdAndEntityType(UUID tenantId, String entityType, Pageable pageable);

    @Query("SELECT a FROM AuditLog a WHERE a.tenantId = :tenantId AND a.entityId = :entityId ORDER BY a.timestamp DESC")
    Page<AuditLog> findByTenantIdAndEntityId(UUID tenantId, UUID entityId, Pageable pageable);

    @Query("SELECT a FROM AuditLog a WHERE a.tenantId = :tenantId AND a.userId = :userId ORDER BY a.timestamp DESC")
    Page<AuditLog> findByTenantIdAndUserId(UUID tenantId, UUID userId, Pageable pageable);

    @Query("SELECT a FROM AuditLog a WHERE a.tenantId = :tenantId AND a.timestamp BETWEEN :start AND :end ORDER BY a.timestamp DESC")
    Page<AuditLog> findByTenantIdAndTimestampBetween(UUID tenantId, Instant start, Instant end, Pageable pageable);
}
