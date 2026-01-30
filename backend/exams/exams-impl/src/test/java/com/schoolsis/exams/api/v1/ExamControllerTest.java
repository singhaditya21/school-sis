package com.schoolsis.exams.api.v1;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
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
 * Unit tests for ExamController endpoints.
 */
@WebMvcTest(ExamController.class)
@DisplayName("Exam Controller Tests")
class ExamControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Nested
    @DisplayName("POST /api/v1/exams")
    class CreateExam {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-EXAM-001: Should create exam")
        void shouldCreateExam() throws Exception {
            String examJson = """
                    {
                        "name": "Mid-Term Examination 2026",
                        "type": "MID_TERM",
                        "classIds": [
                            "550e8400-e29b-41d4-a716-446655440000",
                            "660e8400-e29b-41d4-a716-446655440000"
                        ],
                        "startDate": "2026-03-15",
                        "endDate": "2026-03-25",
                        "subjects": [
                            {"subjectId": "s1", "date": "2026-03-15", "maxMarks": 100},
                            {"subjectId": "s2", "date": "2026-03-17", "maxMarks": 100}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/exams")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(examJson))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.id").exists())
                    .andExpect(jsonPath("$.data.name").value("Mid-Term Examination 2026"));
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should deny TEACHER from creating exams")
        void shouldDenyTeacher() throws Exception {
            String examJson = """
                    {
                        "name": "Test Exam",
                        "type": "UNIT_TEST",
                        "classIds": ["550e8400-e29b-41d4-a716-446655440000"],
                        "startDate": "2026-03-01",
                        "endDate": "2026-03-01"
                    }
                    """;

            mockMvc.perform(post("/api/v1/exams")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(examJson))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/exams/{examId}/schedule")
    class GetExamSchedule {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-EXAM-002: Should return exam schedule")
        void shouldReturnExamSchedule() throws Exception {
            UUID examId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/exams/{examId}/schedule", examId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.examName").exists())
                    .andExpect(jsonPath("$.data.schedule").isArray())
                    .andExpect(jsonPath("$.data.schedule[0].date").exists())
                    .andExpect(jsonPath("$.data.schedule[0].subject").exists())
                    .andExpect(jsonPath("$.data.schedule[0].maxMarks").isNumber());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/exams/{examId}/marks")
    class EnterMarks {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-EXAM-003: Should enter marks")
        void shouldEnterMarks() throws Exception {
            UUID examId = UUID.randomUUID();
            String marksJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "subjectId": "660e8400-e29b-41d4-a716-446655440000",
                        "entries": [
                            {"studentId": "s1", "marks": 85},
                            {"studentId": "s2", "marks": 72},
                            {"studentId": "s3", "marks": 91}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/exams/{examId}/marks", examId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(marksJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.savedCount").value(3));
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-EXAM-004: Should reject marks exceeding maximum")
        void shouldRejectExcessMarks() throws Exception {
            UUID examId = UUID.randomUUID();
            String marksJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "subjectId": "660e8400-e29b-41d4-a716-446655440000",
                        "entries": [
                            {"studentId": "s1", "marks": 150}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/exams/{examId}/marks", examId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(marksJson))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.message").value(containsString("exceed")));
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should reject negative marks")
        void shouldRejectNegativeMarks() throws Exception {
            UUID examId = UUID.randomUUID();
            String marksJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "subjectId": "660e8400-e29b-41d4-a716-446655440000",
                        "entries": [
                            {"studentId": "s1", "marks": -5}
                        ]
                    }
                    """;

            mockMvc.perform(post("/api/v1/exams/{examId}/marks", examId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(marksJson))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/exams/{examId}/calculate")
    class CalculateResults {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-EXAM-005: Should calculate results")
        void shouldCalculateResults() throws Exception {
            UUID examId = UUID.randomUUID();

            mockMvc.perform(post("/api/v1/exams/{examId}/calculate", examId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.passCount").isNumber())
                    .andExpect(jsonPath("$.data.failCount").isNumber())
                    .andExpect(jsonPath("$.data.topperName").exists())
                    .andExpect(jsonPath("$.data.averageScore").isNumber());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/exams/{examId}/report-cards")
    class GenerateReportCards {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-EXAM-006: Should generate report cards")
        void shouldGenerateReportCards() throws Exception {
            UUID examId = UUID.randomUUID();
            String requestJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "format": "PDF"
                    }
                    """;

            mockMvc.perform(post("/api/v1/exams/{examId}/report-cards", examId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.downloadUrl").exists())
                    .andExpect(jsonPath("$.data.generatedCount").isNumber());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("Should support CBSE format")
        void shouldSupportCbseFormat() throws Exception {
            UUID examId = UUID.randomUUID();
            String requestJson = """
                    {
                        "classId": "550e8400-e29b-41d4-a716-446655440000",
                        "format": "CBSE"
                    }
                    """;

            mockMvc.perform(post("/api/v1/exams/{examId}/report-cards", examId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(requestJson))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/exams/{examId}/publish")
    class PublishResults {

        @Test
        @WithMockUser(roles = "PRINCIPAL")
        @DisplayName("TC-EXAM-007: Should publish results")
        void shouldPublishResults() throws Exception {
            UUID examId = UUID.randomUUID();

            mockMvc.perform(post("/api/v1/exams/{examId}/publish", examId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.published").value(true))
                    .andExpect(jsonPath("$.data.publishedAt").exists());
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should deny TEACHER from publishing")
        void shouldDenyTeacher() throws Exception {
            UUID examId = UUID.randomUUID();

            mockMvc.perform(post("/api/v1/exams/{examId}/publish", examId))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/exams/{examId}/results/{studentId}")
    class GetStudentResults {

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("Should return student results")
        void shouldReturnStudentResults() throws Exception {
            UUID examId = UUID.randomUUID();
            UUID studentId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/exams/{examId}/results/{studentId}", examId, studentId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.studentName").exists())
                    .andExpect(jsonPath("$.data.subjects").isArray())
                    .andExpect(jsonPath("$.data.totalMarks").isNumber())
                    .andExpect(jsonPath("$.data.percentage").isNumber())
                    .andExpect(jsonPath("$.data.grade").exists())
                    .andExpect(jsonPath("$.data.rank").isNumber());
        }
    }

    @Nested
    @DisplayName("CBSE Grading")
    class CbseGrading {

        @ParameterizedTest
        @CsvSource({
                "95, A1",
                "85, A2",
                "75, B1",
                "65, B2",
                "55, C1",
                "45, C2",
                "35, D",
                "25, E"
        })
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-GRADE-002: Should apply CBSE 9-point scale")
        void shouldApplyCbseGrading(int marks, String expectedGrade) throws Exception {
            // This test would verify that grade calculation returns correct CBSE grades
            mockMvc.perform(get("/api/v1/grading/calculate")
                    .param("marks", String.valueOf(marks))
                    .param("maxMarks", "100")
                    .param("scheme", "CBSE"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.grade").value(expectedGrade));
        }
    }

    @Nested
    @DisplayName("Exam Listing")
    class ExamListing {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should list exams by academic year")
        void shouldListExamsByYear() throws Exception {
            mockMvc.perform(get("/api/v1/exams")
                    .param("academicYear", "2026-27"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data").isArray());
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should filter by exam type")
        void shouldFilterByType() throws Exception {
            mockMvc.perform(get("/api/v1/exams")
                    .param("type", "FINAL"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data[*].type").value(everyItem(is("FINAL"))));
        }
    }

    @Nested
    @DisplayName("Class Statistics")
    class ClassStatistics {

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("Should return class statistics")
        void shouldReturnClassStats() throws Exception {
            UUID examId = UUID.randomUUID();
            UUID classId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/exams/{examId}/stats/{classId}", examId, classId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.average").isNumber())
                    .andExpect(jsonPath("$.data.highest").isNumber())
                    .andExpect(jsonPath("$.data.lowest").isNumber())
                    .andExpect(jsonPath("$.data.passPercentage").isNumber())
                    .andExpect(jsonPath("$.data.subjectWise").isArray());
        }
    }
}
