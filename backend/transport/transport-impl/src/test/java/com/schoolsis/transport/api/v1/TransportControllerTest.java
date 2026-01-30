package com.schoolsis.transport.api.v1;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for TransportController endpoints.
 */
@WebMvcTest(TransportController.class)
@DisplayName("Transport Controller Tests")
class TransportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Nested
    @DisplayName("POST /api/v1/transport/routes")
    class CreateRoute {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-TRNS-001: Should create route")
        void shouldCreateRoute() throws Exception {
            String routeJson = """
                    {
                        "name": "Route 1 - North Delhi",
                        "stops": [
                            {"name": "Rohini Sector 22", "lat": 28.7041, "lng": 77.1025, "sequence": 1},
                            {"name": "Rohini Sector 15", "lat": 28.7145, "lng": 77.1234, "sequence": 2},
                            {"name": "Pitampura", "lat": 28.6892, "lng": 77.1346, "sequence": 3}
                        ],
                        "vehicleId": "550e8400-e29b-41d4-a716-446655440000",
                        "driverId": "660e8400-e29b-41d4-a716-446655440000",
                        "attendantId": "770e8400-e29b-41d4-a716-446655440000"
                    }
                    """;

            mockMvc.perform(post("/api/v1/transport/routes")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(routeJson))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.id").exists())
                    .andExpect(jsonPath("$.data.name").value("Route 1 - North Delhi"))
                    .andExpect(jsonPath("$.data.totalStops").value(3));
        }

        @Test
        @WithMockUser(roles = "TRANSPORT_COORDINATOR")
        @DisplayName("Should allow TRANSPORT_COORDINATOR to create")
        void shouldAllowTransportCoordinator() throws Exception {
            String routeJson = """
                    {
                        "name": "Route 2 - South Delhi",
                        "stops": [{"name": "Stop 1", "lat": 28.5, "lng": 77.2, "sequence": 1}],
                        "vehicleId": "550e8400-e29b-41d4-a716-446655440000",
                        "driverId": "660e8400-e29b-41d4-a716-446655440000"
                    }
                    """;

            mockMvc.perform(post("/api/v1/transport/routes")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(routeJson))
                    .andExpect(status().isCreated());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/transport/assignments")
    class AssignStudent {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-TRNS-002: Should assign student to route")
        void shouldAssignStudentToRoute() throws Exception {
            String assignJson = """
                    {
                        "studentId": "550e8400-e29b-41d4-a716-446655440000",
                        "routeId": "660e8400-e29b-41d4-a716-446655440000",
                        "pickupStopId": "770e8400-e29b-41d4-a716-446655440000",
                        "dropStopId": "880e8400-e29b-41d4-a716-446655440000"
                    }
                    """;

            mockMvc.perform(post("/api/v1/transport/assignments")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(assignJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.assignmentId").exists());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should add transport fee on assignment")
        void shouldAddTransportFee() throws Exception {
            String assignJson = """
                    {
                        "studentId": "550e8400-e29b-41d4-a716-446655440000",
                        "routeId": "660e8400-e29b-41d4-a716-446655440000",
                        "pickupStopId": "770e8400-e29b-41d4-a716-446655440000"
                    }
                    """;

            mockMvc.perform(post("/api/v1/transport/assignments")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(assignJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.transportFeeAdded").value(true));
        }
    }

    @Nested
    @DisplayName("GET /api/v1/transport/routes/{routeId}/students")
    class GetRouteStudents {

        @Test
        @WithMockUser(roles = "TRANSPORT_COORDINATOR")
        @DisplayName("TC-TRNS-003: Should return route students")
        void shouldReturnRouteStudents() throws Exception {
            UUID routeId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/transport/routes/{routeId}/students", routeId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].studentName").exists())
                    .andExpect(jsonPath("$.data[0].pickupStop").exists())
                    .andExpect(jsonPath("$.data[0].dropStop").exists())
                    .andExpect(jsonPath("$.data[0].parentPhone").exists());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/transport/trips/start")
    class StartTrip {

        @Test
        @WithMockUser(roles = "DRIVER")
        @DisplayName("TC-TRNS-004: Should start trip")
        void shouldStartTrip() throws Exception {
            String tripJson = """
                    {
                        "routeId": "550e8400-e29b-41d4-a716-446655440000",
                        "tripType": "PICKUP",
                        "startLocation": {"lat": 28.7041, "lng": 77.1025}
                    }
                    """;

            mockMvc.perform(post("/api/v1/transport/trips/start")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(tripJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.tripId").exists())
                    .andExpect(jsonPath("$.data.status").value("IN_PROGRESS"))
                    .andExpect(jsonPath("$.data.trackingEnabled").value(true));
        }
    }

    @Nested
    @DisplayName("POST /api/v1/transport/location")
    class UpdateLocation {

        @Test
        @WithMockUser(roles = "DRIVER")
        @DisplayName("TC-TRNS-005: Should update GPS location")
        void shouldUpdateLocation() throws Exception {
            String locationJson = """
                    {
                        "vehicleId": "550e8400-e29b-41d4-a716-446655440000",
                        "lat": 28.7145,
                        "lng": 77.1234,
                        "speed": 25,
                        "heading": 90,
                        "timestamp": "2026-01-28T07:30:00Z"
                    }
                    """;

            mockMvc.perform(post("/api/v1/transport/location")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(locationJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.recorded").value(true));
        }

        @Test
        @WithMockUser(roles = "DRIVER")
        @DisplayName("TC-TRNS-006: Should trigger parent notification when near stop")
        void shouldTriggerNotificationWhenNearStop() throws Exception {
            // Location near a pickup stop
            String locationJson = """
                    {
                        "vehicleId": "550e8400-e29b-41d4-a716-446655440000",
                        "lat": 28.7042,
                        "lng": 77.1026,
                        "timestamp": "2026-01-28T07:35:00Z"
                    }
                    """;

            mockMvc.perform(post("/api/v1/transport/location")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(locationJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.notificationsSent").value(greaterThan(0)));
        }
    }

    @Nested
    @DisplayName("GET /api/v1/transport/vehicles/{vehicleId}/location")
    class GetVehicleLocation {

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("Should return real-time vehicle location")
        void shouldReturnVehicleLocation() throws Exception {
            UUID vehicleId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/transport/vehicles/{vehicleId}/location", vehicleId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.lat").isNumber())
                    .andExpect(jsonPath("$.data.lng").isNumber())
                    .andExpect(jsonPath("$.data.speed").isNumber())
                    .andExpect(jsonPath("$.data.lastUpdated").exists());
        }
    }

    @Nested
    @DisplayName("Route Listing")
    class RouteListing {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should list all routes")
        void shouldListAllRoutes() throws Exception {
            mockMvc.perform(get("/api/v1/transport/routes"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].id").exists())
                    .andExpect(jsonPath("$.data[0].name").exists())
                    .andExpect(jsonPath("$.data[0].studentCount").isNumber());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should return route details")
        void shouldReturnRouteDetails() throws Exception {
            UUID routeId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/transport/routes/{routeId}", routeId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.name").exists())
                    .andExpect(jsonPath("$.data.stops").isArray())
                    .andExpect(jsonPath("$.data.vehicle").exists())
                    .andExpect(jsonPath("$.data.driver").exists());
        }
    }

    @Nested
    @DisplayName("Trip Management")
    class TripManagement {

        @Test
        @WithMockUser(roles = "DRIVER")
        @DisplayName("Should end trip")
        void shouldEndTrip() throws Exception {
            UUID tripId = UUID.randomUUID();
            String endJson = """
                    {
                        "endLocation": {"lat": 28.6139, "lng": 77.2090},
                        "odometer": 12500
                    }
                    """;

            mockMvc.perform(post("/api/v1/transport/trips/{tripId}/end", tripId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(endJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                    .andExpect(jsonPath("$.data.duration").isNumber())
                    .andExpect(jsonPath("$.data.distance").isNumber());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should return trip history")
        void shouldReturnTripHistory() throws Exception {
            UUID routeId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/transport/routes/{routeId}/trips", routeId)
                    .param("startDate", "2026-01-01")
                    .param("endDate", "2026-01-31"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].startTime").exists())
                    .andExpect(jsonPath("$.data[0].endTime").exists());
        }
    }

    @Nested
    @DisplayName("Student Pickup/Drop Tracking")
    class StudentTracking {

        @Test
        @WithMockUser(roles = "ATTENDANT")
        @DisplayName("Should record student pickup")
        void shouldRecordPickup() throws Exception {
            String pickupJson = """
                    {
                        "tripId": "550e8400-e29b-41d4-a716-446655440000",
                        "studentId": "660e8400-e29b-41d4-a716-446655440000",
                        "stopId": "770e8400-e29b-41d4-a716-446655440000",
                        "action": "PICKUP"
                    }
                    """;

            mockMvc.perform(post("/api/v1/transport/student-tracking")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(pickupJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.recorded").value(true))
                    .andExpect(jsonPath("$.data.parentNotified").value(true));
        }

        @Test
        @WithMockUser(roles = "ATTENDANT")
        @DisplayName("Should record student drop")
        void shouldRecordDrop() throws Exception {
            String dropJson = """
                    {
                        "tripId": "550e8400-e29b-41d4-a716-446655440000",
                        "studentId": "660e8400-e29b-41d4-a716-446655440000",
                        "stopId": "880e8400-e29b-41d4-a716-446655440000",
                        "action": "DROP"
                    }
                    """;

            mockMvc.perform(post("/api/v1/transport/student-tracking")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(dropJson))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("Vehicle Management")
    class VehicleManagement {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should add vehicle")
        void shouldAddVehicle() throws Exception {
            String vehicleJson = """
                    {
                        "registrationNumber": "DL01AB1234",
                        "type": "BUS",
                        "capacity": 40,
                        "make": "Tata",
                        "model": "Starbus",
                        "year": 2023,
                        "insuranceExpiry": "2027-06-30",
                        "fitnessExpiry": "2027-03-31"
                    }
                    """;

            mockMvc.perform(post("/api/v1/transport/vehicles")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(vehicleJson))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.data.id").exists());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should list vehicles")
        void shouldListVehicles() throws Exception {
            mockMvc.perform(get("/api/v1/transport/vehicles"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray());
        }
    }
}
