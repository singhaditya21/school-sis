package com.schoolsis.communication.domain.repository;

import com.schoolsis.communication.domain.model.MessageTemplate;
import com.schoolsis.communication.domain.model.MessageChannel;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface MessageTemplateRepository extends JpaRepository<MessageTemplate, UUID> {

    @Query("SELECT t FROM MessageTemplate t WHERE t.tenantId = :tenantId AND t.active = true ORDER BY t.name")
    List<MessageTemplate> findActiveByTenantId(UUID tenantId);

    @Query("SELECT t FROM MessageTemplate t WHERE t.tenantId = :tenantId AND t.channel = :channel AND t.active = true")
    List<MessageTemplate> findActiveByTenantIdAndChannel(UUID tenantId, MessageChannel channel);
}
