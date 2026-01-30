package com.schoolsis.timetable.api.v1;

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
 * Unit tests for TimetableController endpoints.
 */
@WebMvcTest(TimetableController.class)
@DisplayName("Timetable Controller Tests")
class TimetableControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Nested
    @DisplayName("POST /api/v1/timetable")
    class CreateTimetable {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-TT-001: Should create timetable")
        void shouldCreateTimetable() throws Exception {
            String timetableJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "academicYear": "2026-27",
                        "entries": [
                            {"day": "MONDAY", "period": 1, "subjectId": "s1", "teacherId": "t1", "room": "101"},
                            {"day": "MONDAY", "period": 2, "subjectId": "s2", "teacherId": "t2", "room": "102"},
                            {"day": "TUESDAY", "period": 1, "subjectId": "s3", "teacherId": "t3", "room": "103"}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/timetable")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(timetableJson))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.id").exists());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/timetable/class/{classId}")
    class GetClassTimetable {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-TT-002: Should return class timetable")
        void shouldReturnClassTimetable() throws Exception {
            UUID classId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/timetable/class/{classId}", classId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.className").exists())
                    .andExpect(jsonPath("$.data.schedule.MONDAY").isArray())
                    .andExpect(jsonPath("$.data.schedule.TUESDAY").isArray())
                    .andExpect(jsonPath("$.data.schedule.WEDNESDAY").isArray())
                    .andExpect(jsonPath("$.data.schedule.THURSDAY").isArray())
                    .andExpect(jsonPath("$.data.schedule.FRIDAY").isArray());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/timetable/teacher/{teacherId}")
    class GetTeacherTimetable {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-TT-003: Should return teacher timetable")
        void shouldReturnTeacherTimetable() throws Exception {
            UUID teacherId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/timetable/teacher/{teacherId}", teacherId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.teacherName").exists())
                    .andExpect(jsonPath("$.data.schedule").exists())
                    .andExpect(jsonPath("$.data.totalPeriods").isNumber());
        }
    }

    @Nested
    @DisplayName("Conflict Detection")
    class ConflictDetection {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-TT-004: Should detect teacher conflict")
        void shouldDetectTeacherConflict() throws Exception {
            // Teacher already assigned to another class at same time
            String timetableJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "academicYear": "2026-27",
                        "entries": [
                            {"day": "MONDAY", "period": 1, "subjectId": "s1", "teacherId": "already-assigned-teacher"}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/timetable")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(timetableJson))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.message").value(containsString("conflict")))
                    .andExpect(jsonPath("$.error.conflicts").isArray());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should detect room conflict")
        void shouldDetectRoomConflict() throws Exception {
            String timetableJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "academicYear": "2026-27",
                        "entries": [
                            {"day": "MONDAY", "period": 1, "subjectId": "s1", "teacherId": "t1", "room": "occupied-room"}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/timetable")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(timetableJson))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error.conflicts[0].type").value("ROOM"));
        }
    }

    @Nested
    @DisplayName("POST /api/v1/timetable/substitute")
    class SubstituteTeacher {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-TT-005: Should assign substitute teacher")
        void shouldAssignSubstitute() throws Exception {
            String substituteJson = """
                    {
                        "periodId": "550e8400-e29b-41d4-a716-446655440000",
                        "date": "2026-01-28",
                        "substituteTeacherId": "660e8400-e29b-41d4-a716-446655440000",
                        "reason": "Original teacher on leave"
                    }
                    """;

            mockMvc.perform(post("/api/v1/timetable/substitute")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(substituteJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.substitutionId").exists())
                    .andExpect(jsonPath("$.data.substituteTeacher").exists());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should notify teachers about substitution")
        void shouldNotifyTeachers() throws Exception {
            String substituteJson = """
                    {
                        "periodId": "550e8400-e29b-41d4-a716-446655440000",
                        "date": "2026-01-28",
                        "substituteTeacherId": "660e8400-e29b-41d4-a716-446655440000",
                        "reason": "Medical emergency"
                    }
                    """;

            mockMvc.perform(post("/api/v1/timetable/substitute")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(substituteJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.notificationSent").value(true));
        }
    }

    @Nested
    @DisplayName("Period Configuration")
    class PeriodConfiguration {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should configure period timings")
        void shouldConfigurePeriodTimings() throws Exception {
            String configJson = """
                    {
                        "periods": [
                            {"number": 1, "startTime": "08:00", "endTime": "08:45"},
                            {"number": 2, "startTime": "08:45", "endTime": "09:30"},
                            {"number": 3, "startTime": "09:45", "endTime": "10:30"},
                            {"number": 4, "startTime": "10:30", "endTime": "11:15"},
                            {"number": 5, "startTime": "11:30", "endTime": "12:15"},
                            {"number": 6, "startTime": "12:15", "endTime": "13:00"},
                            {"number": 7, "startTime": "13:45", "endTime": "14:30"},
                            {"number": 8, "startTime": "14:30", "endTime": "15:15"}
                        ],
                        "breaks": [
                            {"afterPeriod": 2, "duration": 15, "name": "Short Break"},
                            {"afterPeriod": 4, "duration": 15, "name": "Short Break"},
                            {"afterPeriod": 6, "duration": 45, "name": "Lunch Break"}
                        ]
                    }
                    """;

            mockMvc.perform(put("/api/v1/timetable/config/periods")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(configJson))
                    .andExpect(status().isOk());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should return period configuration")
        void shouldReturnPeriodConfig() throws Exception {
            mockMvc.perform(get("/api/v1/timetable/config/periods"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.periods").isArray())
                    .andExpect(jsonPath("$.data.breaks").isArray());
        }
    }

    @Nested
    @DisplayName("Today's Schedule")
    class TodaysSchedule {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should return today's schedule for teacher")
        void shouldReturnTodaysSchedule() throws Exception {
            mockMvc.perform(get("/api/v1/timetable/today"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.date").exists())
                    .andExpect(jsonPath("$.data.day").exists())
                    .andExpect(jsonPath("$.data.periods").isArray())
                    .andExpect(jsonPath("$.data.currentPeriod").exists())
                    .andExpect(jsonPath("$.data.nextPeriod").exists());
        }
    }

    @Nested
    @DisplayName("Free Periods")
    class FreePeriods {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should return free periods for substitution")
        void shouldReturnFreePeriods() throws Exception {
            mockMvc.perform(get("/api/v1/timetable/free-periods")
                    .param("day", "MONDAY")
                    .param("period", "3"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].teacherId").exists())
                    .andExpect(jsonPath("$.data[0].teacherName").exists());
        }
    }

    @Nested
    @DisplayName("Timetable Update")
    class TimetableUpdate {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should update timetable entry")
        void shouldUpdateEntry() throws Exception {
            UUID entryId = UUID.randomUUID();
            String updateJson = """
                    {
                        "teacherId": "660e8400-e29b-41d4-a716-446655440000",
                        "room": "201"
                    }
                    """;

            mockMvc.perform(put("/api/v1/timetable/entries/{entryId}", entryId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(updateJson))
                    .andExpect(status().isOk());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should delete timetable entry")
        void shouldDeleteEntry() throws Exception {
            UUID entryId = UUID.randomUUID();

            mockMvc.perform(delete("/api/v1/timetable/entries/{entryId}", entryId))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("Subject Load")
    class SubjectLoad {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should verify subject periods per week")
        void shouldVerifySubjectLoad() throws Exception {
            UUID classId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/timetable/class/{classId}/subject-load", classId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].subjectName").exists())
                    .andExpect(jsonPath("$.data[0].periodsPerWeek").isNumber())
                    .andExpect(jsonPath("$.data[0].requiredPeriods").isNumber());
        }
    }
}
