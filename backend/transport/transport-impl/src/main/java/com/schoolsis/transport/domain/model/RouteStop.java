package com.schoolsis.transport.domain.model;

import jakarta.persistence.*;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "route_stops", indexes = {@Index(columnList = "route_id")})
public class RouteStop {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "route_id", nullable = false)
    private UUID routeId;

    @Column(name = "stop_name", nullable = false)
    private String stopName;

    @Column(name = "stop_order", nullable = false)
    private Integer stopOrder;

    @Column(name = "pickup_time")
    private LocalTime pickupTime;

    @Column(name = "drop_time")
    private LocalTime dropTime;

    private String address;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "route_id", insertable = false, updatable = false)
    private Route route;

    public RouteStop() {}

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getRouteId() { return routeId; }
    public void setRouteId(UUID routeId) { this.routeId = routeId; }
    public String getStopName() { return stopName; }
    public void setStopName(String stopName) { this.stopName = stopName; }
    public Integer getStopOrder() { return stopOrder; }
    public void setStopOrder(Integer stopOrder) { this.stopOrder = stopOrder; }
    public LocalTime getPickupTime() { return pickupTime; }
    public void setPickupTime(LocalTime pickupTime) { this.pickupTime = pickupTime; }
    public LocalTime getDropTime() { return dropTime; }
    public void setDropTime(LocalTime dropTime) { this.dropTime = dropTime; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public Route getRoute() { return route; }
}
