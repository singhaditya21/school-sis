package com.schoolsis.admissions.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "admission_leads", indexes = {@Index(columnList = "tenant_id, stage")})
public class AdmissionLead extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "child_name", nullable = false)
    private String childName;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Column(name = "parent_name", nullable = false)
    private String parentName;

    @Column(name = "parent_phone", nullable = false)
    private String parentPhone;

    @Column(name = "parent_email")
    private String parentEmail;

    @Column(name = "grade_id")
    private UUID gradeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private LeadStage stage = LeadStage.NEW;

    private String source;
    private String notes;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    @OneToOne(mappedBy = "lead", cascade = CascadeType.ALL)
    private Application application;

    public AdmissionLead() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getChildName() { return childName; }
    public void setChildName(String childName) { this.childName = childName; }
    public LocalDate getDateOfBirth() { return dateOfBirth; }
    public void setDateOfBirth(LocalDate dateOfBirth) { this.dateOfBirth = dateOfBirth; }
    public String getParentName() { return parentName; }
    public void setParentName(String parentName) { this.parentName = parentName; }
    public String getParentPhone() { return parentPhone; }
    public void setParentPhone(String parentPhone) { this.parentPhone = parentPhone; }
    public String getParentEmail() { return parentEmail; }
    public void setParentEmail(String parentEmail) { this.parentEmail = parentEmail; }
    public UUID getGradeId() { return gradeId; }
    public void setGradeId(UUID gradeId) { this.gradeId = gradeId; }
    public LeadStage getStage() { return stage; }
    public void setStage(LeadStage stage) { this.stage = stage; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Application getApplication() { return application; }
}
