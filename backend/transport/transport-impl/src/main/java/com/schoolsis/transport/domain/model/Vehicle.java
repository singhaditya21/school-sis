package com.schoolsis.transport.domain.model;

import com.schoolsis.common.domain.model.TenantAwareEntity;
import jakarta.persistence.*;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "vehicles", indexes = {@Index(columnList = "tenant_id")})
public class Vehicle extends TenantAwareEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "registration_number", unique = true, nullable = false)
    private String registrationNumber;

    @Column(nullable = false)
    private String type;

    private Integer capacity;

    @Column(name = "driver_name")
    private String driverName;

    @Column(name = "driver_phone")
    private String driverPhone;

    @Column(name = "is_active")
    private boolean active = true;

    @OneToMany(mappedBy = "vehicle", cascade = CascadeType.ALL)
    private Set<Route> routes = new HashSet<>();

    public Vehicle() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public String getRegistrationNumber() { return registrationNumber; }
    public void setRegistrationNumber(String registrationNumber) { this.registrationNumber = registrationNumber; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public Integer getCapacity() { return capacity; }
    public void setCapacity(Integer capacity) { this.capacity = capacity; }
    public String getDriverName() { return driverName; }
    public void setDriverName(String driverName) { this.driverName = driverName; }
    public String getDriverPhone() { return driverPhone; }
    public void setDriverPhone(String driverPhone) { this.driverPhone = driverPhone; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Set<Route> getRoutes() { return routes; }
}
