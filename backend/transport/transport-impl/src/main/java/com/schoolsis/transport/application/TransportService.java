package com.schoolsis.transport.application;

import com.schoolsis.platform.infrastructure.TenantContext;
import com.schoolsis.transport.domain.model.*;
import com.schoolsis.transport.domain.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@Transactional
public class TransportService {

    private final VehicleRepository vehicleRepository;
    private final RouteRepository routeRepository;

    public TransportService(VehicleRepository vehicleRepository, RouteRepository routeRepository) {
        this.vehicleRepository = vehicleRepository;
        this.routeRepository = routeRepository;
    }

    @Transactional(readOnly = true)
    public List<Vehicle> getVehicles() {
        return vehicleRepository.findActiveByTenantId(TenantContext.getCurrentTenantId());
    }

    @Transactional(readOnly = true)
    public List<Route> getRoutes() {
        return routeRepository.findActiveByTenantId(TenantContext.getCurrentTenantId());
    }

    public Vehicle createVehicle(CreateVehicleCommand cmd) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        Vehicle v = new Vehicle();
        v.setTenantId(tenantId);
        v.setRegistrationNumber(cmd.registrationNumber());
        v.setType(cmd.type());
        v.setCapacity(cmd.capacity());
        v.setDriverName(cmd.driverName());
        v.setDriverPhone(cmd.driverPhone());
        return vehicleRepository.save(v);
    }

    public Route createRoute(CreateRouteCommand cmd) {
        UUID tenantId = TenantContext.getCurrentTenantId();
        Route r = new Route();
        r.setTenantId(tenantId);
        r.setName(cmd.name());
        r.setVehicleId(cmd.vehicleId());
        r.setDescription(cmd.description());
        return routeRepository.save(r);
    }

    public record CreateVehicleCommand(String registrationNumber, String type, Integer capacity, String driverName, String driverPhone) {}
    public record CreateRouteCommand(String name, UUID vehicleId, String description) {}
}
