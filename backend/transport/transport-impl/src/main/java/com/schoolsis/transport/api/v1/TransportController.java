package com.schoolsis.transport.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.transport.application.TransportService;
import com.schoolsis.transport.application.TransportService.*;
import com.schoolsis.transport.domain.model.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/transport")
public class TransportController {

    private final TransportService transportService;

    public TransportController(TransportService transportService) {
        this.transportService = transportService;
    }

    @GetMapping("/vehicles")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TRANSPORT_MANAGER')")
    public ApiResponse<List<VehicleResponse>> getVehicles() {
        return ApiResponse.ok(transportService.getVehicles().stream()
            .map(v -> new VehicleResponse(v.getId(), v.getRegistrationNumber(), v.getType(), v.getCapacity(), v.getDriverName(), v.getDriverPhone())).toList());
    }

    @PostMapping("/vehicles")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TRANSPORT_MANAGER')")
    public ApiResponse<VehicleResponse> createVehicle(@Valid @RequestBody CreateVehicleRequest req) {
        Vehicle v = transportService.createVehicle(new CreateVehicleCommand(req.registrationNumber(), req.type(), req.capacity(), req.driverName(), req.driverPhone()));
        return ApiResponse.ok(new VehicleResponse(v.getId(), v.getRegistrationNumber(), v.getType(), v.getCapacity(), v.getDriverName(), v.getDriverPhone()));
    }

    @GetMapping("/routes")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TRANSPORT_MANAGER', 'PARENT')")
    public ApiResponse<List<RouteResponse>> getRoutes() {
        return ApiResponse.ok(transportService.getRoutes().stream()
            .map(r -> new RouteResponse(r.getId(), r.getName(), r.getVehicleId(), r.getDescription())).toList());
    }

    @PostMapping("/routes")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TRANSPORT_MANAGER')")
    public ApiResponse<RouteResponse> createRoute(@Valid @RequestBody CreateRouteRequest req) {
        Route r = transportService.createRoute(new CreateRouteCommand(req.name(), req.vehicleId(), req.description()));
        return ApiResponse.ok(new RouteResponse(r.getId(), r.getName(), r.getVehicleId(), r.getDescription()));
    }

    public record CreateVehicleRequest(@NotBlank String registrationNumber, @NotBlank String type, Integer capacity, String driverName, String driverPhone) {}
    public record CreateRouteRequest(@NotBlank String name, UUID vehicleId, String description) {}
    public record VehicleResponse(UUID id, String registrationNumber, String type, Integer capacity, String driverName, String driverPhone) {}
    public record RouteResponse(UUID id, String name, UUID vehicleId, String description) {}
}
