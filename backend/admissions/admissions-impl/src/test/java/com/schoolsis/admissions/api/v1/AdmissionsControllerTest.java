package com.schoolsis.admissions.api.v1;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for AdmissionsController endpoints.
 */
@WebMvcTest(AdmissionsController.class)
@DisplayName("Admissions Controller Tests")
class AdmissionsControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Nested
    @DisplayName("POST /api/v1/admissions/leads")
    class CreateLead {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-ADM-001: Should create admission lead")
        void shouldCreateLead() throws Exception {
            String leadJson = """
                    {
                        "studentName": "Aarav Sharma",
                        "parentName": "Rajesh Sharma",
                        "phone": "9876543210",
                        "email": "rajesh@example.com",
                        "gradeApplied": "10",
                        "source": "WEBSITE"
                    }
                    """;

            mockMvc.perform(post("/api/v1/admissions/leads")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(leadJson))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.id").exists())
                    .andExpect(jsonPath("$.data.stage").value("ENQUIRY"))
                    .andExpect(jsonPath("$.data.enquiryNumber").exists());
        }

        @Test
        @WithMockUser(roles = "RECEPTIONIST")
        @DisplayName("Should allow RECEPTIONIST to create leads")
        void shouldAllowReceptionist() throws Exception {
            String leadJson = """
                    {
                        "studentName": "Test Student",
                        "parentName": "Test Parent",
                        "phone": "9876543210",
                        "gradeApplied": "5"
                    }
                    """;

            mockMvc.perform(post("/api/v1/admissions/leads")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(leadJson))
                    .andExpect(status().isCreated());
        }
    }

    @Nested
    @DisplayName("PUT /api/v1/admissions/leads/{leadId}/stage")
    class UpdateLeadStage {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-ADM-002: Should update lead stage")
        void shouldUpdateLeadStage() throws Exception {
            UUID leadId = UUID.randomUUID();
            String stageJson = """
                    {
                        "stage": "TEST",
                        "notes": "Scheduled for entrance test on 2026-02-15"
                    }
                    """;

            mockMvc.perform(put("/api/v1/admissions/leads/{leadId}/stage", leadId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(stageJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.stage").value("TEST"));
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should trigger notification on stage change")
        void shouldTriggerNotification() throws Exception {
            UUID leadId = UUID.randomUUID();
            String stageJson = """
                    {
                        "stage": "OFFER",
                        "notes": "Selected for admission"
                    }
                    """;

            mockMvc.perform(put("/api/v1/admissions/leads/{leadId}/stage", leadId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(stageJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.notificationSent").value(true));
        }
    }

    @Nested
    @DisplayName("POST /api/v1/admissions/applications")
    class SubmitApplication {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-ADM-003: Should submit application")
        void shouldSubmitApplication() throws Exception {
            String applicationJson = """
                    {
                        "leadId": "550e8400-e29b-41d4-a716-446655440000",
                        "studentDetails": {
                            "firstName": "Aarav",
                            "lastName": "Sharma",
                            "dateOfBirth": "2012-05-15",
                            "gender": "MALE",
                            "bloodGroup": "O+",
                            "aadhaarNumber": "XXXX-XXXX-1234"
                        },
                        "parentDetails": {
                            "fatherName": "Rajesh Sharma",
                            "motherName": "Priya Sharma",
                            "fatherOccupation": "Engineer",
                            "motherOccupation": "Doctor",
                            "phone": "9876543210",
                            "email": "rajesh@example.com"
                        },
                        "address": {
                            "line1": "123 Main Street",
                            "city": "New Delhi",
                            "state": "Delhi",
                            "pincode": "110001"
                        },
                        "previousSchool": {
                            "name": "ABC School",
                            "board": "CBSE",
                            "lastClass": "9"
                        }
                    }
                    """;

            mockMvc.perform(post("/api/v1/admissions/applications")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(applicationJson))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.data.applicationNumber").exists())
                    .andExpect(jsonPath("$.data.status").value("SUBMITTED"));
        }
    }

    @Nested
    @DisplayName("POST /api/v1/admissions/applications/{id}/documents")
    class UploadDocuments {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-ADM-004: Should upload document")
        void shouldUploadDocument() throws Exception {
            UUID applicationId = UUID.randomUUID();
            MockMultipartFile file = new MockMultipartFile(
                    "file",
                    "aadhaar.pdf",
                    "application/pdf",
                    "test content".getBytes());

            mockMvc.perform(multipart("/api/v1/admissions/applications/{id}/documents", applicationId)
                    .file(file)
                    .param("type", "AADHAAR"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.documentId").exists())
                    .andExpect(jsonPath("$.data.type").value("AADHAAR"));
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should reject invalid file types")
        void shouldRejectInvalidFileTypes() throws Exception {
            UUID applicationId = UUID.randomUUID();
            MockMultipartFile file = new MockMultipartFile(
                    "file",
                    "malware.exe",
                    "application/x-msdownload",
                    "test content".getBytes());

            mockMvc.perform(multipart("/api/v1/admissions/applications/{id}/documents", applicationId)
                    .file(file)
                    .param("type", "OTHER"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.message").value(containsString("file type")));
        }
    }

    @Nested
    @DisplayName("POST /api/v1/admissions/applications/{id}/approve")
    class ApproveApplication {

        @Test
        @WithMockUser(roles = "PRINCIPAL")
        @DisplayName("TC-ADM-005: Should approve application")
        void shouldApproveApplication() throws Exception {
            UUID applicationId = UUID.randomUUID();

            mockMvc.perform(post("/api/v1/admissions/applications/{id}/approve", applicationId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.status").value("APPROVED"))
                    .andExpect(jsonPath("$.data.student.id").exists())
                    .andExpect(jsonPath("$.data.student.admissionNumber").exists());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should allow ADMIN to approve")
        void shouldAllowAdmin() throws Exception {
            UUID applicationId = UUID.randomUUID();

            mockMvc.perform(post("/api/v1/admissions/applications/{id}/approve", applicationId))
                    .andExpect(status().isOk());
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should deny TEACHER from approving")
        void shouldDenyTeacher() throws Exception {
            UUID applicationId = UUID.randomUUID();

            mockMvc.perform(post("/api/v1/admissions/applications/{id}/approve", applicationId))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/admissions/applications/{id}/reject")
    class RejectApplication {

        @Test
        @WithMockUser(roles = "PRINCIPAL")
        @DisplayName("TC-ADM-006: Should reject application with reason")
        void shouldRejectApplication() throws Exception {
            UUID applicationId = UUID.randomUUID();
            String rejectJson = """
                    {
                        "reason": "Incomplete documentation"
                    }
                    """;

            mockMvc.perform(post("/api/v1/admissions/applications/{id}/reject", applicationId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(rejectJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.status").value("REJECTED"))
                    .andExpect(jsonPath("$.data.rejectionReason").value("Incomplete documentation"));
        }

        @Test
        @WithMockUser(roles = "PRINCIPAL")
        @DisplayName("Should notify parent on rejection")
        void shouldNotifyParentOnRejection() throws Exception {
            UUID applicationId = UUID.randomUUID();
            String rejectJson = """
                    {
                        "reason": "Age criteria not met"
                    }
                    """;

            mockMvc.perform(post("/api/v1/admissions/applications/{id}/reject", applicationId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(rejectJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.notificationSent").value(true));
        }
    }

    @Nested
    @DisplayName("Sibling Priority")
    class SiblingPriority {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-ADM-007: Should flag sibling applications")
        void shouldFlagSiblingApplications() throws Exception {
            String applicationJson = """
                    {
                        "leadId": "550e8400-e29b-41d4-a716-446655440000",
                        "studentDetails": {
                            "firstName": "Priya",
                            "lastName": "Sharma",
                            "dateOfBirth": "2015-05-15"
                        },
                        "parentDetails": {
                            "fatherName": "Rajesh Sharma",
                            "phone": "9876543210"
                        },
                        "siblings": [
                            {"name": "Aarav Sharma", "admissionNumber": "ADM2024001"}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/admissions/applications")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(applicationJson))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.data.siblingPriority").value(true))
                    .andExpect(jsonPath("$.data.siblingDiscount").value(10));
        }
    }

    @Nested
    @DisplayName("Lead Stages")
    class LeadStages {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should list available stages")
        void shouldListStages() throws Exception {
            mockMvc.perform(get("/api/v1/admissions/stages"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[*].name").value(containsInAnyOrder(
                            "ENQUIRY", "TEST", "INTERVIEW", "OFFER", "ENROLLED", "REJECTED", "WITHDRAWN")));
        }
    }

    @Nested
    @DisplayName("Application Listing")
    class ApplicationListing {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should list applications with filters")
        void shouldListApplicationsWithFilters() throws Exception {
            mockMvc.perform(get("/api/v1/admissions/applications")
                    .param("status", "SUBMITTED")
                    .param("grade", "10")
                    .param("academicYear", "2026-27"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[*].status").value(everyItem(is("SUBMITTED"))));
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should return application statistics")
        void shouldReturnStatistics() throws Exception {
            mockMvc.perform(get("/api/v1/admissions/statistics")
                    .param("academicYear", "2026-27"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.totalEnquiries").isNumber())
                    .andExpect(jsonPath("$.data.totalApplications").isNumber())
                    .andExpect(jsonPath("$.data.approved").isNumber())
                    .andExpect(jsonPath("$.data.rejected").isNumber())
                    .andExpect(jsonPath("$.data.pending").isNumber());
        }
    }

    @Nested
    @DisplayName("Authentication Required")
    class AuthenticationRequired {

        @Test
        @DisplayName("Should require authentication")
        void shouldRequireAuth() throws Exception {
            mockMvc.perform(get("/api/v1/admissions/leads"))
                    .andExpect(status().isUnauthorized());
        }
    }
}
