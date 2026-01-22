package com.schoolsis.exams.domain.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * GradeThreshold entity - defines grade boundaries for a grading scheme.
 */
@Entity
@Table(name = "grade_thresholds", indexes = {
        @Index(columnList = "\"schemeId\"")
})
public class GradeThreshold {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "\"schemeId\"", nullable = false)
    private GradingScheme scheme;

    @Column(name = "\"minPercentage\"", nullable = false, precision = 5, scale = 2)
    private BigDecimal minPercentage;

    @Column(name = "\"maxPercentage\"", nullable = false, precision = 5, scale = 2)
    private BigDecimal maxPercentage;

    @Column(nullable = false, length = 10)
    private String grade;

    @Column(name = "\"gradePoint\"", precision = 3, scale = 1)
    private BigDecimal gradePoint;

    @Column(length = 100)
    private String remark;

    @Column(name = "\"displayOrder\"")
    private Integer displayOrder = 0;

    // Constructors
    public GradeThreshold() {
    }

    public GradeThreshold(BigDecimal minPercentage, BigDecimal maxPercentage, String grade, BigDecimal gradePoint,
            String remark) {
        this.minPercentage = minPercentage;
        this.maxPercentage = maxPercentage;
        this.grade = grade;
        this.gradePoint = gradePoint;
        this.remark = remark;
    }

    // Getters and Setters
    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public GradingScheme getScheme() {
        return scheme;
    }

    public void setScheme(GradingScheme scheme) {
        this.scheme = scheme;
    }

    public BigDecimal getMinPercentage() {
        return minPercentage;
    }

    public void setMinPercentage(BigDecimal minPercentage) {
        this.minPercentage = minPercentage;
    }

    public BigDecimal getMaxPercentage() {
        return maxPercentage;
    }

    public void setMaxPercentage(BigDecimal maxPercentage) {
        this.maxPercentage = maxPercentage;
    }

    public String getGrade() {
        return grade;
    }

    public void setGrade(String grade) {
        this.grade = grade;
    }

    public BigDecimal getGradePoint() {
        return gradePoint;
    }

    public void setGradePoint(BigDecimal gradePoint) {
        this.gradePoint = gradePoint;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }

    public Integer getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(Integer displayOrder) {
        this.displayOrder = displayOrder;
    }
}
