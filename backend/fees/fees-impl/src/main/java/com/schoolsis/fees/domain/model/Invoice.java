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
 * Maps to the 'invoices' table from Prisma schema.
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

    @Column(name = "academic_year_id")
    private UUID academicYearId;

    @Column(name = "total_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;

    @Column(name = "paid_amount", precision = 10, scale = 2)
    private BigDecimal paidAmount = BigDecimal.ZERO;

    @Column(name = "balance_amount", precision = 10, scale = 2)
    private BigDecimal balanceAmount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InvoiceStatus status = InvoiceStatus.PENDING;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column(name = "issue_date", nullable = false)
    private LocalDate issueDate;

    private String description;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    @OneToMany(mappedBy = "invoice", cascade = CascadeType.ALL)
    private Set<Payment> payments = new HashSet<>();

    // Constructors
    public Invoice() {}

    public Invoice(String invoiceNumber, UUID studentId, BigDecimal totalAmount, LocalDate dueDate) {
        this.invoiceNumber = invoiceNumber;
        this.studentId = studentId;
        this.totalAmount = totalAmount;
        this.balanceAmount = totalAmount;
        this.dueDate = dueDate;
        this.issueDate = LocalDate.now();
    }

    // Business methods
    public void recordPayment(BigDecimal amount) {
        this.paidAmount = this.paidAmount.add(amount);
        this.balanceAmount = this.totalAmount.subtract(this.paidAmount);

        if (this.balanceAmount.compareTo(BigDecimal.ZERO) <= 0) {
            this.status = InvoiceStatus.PAID;
        } else if (this.paidAmount.compareTo(BigDecimal.ZERO) > 0) {
            this.status = InvoiceStatus.PARTIAL;
        }
    }

    public boolean isOverdue() {
        return status != InvoiceStatus.PAID &&
               status != InvoiceStatus.CANCELLED &&
               LocalDate.now().isAfter(dueDate);
    }

    // Getters and Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getInvoiceNumber() { return invoiceNumber; }
    public void setInvoiceNumber(String invoiceNumber) { this.invoiceNumber = invoiceNumber; }

    public UUID getStudentId() { return studentId; }
    public void setStudentId(UUID studentId) { this.studentId = studentId; }

    public UUID getFeePlanId() { return feePlanId; }
    public void setFeePlanId(UUID feePlanId) { this.feePlanId = feePlanId; }

    public UUID getAcademicYearId() { return academicYearId; }
    public void setAcademicYearId(UUID academicYearId) { this.academicYearId = academicYearId; }

    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }

    public BigDecimal getPaidAmount() { return paidAmount; }
    public void setPaidAmount(BigDecimal paidAmount) { this.paidAmount = paidAmount; }

    public BigDecimal getBalanceAmount() { return balanceAmount; }
    public void setBalanceAmount(BigDecimal balanceAmount) { this.balanceAmount = balanceAmount; }

    public InvoiceStatus getStatus() { return status; }
    public void setStatus(InvoiceStatus status) { this.status = status; }

    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }

    public LocalDate getIssueDate() { return issueDate; }
    public void setIssueDate(LocalDate issueDate) { this.issueDate = issueDate; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public Set<Payment> getPayments() { return payments; }
}
