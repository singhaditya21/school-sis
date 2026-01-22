package com.schoolsis.communication.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "communication_consents", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"user_id", "channel"})
})
public class CommunicationConsent extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MessageChannel channel;

    @Column(name = "is_consented")
    private boolean consented = true;

    @Column(name = "consented_at")
    private Instant consentedAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    public CommunicationConsent() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public MessageChannel getChannel() { return channel; }
    public void setChannel(MessageChannel channel) { this.channel = channel; }
    public boolean isConsented() { return consented; }
    public void setConsented(boolean consented) { this.consented = consented; }
    public Instant getConsentedAt() { return consentedAt; }
    public void setConsentedAt(Instant consentedAt) { this.consentedAt = consentedAt; }
    public Instant getRevokedAt() { return revokedAt; }
    public void setRevokedAt(Instant revokedAt) { this.revokedAt = revokedAt; }
    public Instant getCreatedAt() { return createdAt; }
}
