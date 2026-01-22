package com.schoolsis.attendance.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Attendance entity - daily/period-wise attendance record.
 * Maps to the 'attendance' table from Prisma schema.
 */
@Entity
@Table(name = "attendance", indexes = {
    @Index(columnList = "tenant_id, class_group_id, date"),
    @Index(columnList = "tenant_id, student_id, date")
}, uniqueConstraints = {
    @UniqueConstraint(columnNames = {"student_id", "date", "period_id"})
})
public class Attendance extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "class_group_id", nullable = false)
    private UUID classGroupId;

    @Column(nullable = false)
    private LocalDate date;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AttendanceStatus status;

    @Column(name = "period_id")
    private UUID periodId; // null for daily attendance

    @Column(name = "marked_by", nullable = false)
    private UUID markedBy;

    @CreationTimestamp
    @Column(name = "marked_at", nullable = false)
    private Instant markedAt;

    private String remarks;

    // Constructors
    public Attendance() {}

    public Attendance(UUID studentId, UUID classGroupId, LocalDate date, AttendanceStatus status, UUID markedBy) {
        this.studentId = studentId;
        this.classGroupId = classGroupId;
        this.date = date;
        this.status = status;
        this.markedBy = markedBy;
    }

    // Business methods
    public boolean isPresent() {
        return status == AttendanceStatus.PRESENT;
    }

    public boolean isAbsent() {
        return status == AttendanceStatus.ABSENT;
    }

    // Getters and Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getStudentId() { return studentId; }
    public void setStudentId(UUID studentId) { this.studentId = studentId; }

    public UUID getClassGroupId() { return classGroupId; }
    public void setClassGroupId(UUID classGroupId) { this.classGroupId = classGroupId; }

    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }

    public AttendanceStatus getStatus() { return status; }
    public void setStatus(AttendanceStatus status) { this.status = status; }

    public UUID getPeriodId() { return periodId; }
    public void setPeriodId(UUID periodId) { this.periodId = periodId; }

    public UUID getMarkedBy() { return markedBy; }
    public void setMarkedBy(UUID markedBy) { this.markedBy = markedBy; }

    public Instant getMarkedAt() { return markedAt; }

    public String getRemarks() { return remarks; }
    public void setRemarks(String remarks) { this.remarks = remarks; }
}
