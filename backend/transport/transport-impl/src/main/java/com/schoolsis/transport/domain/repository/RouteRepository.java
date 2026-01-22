package com.schoolsis.transport.domain.repository;

import com.schoolsis.transport.domain.model.Route;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface RouteRepository extends JpaRepository<Route, UUID> {

    @Query("SELECT r FROM Route r WHERE r.tenantId = :tenantId AND r.active = true ORDER BY r.name")
    List<Route> findActiveByTenantId(UUID tenantId);

    @Query("SELECT r FROM Route r WHERE r.tenantId = :tenantId AND r.vehicleId = :vehicleId")
    List<Route> findByTenantIdAndVehicleId(UUID tenantId, UUID vehicleId);
}
