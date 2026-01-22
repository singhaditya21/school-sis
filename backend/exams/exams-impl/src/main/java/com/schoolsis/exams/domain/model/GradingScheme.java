package com.schoolsis.exams.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * GradingScheme entity - defines grading scales for exams.
 * Supports CBSE, ICSE, State Board, and custom grading schemes.
 */
@Entity
@Table(name = "grading_schemes", indexes = {
        @Index(columnList = "\"tenantId\""),
        @Index(columnList = "\"tenantId\", \"isActive\"")
})
public class GradingScheme extends TenantAwareEntity {

    public enum SchemeType {
        PERCENTAGE, GPA, CGPA, LETTER
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SchemeType type;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "\"isDefault\"")
    private boolean isDefault = false;

    @Column(name = "\"isActive\"")
    private boolean isActive = true;

    @OneToMany(mappedBy = "scheme", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("displayOrder ASC")
    private List<GradeThreshold> thresholds = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "\"createdAt\"", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "\"updatedAt\"")
    private Instant updatedAt;

    // Constructors
    public GradingScheme() {
    }

    public GradingScheme(String name, SchemeType type, String description) {
        this.name = name;
        this.type = type;
        this.description = description;
    }

    // Business methods

    /**
     * Calculate grade for a given percentage using this scheme's thresholds.
     */
    public String calculateGrade(double percentage) {
        for (GradeThreshold threshold : thresholds) {
            if (percentage >= threshold.getMinPercentage().doubleValue() &&
                    percentage <= threshold.getMaxPercentage().doubleValue()) {
                return threshold.getGrade();
            }
        }
        return "N/A";
    }

    /**
     * Get grade point for a given percentage.
     */
    public Double getGradePoint(double percentage) {
        for (GradeThreshold threshold : thresholds) {
            if (percentage >= threshold.getMinPercentage().doubleValue() &&
                    percentage <= threshold.getMaxPercentage().doubleValue()) {
                return threshold.getGradePoint() != null ? threshold.getGradePoint().doubleValue() : null;
            }
        }
        return null;
    }

    /**
     * Add a threshold to this scheme.
     */
    public void addThreshold(GradeThreshold threshold) {
        thresholds.add(threshold);
        threshold.setScheme(this);
    }

    /**
     * Remove a threshold from this scheme.
     */
    public void removeThreshold(GradeThreshold threshold) {
        thresholds.remove(threshold);
        threshold.setScheme(null);
    }

    // Getters and Setters
    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public SchemeType getType() {
        return type;
    }

    public void setType(SchemeType type) {
        this.type = type;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public boolean isDefault() {
        return isDefault;
    }

    public void setDefault(boolean isDefault) {
        this.isDefault = isDefault;
    }

    public boolean isActive() {
        return isActive;
    }

    public void setActive(boolean active) {
        isActive = active;
    }

    public List<GradeThreshold> getThresholds() {
        return thresholds;
    }

    public void setThresholds(List<GradeThreshold> thresholds) {
        this.thresholds = thresholds;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
