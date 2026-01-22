package com.schoolsis.fees.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * PaymentOrder entity - represents an online payment attempt for an invoice.
 */
@Entity
@Table(name = "payment_orders", indexes = {
        @Index(columnList = "\"tenantId\""),
        @Index(columnList = "\"tenantId\", \"invoiceId\""),
        @Index(columnList = "\"tenantId\", \"studentId\""),
        @Index(columnList = "\"tenantId\", status"),
        @Index(columnList = "\"providerOrderId\"")
})
public class PaymentOrder extends TenantAwareEntity {

    public enum PaymentStatus {
        PENDING, CREATED, AUTHORIZED, CAPTURED, FAILED, REFUNDED
    }

    public enum PaymentProvider {
        RAZORPAY, PAYU, MANUAL
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "\"invoiceId\"", nullable = false)
    private UUID invoiceId;

    @Column(name = "\"studentId\"", nullable = false)
    private UUID studentId;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(length = 3)
    private String currency = "INR";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentStatus status = PaymentStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentProvider provider;

    @Column(name = "\"providerOrderId\"", length = 100)
    private String providerOrderId;

    @Column(name = "\"providerPaymentId\"", length = 100)
    private String providerPaymentId;

    @Column(name = "\"providerSignature\"", length = 256)
    private String providerSignature;

    @Column(name = "\"attemptCount\"")
    private Integer attemptCount = 0;

    @Column(name = "\"lastAttemptAt\"")
    private Instant lastAttemptAt;

    @Column(name = "\"paidAt\"")
    private Instant paidAt;

    @Column(name = "\"failureReason\"", columnDefinition = "TEXT")
    private String failureReason;

    @Column(columnDefinition = "jsonb")
    private String metadata;

    @CreationTimestamp
    @Column(name = "\"createdAt\"", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "\"updatedAt\"")
    private Instant updatedAt;

    // Constructors
    public PaymentOrder() {
    }

    public PaymentOrder(UUID invoiceId, UUID studentId, BigDecimal amount, PaymentProvider provider) {
        this.invoiceId = invoiceId;
        this.studentId = studentId;
        this.amount = amount;
        this.provider = provider;
    }

    // Business methods

    public void markCreated(String providerOrderId) {
        this.providerOrderId = providerOrderId;
        this.status = PaymentStatus.CREATED;
        this.attemptCount++;
        this.lastAttemptAt = Instant.now();
    }

    public void markCaptured(String paymentId, String signature) {
        this.providerPaymentId = paymentId;
        this.providerSignature = signature;
        this.status = PaymentStatus.CAPTURED;
        this.paidAt = Instant.now();
    }

    public void markFailed(String reason) {
        this.status = PaymentStatus.FAILED;
        this.failureReason = reason;
    }

    // Getters and Setters
    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getInvoiceId() {
        return invoiceId;
    }

    public void setInvoiceId(UUID invoiceId) {
        this.invoiceId = invoiceId;
    }

    public UUID getStudentId() {
        return studentId;
    }

    public void setStudentId(UUID studentId) {
        this.studentId = studentId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getCurrency() {
        return currency;
    }

    public void setCurrency(String currency) {
        this.currency = currency;
    }

    public PaymentStatus getStatus() {
        return status;
    }

    public void setStatus(PaymentStatus status) {
        this.status = status;
    }

    public PaymentProvider getProvider() {
        return provider;
    }

    public void setProvider(PaymentProvider provider) {
        this.provider = provider;
    }

    public String getProviderOrderId() {
        return providerOrderId;
    }

    public void setProviderOrderId(String providerOrderId) {
        this.providerOrderId = providerOrderId;
    }

    public String getProviderPaymentId() {
        return providerPaymentId;
    }

    public void setProviderPaymentId(String providerPaymentId) {
        this.providerPaymentId = providerPaymentId;
    }

    public String getProviderSignature() {
        return providerSignature;
    }

    public void setProviderSignature(String providerSignature) {
        this.providerSignature = providerSignature;
    }

    public Integer getAttemptCount() {
        return attemptCount;
    }

    public void setAttemptCount(Integer attemptCount) {
        this.attemptCount = attemptCount;
    }

    public Instant getLastAttemptAt() {
        return lastAttemptAt;
    }

    public void setLastAttemptAt(Instant lastAttemptAt) {
        this.lastAttemptAt = lastAttemptAt;
    }

    public Instant getPaidAt() {
        return paidAt;
    }

    public void setPaidAt(Instant paidAt) {
        this.paidAt = paidAt;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public void setFailureReason(String failureReason) {
        this.failureReason = failureReason;
    }

    public String getMetadata() {
        return metadata;
    }

    public void setMetadata(String metadata) {
        this.metadata = metadata;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
