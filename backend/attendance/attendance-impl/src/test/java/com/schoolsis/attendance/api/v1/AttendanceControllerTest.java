package com.schoolsis.attendance.api.v1;

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
 * Unit tests for AttendanceController endpoints.
 */
@WebMvcTest(AttendanceController.class)
@DisplayName("Attendance Controller Tests")
class AttendanceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Nested
    @DisplayName("POST /api/v1/attendance")
    class MarkAttendance {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-ATT-001: Should mark daily attendance")
        void shouldMarkDailyAttendance() throws Exception {
            String attendanceJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "date": "2026-01-28",
                        "entries": [
                            {"studentId": "s1", "status": "PRESENT"},
                            {"studentId": "s2", "status": "ABSENT"},
                            {"studentId": "s3", "status": "LATE"}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/attendance")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(attendanceJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.presentCount").value(1))
                    .andExpect(jsonPath("$.data.absentCount").value(1))
                    .andExpect(jsonPath("$.data.lateCount").value(1));
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should trigger SMS for absent students")
        void shouldTriggerSmsForAbsentStudents() throws Exception {
            String attendanceJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "date": "2026-01-28",
                        "entries": [
                            {"studentId": "s1", "status": "ABSENT"}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/attendance")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(attendanceJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.smsTriggered").value(true));
        }

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("Should deny PARENT from marking")
        void shouldDenyParentMarking() throws Exception {
            String attendanceJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "date": "2026-01-28",
                        "entries": []
                    }
                    """;

            mockMvc.perform(post("/api/v1/attendance")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(attendanceJson))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/attendance/mark-all")
    class MarkAllPresent {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-ATT-002: Should mark all students present")
        void shouldMarkAllPresent() throws Exception {
            String markAllJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "date": "2026-01-28",
                        "status": "PRESENT"
                    }
                    """;

            mockMvc.perform(post("/api/v1/attendance/mark-all")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(markAllJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.markedCount").isNumber())
                    .andExpect(jsonPath("$.data.absentCount").value(0));
        }
    }

    @Nested
    @DisplayName("GET /api/v1/attendance")
    class GetAttendance {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-ATT-003: Should get attendance by date and class")
        void shouldGetAttendanceByDateAndClass() throws Exception {
            UUID classId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/attendance")
                    .param("date", "2026-01-28")
                    .param("classId", classId.toString()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].studentId").exists())
                    .andExpect(jsonPath("$.data[0].status").exists());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/attendance/summary/{studentId}")
    class GetStudentSummary {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-ATT-004: Should return student attendance summary")
        void shouldReturnStudentSummary() throws Exception {
            UUID studentId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/attendance/summary/{studentId}", studentId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.presentPercentage").isNumber())
                    .andExpect(jsonPath("$.data.absentCount").isNumber())
                    .andExpect(jsonPath("$.data.lateCount").isNumber())
                    .andExpect(jsonPath("$.data.totalDays").isNumber());
        }

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("Should allow PARENT to view child summary")
        void shouldAllowParentViewChildSummary() throws Exception {
            UUID studentId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/attendance/summary/{studentId}", studentId))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/attendance/reports/class/{classId}")
    class GetClassReport {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-ATT-005: Should return class attendance report")
        void shouldReturnClassReport() throws Exception {
            UUID classId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/attendance/reports/class/{classId}", classId)
                    .param("startDate", "2026-01-01")
                    .param("endDate", "2026-01-31"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.className").exists())
                    .andExpect(jsonPath("$.data.averageAttendance").isNumber())
                    .andExpect(jsonPath("$.data.students").isArray());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/attendance/period")
    class PeriodWiseAttendance {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-ATT-006: Should record period-wise attendance")
        void shouldRecordPeriodWiseAttendance() throws Exception {
            String periodJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "date": "2026-01-28",
                        "periodNumber": 3,
                        "subjectId": "660e8400-e29b-41d4-a716-446655440000",
                        "entries": [
                            {"studentId": "s1", "status": "PRESENT"},
                            {"studentId": "s2", "status": "PRESENT"}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/attendance/period")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(periodJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.period").value(3))
                    .andExpect(jsonPath("$.data.subject").exists());
        }
    }

    @Nested
    @DisplayName("PUT /api/v1/attendance/{attendanceId}")
    class RegularizeAttendance {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-ATT-007: Should allow ADMIN to regularize")
        void shouldAllowAdminRegularize() throws Exception {
            UUID attendanceId = UUID.randomUUID();
            String updateJson = """
                    {
                        "status": "PRESENT",
                        "reason": "Medical certificate submitted"
                    }
                    """;

            mockMvc.perform(put("/api/v1/attendance/{attendanceId}", attendanceId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(updateJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.regularized").value(true));
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should deny TEACHER from regularizing")
        void shouldDenyTeacherRegularize() throws Exception {
            UUID attendanceId = UUID.randomUUID();
            String updateJson = """
                    {
                        "status": "PRESENT",
                        "reason": "Test"
                    }
                    """;

            mockMvc.perform(put("/api/v1/attendance/{attendanceId}", attendanceId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(updateJson))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("Chronic Absentee Detection")
    class ChronicAbsenteeDetection {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-ATT-008: Should flag students with <75% attendance")
        void shouldFlagLowAttendance() throws Exception {
            mockMvc.perform(get("/api/v1/attendance/alerts/chronic-absentees"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].attendancePercentage").value(lessThan(75.0)));
        }
    }

    @Nested
    @DisplayName("Date Validation")
    class DateValidation {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should reject future dates")
        void shouldRejectFutureDates() throws Exception {
            String attendanceJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "date": "2027-01-28",
                        "entries": []
                    }
                    """;

            mockMvc.perform(post("/api/v1/attendance")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(attendanceJson))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.message").value(
                            containsString("future date")));
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should reject dates >7 days old")
        void shouldRejectOldDates() throws Exception {
            String attendanceJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "date": "2025-01-01",
                        "entries": []
                    }
                    """;

            mockMvc.perform(post("/api/v1/attendance")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(attendanceJson))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("Holiday Handling")
    class HolidayHandling {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should reject attendance on holidays")
        void shouldRejectOnHolidays() throws Exception {
            String attendanceJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "date": "2026-01-26",
                        "entries": []
                    }
                    """;

            // Assuming Jan 26 is Republic Day
            mockMvc.perform(post("/api/v1/attendance")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(attendanceJson))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.message").value(
                            containsString("holiday")));
        }
    }
}
