package com.schoolsis.transport.domain.repository;

import com.schoolsis.transport.domain.model.Vehicle;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface VehicleRepository extends JpaRepository<Vehicle, UUID> {

    @Query("SELECT v FROM Vehicle v WHERE v.tenantId = :tenantId AND v.active = true ORDER BY v.registrationNumber")
    List<Vehicle> findActiveByTenantId(UUID tenantId);
}
