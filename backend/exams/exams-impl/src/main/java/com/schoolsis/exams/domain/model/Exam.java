package com.schoolsis.exams.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Exam entity - represents an examination.
 */
@Entity
@Table(name = "exams", indexes = {
    @Index(columnList = "tenant_id, academic_year_id")
})
public class Exam extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "academic_year_id", nullable = false)
    private UUID academicYearId;

    @Column(name = "term_id")
    private UUID termId;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ExamType type;

    @Column(name = "max_marks", nullable = false, precision = 5, scale = 2)
    private BigDecimal maxMarks;

    @Column(name = "passing_marks", nullable = false, precision = 5, scale = 2)
    private BigDecimal passingMarks;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "is_active")
    private boolean active = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "exam", cascade = CascadeType.ALL)
    private Set<Mark> marks = new HashSet<>();

    public Exam() {}

    public Exam(String name, ExamType type, BigDecimal maxMarks, BigDecimal passingMarks) {
        this.name = name;
        this.type = type;
        this.maxMarks = maxMarks;
        this.passingMarks = passingMarks;
    }

    // Getters and Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getAcademicYearId() { return academicYearId; }
    public void setAcademicYearId(UUID academicYearId) { this.academicYearId = academicYearId; }
    public UUID getTermId() { return termId; }
    public void setTermId(UUID termId) { this.termId = termId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public ExamType getType() { return type; }
    public void setType(ExamType type) { this.type = type; }
    public BigDecimal getMaxMarks() { return maxMarks; }
    public void setMaxMarks(BigDecimal maxMarks) { this.maxMarks = maxMarks; }
    public BigDecimal getPassingMarks() { return passingMarks; }
    public void setPassingMarks(BigDecimal passingMarks) { this.passingMarks = passingMarks; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
    public Set<Mark> getMarks() { return marks; }
}
