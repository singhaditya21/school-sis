package com.schoolsis.platform.api.v1;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Unit tests for TeacherController endpoints.
 */
@WebMvcTest(TeacherController.class)
@DisplayName("Teacher Controller Tests")
class TeacherControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Nested
    @DisplayName("GET /api/v1/teacher/classes")
    class GetAssignedClasses {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-T001: Should return assigned classes for teacher")
        void shouldReturnAssignedClasses() throws Exception {
            mockMvc.perform(get("/api/v1/teacher/classes")
                    .contentType(MediaType.APPLICATION_JSON))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].id").exists())
                    .andExpect(jsonPath("$.data[0].name").exists())
                    .andExpect(jsonPath("$.data[0].grade").exists())
                    .andExpect(jsonPath("$.data[0].studentCount").isNumber());
        }

        @Test
        @WithMockUser(roles = "SUPER_ADMIN")
        @DisplayName("TC-T019a: Should allow SUPER_ADMIN access")
        void shouldAllowSuperAdminAccess() throws Exception {
            mockMvc.perform(get("/api/v1/teacher/classes"))
                    .andExpect(status().isOk());
        }

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("TC-T019b: Should deny PARENT access")
        void shouldDenyParentAccess() throws Exception {
            mockMvc.perform(get("/api/v1/teacher/classes"))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("TC-T020: Should require authentication")
        void shouldRequireAuthentication() throws Exception {
            mockMvc.perform(get("/api/v1/teacher/classes"))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/teacher/schedule/today")
    class GetTodaySchedule {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-T002: Should return today's schedule with next class marker")
        void shouldReturnTodaySchedule() throws Exception {
            mockMvc.perform(get("/api/v1/teacher/schedule/today"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].classId").exists())
                    .andExpect(jsonPath("$.data[0].subject").exists())
                    .andExpect(jsonPath("$.data[0].room").exists())
                    .andExpect(jsonPath("$.data[0].startTime").exists())
                    .andExpect(jsonPath("$.data[0].endTime").exists());
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-T002b: Should mark next upcoming class")
        void shouldMarkNextClass() throws Exception {
            mockMvc.perform(get("/api/v1/teacher/schedule/today"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data[?(@.isNext == true)]").exists());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/teacher/schedule")
    class GetWeeklySchedule {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-T003: Should return full weekly schedule")
        void shouldReturnWeeklySchedule() throws Exception {
            mockMvc.perform(get("/api/v1/teacher/schedule"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data").isArray());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/teacher/classes/{classId}/students")
    class GetStudentsForClass {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-T004: Should return students for valid class")
        void shouldReturnStudentsForClass() throws Exception {
            String classId = "class-123";

            mockMvc.perform(get("/api/v1/teacher/classes/{classId}/students", classId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].id").exists())
                    .andExpect(jsonPath("$.data[0].name").exists())
                    .andExpect(jsonPath("$.data[0].rollNumber").exists());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/teacher/attendance")
    class SubmitAttendance {

        private String validAttendanceJson;

        @BeforeEach
        void setUp() {
            validAttendanceJson = """
                    {
                        "classId": "class-123",
                        "date": "2026-01-28",
                        "period": 1,
                        "entries": [
                            {"studentId": "s1", "status": "PRESENT"},
                            {"studentId": "s2", "status": "ABSENT"},
                            {"studentId": "s3", "status": "LATE"}
                        ]
                    }
                    """;
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-T006: Should accept attendance with all present")
        void shouldAcceptAllPresent() throws Exception {
            String allPresentJson = """
                    {
                        "classId": "class-123",
                        "date": "2026-01-28",
                        "period": 1,
                        "entries": [
                            {"studentId": "s1", "status": "PRESENT"},
                            {"studentId": "s2", "status": "PRESENT"},
                            {"studentId": "s3", "status": "PRESENT"}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/teacher/attendance")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(allPresentJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.presentCount").value(3))
                    .andExpect(jsonPath("$.data.absentCount").value(0))
                    .andExpect(jsonPath("$.data.lateCount").value(0));
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-T007: Should accept mixed attendance statuses")
        void shouldAcceptMixedStatuses() throws Exception {
            mockMvc.perform(post("/api/v1/teacher/attendance")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(validAttendanceJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.presentCount").value(1))
                    .andExpect(jsonPath("$.data.absentCount").value(1))
                    .andExpect(jsonPath("$.data.lateCount").value(1));
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-T008: Should reject empty entries")
        void shouldRejectEmptyEntries() throws Exception {
            String emptyEntriesJson = """
                    {
                        "classId": "class-123",
                        "date": "2026-01-28",
                        "period": 1,
                        "entries": []
                    }
                    """;

            mockMvc.perform(post("/api/v1/teacher/attendance")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(emptyEntriesJson))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/teacher/gradebook")
    class SubmitMarks {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-T009: Should accept valid marks submission")
        void shouldAcceptValidMarks() throws Exception {
            String marksJson = """
                    {
                        "classId": "class-123",
                        "examId": "midterm-2026",
                        "maxMarks": 100,
                        "entries": [
                            {"studentId": "s1", "marks": 85},
                            {"studentId": "s2", "marks": 72},
                            {"studentId": "s3", "marks": 91}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/teacher/gradebook")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(marksJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.classAverage").exists())
                    .andExpect(jsonPath("$.data.entriesProcessed").value(3));
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-T009b: Should calculate correct class average")
        void shouldCalculateCorrectAverage() throws Exception {
            String marksJson = """
                    {
                        "classId": "class-123",
                        "examId": "midterm-2026",
                        "maxMarks": 100,
                        "entries": [
                            {"studentId": "s1", "marks": 80},
                            {"studentId": "s2", "marks": 70},
                            {"studentId": "s3", "marks": 90}
                        ]
                    }
                    """;

            // Average should be (80 + 70 + 90) / 3 = 80
            mockMvc.perform(post("/api/v1/teacher/gradebook")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(marksJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.classAverage").value(80.0));
        }
    }
}
