package com.schoolsis.exams.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Mark entity - student marks for an exam subject.
 */
@Entity
@Table(name = "marks", indexes = {
        @Index(columnList = "tenant_id, exam_id"),
        @Index(columnList = "tenant_id, student_id")
}, uniqueConstraints = {
        @UniqueConstraint(columnNames = { "exam_id", "student_id", "subject_id" })
})
public class Mark extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "exam_id", nullable = false)
    private UUID examId;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "subject_id", nullable = false)
    private UUID subjectId;

    @Column(name = "marks_obtained", precision = 5, scale = 2)
    private BigDecimal marksObtained;

    @Column(name = "is_absent")
    private boolean absent = false;

    private String remarks;

    @Column(name = "entered_by")
    private UUID enteredBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    // Verification workflow fields
    @Enumerated(EnumType.STRING)
    @Column(name = "\"verificationStatus\"", length = 20)
    private VerificationStatus verificationStatus = VerificationStatus.PENDING;

    @Column(name = "\"verifiedBy\"")
    private UUID verifiedBy;

    @Column(name = "\"verifiedAt\"")
    private Instant verifiedAt;

    @Column(name = "\"rejectionReason\"")
    private String rejectionReason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exam_id", insertable = false, updatable = false)
    private Exam exam;

    // Verification status enum
    public enum VerificationStatus {
        PENDING, // Awaiting verification
        VERIFIED, // Approved by checker
        REJECTED // Sent back for correction
    }

    public Mark() {
    }

    public Mark(UUID examId, UUID studentId, UUID subjectId, BigDecimal marksObtained) {
        this.examId = examId;
        this.studentId = studentId;
        this.subjectId = subjectId;
        this.marksObtained = marksObtained;
    }

    // Getters and Setters
    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getExamId() {
        return examId;
    }

    public void setExamId(UUID examId) {
        this.examId = examId;
    }

    public UUID getStudentId() {
        return studentId;
    }

    public void setStudentId(UUID studentId) {
        this.studentId = studentId;
    }

    public UUID getSubjectId() {
        return subjectId;
    }

    public void setSubjectId(UUID subjectId) {
        this.subjectId = subjectId;
    }

    public BigDecimal getMarksObtained() {
        return marksObtained;
    }

    public void setMarksObtained(BigDecimal marksObtained) {
        this.marksObtained = marksObtained;
    }

    public boolean isAbsent() {
        return absent;
    }

    public void setAbsent(boolean absent) {
        this.absent = absent;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public UUID getEnteredBy() {
        return enteredBy;
    }

    public void setEnteredBy(UUID enteredBy) {
        this.enteredBy = enteredBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Exam getExam() {
        return exam;
    }

    // Verification getters/setters
    public VerificationStatus getVerificationStatus() {
        return verificationStatus;
    }

    public void setVerificationStatus(VerificationStatus verificationStatus) {
        this.verificationStatus = verificationStatus;
    }

    public UUID getVerifiedBy() {
        return verifiedBy;
    }

    public void setVerifiedBy(UUID verifiedBy) {
        this.verifiedBy = verifiedBy;
    }

    public Instant getVerifiedAt() {
        return verifiedAt;
    }

    public void setVerifiedAt(Instant verifiedAt) {
        this.verifiedAt = verifiedAt;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }

    // Business methods for verification
    public void verify(UUID verifierId) {
        this.verificationStatus = VerificationStatus.VERIFIED;
        this.verifiedBy = verifierId;
        this.verifiedAt = Instant.now();
        this.rejectionReason = null;
    }

    public void reject(UUID verifierId, String reason) {
        this.verificationStatus = VerificationStatus.REJECTED;
        this.verifiedBy = verifierId;
        this.verifiedAt = Instant.now();
        this.rejectionReason = reason;
    }

    public boolean isPending() {
        return verificationStatus == VerificationStatus.PENDING;
    }

    public boolean isVerified() {
        return verificationStatus == VerificationStatus.VERIFIED;
    }
}
