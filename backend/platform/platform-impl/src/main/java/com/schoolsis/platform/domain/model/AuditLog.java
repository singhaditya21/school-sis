package com.schoolsis.platform.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.Type;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * AuditLog entity - immutable audit trail for sensitive actions.
 * Maps to the 'audit_logs' table.
 */
@Entity
@Table(name = "audit_logs", indexes = {
        @Index(columnList = "\"tenantId\", \"entityType\", \"entityId\""),
        @Index(columnList = "\"tenantId\", \"userId\""),
        @Index(columnList = "\"tenantId\", timestamp")
})
public class AuditLog extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "\"userId\"", nullable = false)
    private UUID userId;

    @Column(nullable = false, length = 50)
    private String action; // CREATE, UPDATE, DELETE, READ

    @Column(name = "\"entityType\"", nullable = false, length = 100)
    private String entityType; // Student, Invoice, Payment, etc.

    @Column(name = "\"entityId\"")
    private UUID entityId;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> before;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> after;

    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(name = "\"ipAddress\"", length = 50)
    private String ipAddress;

    @Column(name = "\"userAgent\"")
    private String userAgent;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant timestamp;

    // Constructors
    public AuditLog() {
    }

    public static AuditLog create(UUID tenantId, UUID userId, String action, String entityType, UUID entityId) {
        AuditLog log = new AuditLog();
        log.setTenantId(tenantId);
        log.userId = userId;
        log.action = action;
        log.entityType = entityType;
        log.entityId = entityId;
        return log;
    }

    // Getters and Setters
    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getEntityType() {
        return entityType;
    }

    public void setEntityType(String entityType) {
        this.entityType = entityType;
    }

    public UUID getEntityId() {
        return entityId;
    }

    public void setEntityId(UUID entityId) {
        this.entityId = entityId;
    }

    public Map<String, Object> getBefore() {
        return before;
    }

    public void setBefore(Map<String, Object> before) {
        this.before = before;
    }

    public Map<String, Object> getAfter() {
        return after;
    }

    public void setAfter(Map<String, Object> after) {
        this.after = after;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    public void setMetadata(Map<String, Object> metadata) {
        this.metadata = metadata;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public void setIpAddress(String ipAddress) {
        this.ipAddress = ipAddress;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }

    public Instant getTimestamp() {
        return timestamp;
    }
}
