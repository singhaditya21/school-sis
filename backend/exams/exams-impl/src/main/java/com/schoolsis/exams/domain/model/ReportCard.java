package com.schoolsis.exams.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * ReportCard entity - student term report card.
 */
@Entity
@Table(name = "report_cards", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"student_id", "term_id"})
})
public class ReportCard extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "term_id", nullable = false)
    private UUID termId;

    @Column(name = "total_marks", precision = 7, scale = 2)
    private BigDecimal totalMarks;

    @Column(name = "max_marks", precision = 7, scale = 2)
    private BigDecimal maxMarks;

    @Column(precision = 5, scale = 2)
    private BigDecimal percentage;

    private String grade;

    private Integer rank;

    @Column(name = "generated_at")
    private Instant generatedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    public ReportCard() {}

    // Getters and Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getStudentId() { return studentId; }
    public void setStudentId(UUID studentId) { this.studentId = studentId; }
    public UUID getTermId() { return termId; }
    public void setTermId(UUID termId) { this.termId = termId; }
    public BigDecimal getTotalMarks() { return totalMarks; }
    public void setTotalMarks(BigDecimal totalMarks) { this.totalMarks = totalMarks; }
    public BigDecimal getMaxMarks() { return maxMarks; }
    public void setMaxMarks(BigDecimal maxMarks) { this.maxMarks = maxMarks; }
    public BigDecimal getPercentage() { return percentage; }
    public void setPercentage(BigDecimal percentage) { this.percentage = percentage; }
    public String getGrade() { return grade; }
    public void setGrade(String grade) { this.grade = grade; }
    public Integer getRank() { return rank; }
    public void setRank(Integer rank) { this.rank = rank; }
    public Instant getGeneratedAt() { return generatedAt; }
    public void setGeneratedAt(Instant generatedAt) { this.generatedAt = generatedAt; }
    public Instant getCreatedAt() { return createdAt; }
}
