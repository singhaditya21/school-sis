package com.schoolsis.students.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * HealthRecord entity - stores student health and physical checkup data.
 * Required for CBSE compliance and report card generation.
 * Maps to the 'health_records' table.
 */
@Entity
@Table(name = "health_records", indexes = {
        @Index(columnList = "\"tenantId\", \"studentId\""),
        @Index(columnList = "\"tenantId\", \"academicYearId\""),
        @Index(columnList = "\"tenantId\", \"checkupDate\"")
})
public class HealthRecord extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "\"studentId\"", nullable = false)
    private UUID studentId;

    @Column(name = "\"academicYearId\"", nullable = false)
    private UUID academicYearId;

    @Column(name = "\"checkupDate\"", nullable = false)
    private LocalDate checkupDate;

    @Column(precision = 5, scale = 2)
    private BigDecimal height; // in cm

    @Column(precision = 5, scale = 2)
    private BigDecimal weight; // in kg

    @Column(precision = 4, scale = 2)
    private BigDecimal bmi; // calculated

    @Column(name = "\"bloodGroup\"", length = 5)
    private String bloodGroup;

    @Column(length = 100)
    private String vision;

    @Column(length = 100)
    private String dental;

    @Column(length = 100)
    private String hearing;

    @Column(name = "\"generalHealth\"", columnDefinition = "TEXT")
    private String generalHealth;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "\"recordedBy\"", nullable = false)
    private UUID recordedBy;

    @CreationTimestamp
    @Column(name = "\"createdAt\"", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "\"updatedAt\"")
    private Instant updatedAt;

    // Constructors
    public HealthRecord() {
    }

    public HealthRecord(UUID studentId, UUID academicYearId, LocalDate checkupDate, UUID recordedBy) {
        this.studentId = studentId;
        this.academicYearId = academicYearId;
        this.checkupDate = checkupDate;
        this.recordedBy = recordedBy;
    }

    // Business methods

    /**
     * Calculate BMI from height and weight.
     * Formula: BMI = weight (kg) / (height (m))^2
     */
    public void calculateBmi() {
        if (height != null && weight != null && height.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal heightInMeters = height.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
            BigDecimal heightSquared = heightInMeters.multiply(heightInMeters);
            this.bmi = weight.divide(heightSquared, 2, RoundingMode.HALF_UP);
        }
    }

    /**
     * Get BMI category based on calculated BMI.
     */
    public String getBmiCategory() {
        if (bmi == null)
            return "Unknown";

        double bmiValue = bmi.doubleValue();
        if (bmiValue < 18.5)
            return "Underweight";
        if (bmiValue < 25.0)
            return "Normal";
        if (bmiValue < 30.0)
            return "Overweight";
        return "Obese";
    }

    // Getters and Setters
    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getStudentId() {
        return studentId;
    }

    public void setStudentId(UUID studentId) {
        this.studentId = studentId;
    }

    public UUID getAcademicYearId() {
        return academicYearId;
    }

    public void setAcademicYearId(UUID academicYearId) {
        this.academicYearId = academicYearId;
    }

    public LocalDate getCheckupDate() {
        return checkupDate;
    }

    public void setCheckupDate(LocalDate checkupDate) {
        this.checkupDate = checkupDate;
    }

    public BigDecimal getHeight() {
        return height;
    }

    public void setHeight(BigDecimal height) {
        this.height = height;
        calculateBmi();
    }

    public BigDecimal getWeight() {
        return weight;
    }

    public void setWeight(BigDecimal weight) {
        this.weight = weight;
        calculateBmi();
    }

    public BigDecimal getBmi() {
        return bmi;
    }

    public String getBloodGroup() {
        return bloodGroup;
    }

    public void setBloodGroup(String bloodGroup) {
        this.bloodGroup = bloodGroup;
    }

    public String getVision() {
        return vision;
    }

    public void setVision(String vision) {
        this.vision = vision;
    }

    public String getDental() {
        return dental;
    }

    public void setDental(String dental) {
        this.dental = dental;
    }

    public String getHearing() {
        return hearing;
    }

    public void setHearing(String hearing) {
        this.hearing = hearing;
    }

    public String getGeneralHealth() {
        return generalHealth;
    }

    public void setGeneralHealth(String generalHealth) {
        this.generalHealth = generalHealth;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public UUID getRecordedBy() {
        return recordedBy;
    }

    public void setRecordedBy(UUID recordedBy) {
        this.recordedBy = recordedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
