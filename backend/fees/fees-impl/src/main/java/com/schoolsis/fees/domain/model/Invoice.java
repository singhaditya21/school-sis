package com.schoolsis.fees.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Invoice entity - fee invoice for a student.
 * Maps to the 'invoices' table from Flyway schema.
 */
@Entity
@Table(name = "invoices", indexes = {
        @Index(columnList = "tenant_id, student_id"),
        @Index(columnList = "tenant_id, status"),
        @Index(columnList = "tenant_id, due_date")
})
public class Invoice extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "invoice_number", unique = true, nullable = false)
    private String invoiceNumber;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "fee_plan_id")
    private UUID feePlanId;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(name = "paid_amount", precision = 12, scale = 2)
    private BigDecimal paidAmount = BigDecimal.ZERO;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column(nullable = false)
    private String status = "PENDING";

    @Column(name = "line_items", columnDefinition = "jsonb")
    private String lineItems;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL)
    private Set<Payment> payments = new HashSet<>();

    // Constructors
    public Invoice() {
    }

    public Invoice(String invoiceNumber, UUID studentId, BigDecimal amount, LocalDate dueDate) {
        this.invoiceNumber = invoiceNumber;
        this.studentId = studentId;
        this.amount = amount;
        this.dueDate = dueDate;
    }

    // Business methods
    public void recordPayment(BigDecimal paymentAmount) {
        this.paidAmount = this.paidAmount.add(paymentAmount);
        if (this.paidAmount.compareTo(this.amount) >= 0) {
            this.status = "PAID";
        } else if (this.paidAmount.compareTo(BigDecimal.ZERO) > 0) {
            this.status = "PARTIAL";
        }
    }

    public BigDecimal getBalanceAmount() {
        return amount.subtract(paidAmount);
    }

    public boolean isOverdue() {
        return !"PAID".equals(status) && !"CANCELLED".equals(status) && LocalDate.now().isAfter(dueDate);
    }

    // Getters and Setters
    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getInvoiceNumber() {
        return invoiceNumber;
    }

    public void setInvoiceNumber(String invoiceNumber) {
        this.invoiceNumber = invoiceNumber;
    }

    public UUID getStudentId() {
        return studentId;
    }

    public void setStudentId(UUID studentId) {
        this.studentId = studentId;
    }

    public UUID getFeePlanId() {
        return feePlanId;
    }

    public void setFeePlanId(UUID feePlanId) {
        this.feePlanId = feePlanId;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public BigDecimal getPaidAmount() {
        return paidAmount;
    }

    public void setPaidAmount(BigDecimal paidAmount) {
        this.paidAmount = paidAmount;
    }

    public LocalDate getDueDate() {
        return dueDate;
    }

    public void setDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getLineItems() {
        return lineItems;
    }

    public void setLineItems(String lineItems) {
        this.lineItems = lineItems;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public Set<Payment> getPayments() {
        return payments;
    }
}
