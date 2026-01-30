package com.schoolsis.platform.api.v1;

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
 * Unit tests for LibraryController endpoints.
 */
@WebMvcTest(LibraryController.class)
@DisplayName("Library Controller Tests")
class LibraryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Nested
    @DisplayName("GET /api/v1/library/books")
    class GetAllBooks {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-L005: Should return all books without filters")
        void shouldReturnAllBooks() throws Exception {
            mockMvc.perform(get("/api/v1/library/books"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].isbn").exists())
                    .andExpect(jsonPath("$.data[0].title").exists())
                    .andExpect(jsonPath("$.data[0].author").exists())
                    .andExpect(jsonPath("$.data[0].category").exists())
                    .andExpect(jsonPath("$.data[0].availableCopies").isNumber());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-L006: Should filter books by category")
        void shouldFilterByCategory() throws Exception {
            mockMvc.perform(get("/api/v1/library/books")
                    .param("category", "TEXTBOOK"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true));
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-L007: Should search books")
        void shouldSearchBooks() throws Exception {
            mockMvc.perform(get("/api/v1/library/books")
                    .param("search", "Mathematics"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true));
        }
    }

    @Nested
    @DisplayName("GET /api/v1/library/books/{id}")
    class GetBookById {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-L008: Should return book by ID")
        void shouldReturnBookById() throws Exception {
            UUID bookId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/library/books/{id}", bookId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.isbn").exists())
                    .andExpect(jsonPath("$.data.title").exists());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/library/books")
    class AddBook {

        @Test
        @WithMockUser(roles = "LIBRARIAN")
        @DisplayName("TC-L010: Should add new book")
        void shouldAddNewBook() throws Exception {
            String bookJson = """
                    {
                        "isbn": "978-1-234567-89-0",
                        "title": "New Test Book",
                        "author": "Test Author",
                        "publisher": "Test Publisher",
                        "category": "REFERENCE",
                        "publicationYear": 2026,
                        "totalCopies": 10,
                        "availableCopies": 10,
                        "location": "A-1-01"
                    }
                    """;

            mockMvc.perform(post("/api/v1/library/books")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(bookJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.isbn").value("978-1-234567-89-0"))
                    .andExpect(jsonPath("$.data.title").value("New Test Book"));
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-L028: Should restrict TEACHER from adding books")
        void shouldRestrictTeacherFromAddingBooks() throws Exception {
            String bookJson = """
                    {
                        "isbn": "978-1-234567-89-0",
                        "title": "Test",
                        "author": "Test",
                        "category": "REFERENCE",
                        "totalCopies": 10,
                        "availableCopies": 10
                    }
                    """;

            mockMvc.perform(post("/api/v1/library/books")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(bookJson))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/library/issues")
    class GetActiveIssues {

        @Test
        @WithMockUser(roles = "LIBRARIAN")
        @DisplayName("TC-L012: Should return active issues")
        void shouldReturnActiveIssues() throws Exception {
            mockMvc.perform(get("/api/v1/library/issues"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].bookId").exists())
                    .andExpect(jsonPath("$.data[0].studentId").exists())
                    .andExpect(jsonPath("$.data[0].issueDate").exists())
                    .andExpect(jsonPath("$.data[0].dueDate").exists())
                    .andExpect(jsonPath("$.data[0].status").exists());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/library/issues/history")
    class GetIssueHistory {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-L013: Should return issue history")
        void shouldReturnIssueHistory() throws Exception {
            mockMvc.perform(get("/api/v1/library/issues/history"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data").isArray());
        }

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-L014: Should filter history by student")
        void shouldFilterByStudent() throws Exception {
            UUID studentId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/library/issues/history")
                    .param("studentId", studentId.toString()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true));
        }
    }

    @Nested
    @DisplayName("POST /api/v1/library/issues")
    class IssueBook {

        @Test
        @WithMockUser(roles = "LIBRARIAN")
        @DisplayName("TC-L015: Should issue book successfully")
        void shouldIssueBookSuccessfully() throws Exception {
            String issueJson = """
                    {
                        "bookId": "550e8400-e29b-41d4-a716-446655440000",
                        "studentId": "660e8400-e29b-41d4-a716-446655440000",
                        "loanDays": 14
                    }
                    """;

            mockMvc.perform(post("/api/v1/library/issues")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(issueJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.status").value("ISSUED"))
                    .andExpect(jsonPath("$.data.issueDate").exists())
                    .andExpect(jsonPath("$.data.dueDate").exists());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/library/returns")
    class ReturnBook {

        @Test
        @WithMockUser(roles = "LIBRARIAN")
        @DisplayName("TC-L018: Should return book successfully")
        void shouldReturnBookSuccessfully() throws Exception {
            String returnJson = """
                    {
                        "issueId": "550e8400-e29b-41d4-a716-446655440000",
                        "payFine": false
                    }
                    """;

            mockMvc.perform(post("/api/v1/library/returns")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(returnJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.status").value("RETURNED"))
                    .andExpect(jsonPath("$.data.returnDate").exists());
        }
    }

    @Nested
    @DisplayName("POST /api/v1/library/renewals")
    class RenewBook {

        @Test
        @WithMockUser(roles = "LIBRARIAN")
        @DisplayName("TC-L020: Should renew book successfully")
        void shouldRenewBookSuccessfully() throws Exception {
            String renewJson = """
                    {
                        "issueId": "550e8400-e29b-41d4-a716-446655440000",
                        "additionalDays": 7
                    }
                    """;

            mockMvc.perform(post("/api/v1/library/renewals")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(renewJson))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.dueDate").exists());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/library/stats")
    class GetLibraryStats {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-L022: Should return library statistics")
        void shouldReturnLibraryStats() throws Exception {
            mockMvc.perform(get("/api/v1/library/stats"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.totalBooks").isNumber())
                    .andExpect(jsonPath("$.data.totalCopies").isNumber())
                    .andExpect(jsonPath("$.data.availableCopies").isNumber())
                    .andExpect(jsonPath("$.data.overdueBooks").isNumber())
                    .andExpect(jsonPath("$.data.totalFinesPending").isNumber());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/library/overdue")
    class GetOverdueBooks {

        @Test
        @WithMockUser(roles = "LIBRARIAN")
        @DisplayName("TC-L023: Should return overdue books")
        void shouldReturnOverdueBooks() throws Exception {
            mockMvc.perform(get("/api/v1/library/overdue"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data").isArray())
                    .andExpect(jsonPath("$.data[0].status").value("OVERDUE"));
        }
    }

    @Nested
    @DisplayName("GET /api/v1/library/fines/{issueId}")
    class CalculateFine {

        @Test
        @WithMockUser(roles = "LIBRARIAN")
        @DisplayName("TC-L024: Should calculate fine correctly")
        void shouldCalculateFine() throws Exception {
            UUID issueId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/library/fines/{issueId}", issueId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data.issueId").exists())
                    .andExpect(jsonPath("$.data.overdueDays").isNumber())
                    .andExpect(jsonPath("$.data.finePerDay").isNumber())
                    .andExpect(jsonPath("$.data.totalFine").isNumber());
        }
    }

    @Nested
    @DisplayName("GET /api/v1/library/students/{studentId}/history")
    class GetStudentHistory {

        @Test
        @WithMockUser(roles = "ADMIN")
        @DisplayName("TC-L025: Should return student borrowing history")
        void shouldReturnStudentHistory() throws Exception {
            UUID studentId = UUID.randomUUID();

            mockMvc.perform(get("/api/v1/library/students/{studentId}/history", studentId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.success").value(true))
                    .andExpect(jsonPath("$.data").isArray());
        }
    }

    @Nested
    @DisplayName("Role-Based Access Control")
    class RoleBasedAccess {

        @Test
        @WithMockUser(roles = "LIBRARIAN")
        @DisplayName("TC-L027: LIBRARIAN should have full access")
        void librarianShouldHaveFullAccess() throws Exception {
            mockMvc.perform(get("/api/v1/library/books"))
                    .andExpect(status().isOk());

            mockMvc.perform(get("/api/v1/library/issues"))
                    .andExpect(status().isOk());

            mockMvc.perform(get("/api/v1/library/stats"))
                    .andExpect(status().isOk());
        }

        @Test
        @WithMockUser(roles = "TEACHER")
        @DisplayName("TC-L028: TEACHER should have read access to books")
        void teacherShouldHaveReadAccess() throws Exception {
            mockMvc.perform(get("/api/v1/library/books"))
                    .andExpect(status().isOk());
        }

        @Test
        @DisplayName("Unauthenticated should be denied")
        void unauthenticatedShouldBeDenied() throws Exception {
            mockMvc.perform(get("/api/v1/library/books"))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        @WithMockUser(roles = "PARENT")
        @DisplayName("PARENT should be denied")
        void parentShouldBeDenied() throws Exception {
            mockMvc.perform(get("/api/v1/library/books"))
                    .andExpect(status().isForbidden());
        }
    }
}
