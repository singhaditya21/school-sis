package com.schoolsis.timetable.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "timetable_entries", indexes = {
    @Index(columnList = "tenant_id, class_group_id"),
    @Index(columnList = "tenant_id, teacher_id")
}, uniqueConstraints = {
    @UniqueConstraint(columnNames = {"class_group_id", "day_of_week", "period_id"})
})
public class TimetableEntry extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "class_group_id", nullable = false)
    private UUID classGroupId;

    @Column(name = "day_of_week", nullable = false)
    private Integer dayOfWeek; // 1=Monday, 7=Sunday

    @Column(name = "period_id", nullable = false)
    private UUID periodId;

    @Column(name = "subject_id", nullable = false)
    private UUID subjectId;

    @Column(name = "teacher_id", nullable = false)
    private UUID teacherId;

    private String room;

    public TimetableEntry() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getClassGroupId() { return classGroupId; }
    public void setClassGroupId(UUID classGroupId) { this.classGroupId = classGroupId; }
    public Integer getDayOfWeek() { return dayOfWeek; }
    public void setDayOfWeek(Integer dayOfWeek) { this.dayOfWeek = dayOfWeek; }
    public UUID getPeriodId() { return periodId; }
    public void setPeriodId(UUID periodId) { this.periodId = periodId; }
    public UUID getSubjectId() { return subjectId; }
    public void setSubjectId(UUID subjectId) { this.subjectId = subjectId; }
    public UUID getTeacherId() { return teacherId; }
    public void setTeacherId(UUID teacherId) { this.teacherId = teacherId; }
    public String getRoom() { return room; }
    public void setRoom(String room) { this.room = room; }
}
