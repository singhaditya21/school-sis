package com.schoolsis.students.api.v1;

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
 * Unit tests for StudentController endpoints.
 */
@WebMvcTest(StudentController.class)
@DisplayName("Student Controller Tests")
class StudentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Nested
    @DisplayName("POST /api/v1/students")
    class CreateStudent {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-STU-001: Should create student successfully")
        void shouldCreateStudent() throws Exception {
            String studentJson = """
                    {
                        "firstName": "Aarav",
                        "lastName": "Sharma",
                        "dateOfBirth": "2012-05-15",
                        "gender": "MALE",
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "section": "A",
                        "parentId": "660e8400-e29b-41d4-a716-446655440000",
                        "bloodGroup": "O+",
                        "address": "123 Main Street, New Delhi"
                    }
                    """;

            mockMvc.perform(post("/api/v1/students")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(studentJson))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.id").exists())
                    .andExpect(jsonPath("$.data.admissionNumber").exists())
                    .andExpect(jsonPath("$.data.firstName").value("Aarav"));
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should deny TEACHER from creating students")
        void shouldDenyTeacherAccess() throws Exception {
            String studentJson = """
                    {
                        "firstName": "Test",
                        "lastName": "Student",
                        "dateOfBirth": "2012-01-01",
                        "gender": "MALE",
                        "classId": "550e8400-e29b-41d4-a716-446655440000"
                    }
                    """;

            mockMvc.perform(post("/api/v1/students")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(studentJson))
                    .andExpect(status().isForbidden());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should validate required fields")
        void shouldValidateRequiredFields() throws Exception {
            String incompleteJson = """
                    {
                        "firstName": "Test"
                    }
                    """;

            mockMvc.perform(post("/api/v1/students")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(incompleteJson))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/students/{studentId}")
    class GetStudentById {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-STU-002: Should return student details")
        void shouldReturnStudentDetails() throws Exception {
            UUID studentId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/students/{studentId}", studentId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.id").exists())
                    .andExpect(jsonPath("$.data.firstName").exists())
                    .andExpect(jsonPath("$.data.admissionNumber").exists())
                    .andExpect(jsonPath("$.data.class").exists())
                    .andExpect(jsonPath("$.data.parent").exists());
        }

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("Should allow PARENT to view own child")
        void shouldAllowParentViewOwnChild() throws Exception {
            UUID studentId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/students/{studentId}", studentId))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/students")
    class ListStudents {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-STU-003: Should list students by class")
        void shouldListStudentsByClass() throws Exception {
            UUID classId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/students")
                    .param("classId", classId.toString()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].id").exists());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should return paginated results")
        void shouldReturnPaginatedResults() throws Exception {
            mockMvc.perform(get("/api/v1/students")
                    .param("page", "0")
                    .param("size", "20"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.pagination.page").value(0))
                    .andExpect(jsonPath("$.pagination.size").value(20))
                    .andExpect(jsonPath("$.pagination.totalElements").isNumber());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/students/search")
    class SearchStudents {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-STU-004: Should search by name")
        void shouldSearchByName() throws Exception {
            mockMvc.perform(get("/api/v1/students/search")
                    .param("q", "Aarav"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should search by admission number")
        void shouldSearchByAdmissionNumber() throws Exception {
            mockMvc.perform(get("/api/v1/students/search")
                    .param("q", "ADM2026001"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should search by parent phone")
        void shouldSearchByParentPhone() throws Exception {
            mockMvc.perform(get("/api/v1/students/search")
                    .param("q", "9876543210"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray());
        }
    }

    @Nested
    @DisplayName("PUT /api/v1/students/{studentId}")
    class UpdateStudent {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-STU-005: Should update student details")
        void shouldUpdateStudentDetails() throws Exception {
            UUID studentId = UUID.randomUUID();
            String updateJson = """
                    {
                        "bloodGroup": "A+",
                        "address": "456 New Address, Delhi"
                    }
                    """;

            mockMvc.perform(put("/api/v1/students/{studentId}", studentId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(updateJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true));
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should deny TEACHER from updating")
        void shouldDenyTeacherUpdate() throws Exception {
            UUID studentId = UUID.randomUUID();
            String updateJson = """
                    {
                        "address": "New Address"
                    }
                    """;

            mockMvc.perform(put("/api/v1/students/{studentId}", studentId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(updateJson))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/students/promote")
    class PromoteStudents {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-STU-006: Should promote students to next class")
        void shouldPromoteStudents() throws Exception {
            String promoteJson = """
                    {
                        "studentIds": [
                            "550e8400-e29b-41d4-a716-446655440000",
                            "660e8400-e29b-41d4-a716-446655440000"
                        ],
                        "targetClassId": "770e8400-e29b-41d4-a716-446655440000"
                    }
                    """;

            mockMvc.perform(post("/api/v1/students/promote")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(promoteJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.promoted").value(2));
        }

        @Test
        @WithMockUser(roles = "PRINCIPAL")
        @DisplayName("Should allow PRINCIPAL to promote")
        void shouldAllowPrincipalPromote() throws Exception {
            String promoteJson = """
                    {
                        "studentIds": ["550e8400-e29b-41d4-a716-446655440000"],
                        "targetClassId": "770e8400-e29b-41d4-a716-446655440000"
                    }
                    """;

            mockMvc.perform(post("/api/v1/students/promote")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(promoteJson))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/students/{studentId}/tc")
    class GenerateTC {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-STU-007: Should generate transfer certificate")
        void shouldGenerateTC() throws Exception {
            UUID studentId = UUID.randomUUID();
            String tcJson = """
                    {
                        "reason": "Parent Transfer",
                        "lastWorkingDate": "2026-03-31"
                    }
                    """;

            mockMvc.perform(post("/api/v1/students/{studentId}/tc", studentId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(tcJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.tcNumber").exists())
                    .andExpect(jsonPath("$.data.pdfUrl").exists());
        }
    }

    @Nested
    @DisplayName("Multi-Tenant Isolation")
    class MultiTenantIsolation {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-USER-005: Should only see own tenant data")
        void shouldOnlySeeOwnTenantData() throws Exception {
            // User from Tenant A should not see Tenant B data
            mockMvc.perform(get("/api/v1/students"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data[*].tenantId").value(everyItem(
                            is("current-tenant-id"))));
        }
    }

    @Nested
    @DisplayName("Authentication Required")
    class AuthenticationRequired {

        @Test
        @DisplayName("Should require authentication")
        void shouldRequireAuth() throws Exception {
            mockMvc.perform(get("/api/v1/students"))
                    .andExpect(status().isUnauthorized());
        }
    }
}
