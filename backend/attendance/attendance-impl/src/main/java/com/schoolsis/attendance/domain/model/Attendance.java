package com.schoolsis.attendance.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

/**
 * Attendance entity - daily attendance record.
 * Maps to the 'attendance' table from Flyway schema.
 */
@Entity
@Table(name = "attendance", indexes = {
        @Index(columnList = "tenant_id, student_id, date")
}, uniqueConstraints = {
        @UniqueConstraint(columnNames = { "tenant_id", "student_id", "date" })
})
public class Attendance extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(nullable = false)
    private LocalDate date;

    @Column(nullable = false)
    private String status = "PRESENT";

    @Column(name = "check_in_time")
    private LocalTime checkInTime;

    @Column(name = "check_out_time")
    private LocalTime checkOutTime;

    private String remarks;

    @Column(name = "marked_by")
    private UUID markedBy;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    // Constructors
    public Attendance() {
    }

    public Attendance(UUID studentId, LocalDate date, String status, UUID markedBy) {
        this.studentId = studentId;
        this.date = date;
        this.status = status;
        this.markedBy = markedBy;
    }

    // Business methods
    public boolean isPresent() {
        return "PRESENT".equals(status);
    }

    public boolean isAbsent() {
        return "ABSENT".equals(status);
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

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public LocalTime getCheckInTime() {
        return checkInTime;
    }

    public void setCheckInTime(LocalTime checkInTime) {
        this.checkInTime = checkInTime;
    }

    public LocalTime getCheckOutTime() {
        return checkOutTime;
    }

    public void setCheckOutTime(LocalTime checkOutTime) {
        this.checkOutTime = checkOutTime;
    }

    public String getRemarks() {
        return remarks;
    }

    public void setRemarks(String remarks) {
        this.remarks = remarks;
    }

    public UUID getMarkedBy() {
        return markedBy;
    }

    public void setMarkedBy(UUID markedBy) {
        this.markedBy = markedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
