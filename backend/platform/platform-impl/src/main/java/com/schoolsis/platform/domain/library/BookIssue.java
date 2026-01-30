package com.schoolsis.platform.domain.library;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Entity representing a book issue/loan record.
 */
@Entity
@Table(name = "library_book_issues")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BookIssue {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "book_id", nullable = false)
    private UUID bookId;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "issued_by")
    private UUID issuedBy;

    @Column(name = "issue_date", nullable = false)
    private LocalDate issueDate;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column(name = "return_date")
    private LocalDate returnDate;

    @Column(name = "returned_to")
    private UUID returnedTo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private IssueStatus status = IssueStatus.ISSUED;

    @Column(name = "fine_amount")
    @Builder.Default
    private BigDecimal fineAmount = BigDecimal.ZERO;

    @Column(name = "fine_paid")
    @Builder.Default
    private Boolean finePaid = false;

    private String remarks;

    @Column(name = "renewal_count")
    @Builder.Default
    private Integer renewalCount = 0;

    @Column(name = "created_at")
    private LocalDate createdAt;

    @Column(name = "updated_at")
    private LocalDate updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDate.now();
        updatedAt = LocalDate.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDate.now();
    }

    public enum IssueStatus {
        ISSUED,
        RETURNED,
        OVERDUE,
        LOST,
        RENEWED
    }
}
