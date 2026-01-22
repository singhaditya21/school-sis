package com.schoolsis.timetable.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "periods", indexes = {@Index(columnList = "tenant_id")})
public class Period extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    @Column(name = "period_order")
    private Integer periodOrder;

    @Column(name = "is_break")
    private boolean isBreak = false;

    public Period() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public LocalTime getStartTime() { return startTime; }
    public void setStartTime(LocalTime startTime) { this.startTime = startTime; }
    public LocalTime getEndTime() { return endTime; }
    public void setEndTime(LocalTime endTime) { this.endTime = endTime; }
    public Integer getPeriodOrder() { return periodOrder; }
    public void setPeriodOrder(Integer periodOrder) { this.periodOrder = periodOrder; }
    public boolean isBreak() { return isBreak; }
    public void setBreak(boolean aBreak) { isBreak = aBreak; }
}
