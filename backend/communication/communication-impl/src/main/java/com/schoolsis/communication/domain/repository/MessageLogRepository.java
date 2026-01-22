package com.schoolsis.communication.domain.repository;

import com.schoolsis.communication.domain.model.MessageLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface MessageLogRepository extends JpaRepository<MessageLog, UUID> {

    @Query("SELECT m FROM MessageLog m WHERE m.tenantId = :tenantId ORDER BY m.createdAt DESC")
    Page<MessageLog> findByTenantId(UUID tenantId, Pageable pageable);

    @Query("SELECT m FROM MessageLog m WHERE m.tenantId = :tenantId AND m.recipientId = :recipientId ORDER BY m.createdAt DESC")
    Page<MessageLog> findByTenantIdAndRecipientId(UUID tenantId, UUID recipientId, Pageable pageable);
}
