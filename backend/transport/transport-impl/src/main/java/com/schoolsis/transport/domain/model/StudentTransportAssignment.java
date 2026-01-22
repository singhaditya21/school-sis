package com.schoolsis.transport.domain.model;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "student_transport_assignments", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"student_id", "route_id"})
})
public class StudentTransportAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "student_id", nullable = false)
    private UUID studentId;

    @Column(name = "route_id", nullable = false)
    private UUID routeId;

    @Column(name = "stop_id")
    private UUID stopId;

    @Column(name = "is_active")
    private boolean active = true;

    public StudentTransportAssignment() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getStudentId() { return studentId; }
    public void setStudentId(UUID studentId) { this.studentId = studentId; }
    public UUID getRouteId() { return routeId; }
    public void setRouteId(UUID routeId) { this.routeId = routeId; }
    public UUID getStopId() { return stopId; }
    public void setStopId(UUID stopId) { this.stopId = stopId; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
