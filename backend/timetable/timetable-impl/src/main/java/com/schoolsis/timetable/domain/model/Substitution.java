package com.schoolsis.timetable.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "substitutions", indexes = {@Index(columnList = "tenant_id, date")})
public class Substitution extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "timetable_entry_id", nullable = false)
    private UUID timetableEntryId;

    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "substitute_teacher_id", nullable = false)
    private UUID substituteTeacherId;

    private String reason;

    public Substitution() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getTimetableEntryId() { return timetableEntryId; }
    public void setTimetableEntryId(UUID timetableEntryId) { this.timetableEntryId = timetableEntryId; }
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
    public UUID getSubstituteTeacherId() { return substituteTeacherId; }
    public void setSubstituteTeacherId(UUID substituteTeacherId) { this.substituteTeacherId = substituteTeacherId; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
