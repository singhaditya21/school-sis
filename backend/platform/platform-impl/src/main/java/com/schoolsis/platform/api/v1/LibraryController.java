package com.schoolsis.platform.api.v1;

import com.schoolsis.common.api.ApiResponse;
import com.schoolsis.platform.domain.library.Book;
import com.schoolsis.platform.domain.library.BookIssue;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST Controller for Library Management operations.
 * Handles book catalog, issue/return, and fine calculations.
 */
@RestController
@RequestMapping("/api/v1/library")
@PreAuthorize("hasAnyRole('ADMIN', 'SUPER_ADMIN', 'TEACHER', 'LIBRARIAN')")
public class LibraryController {

    // ===== Request/Response Records =====

    record BookResponse(
            UUID id,
            String isbn,
            String title,
            String author,
            String publisher,
            String category,
            String edition,
            int year,
            int totalCopies,
            int availableCopies,
            String location,
            String description) {
    }

    record BookIssueResponse(
            UUID id,
            UUID bookId,
            String bookTitle,
            String bookAuthor,
            UUID studentId,
            String studentName,
            String studentClass,
            LocalDate issueDate,
            LocalDate dueDate,
            LocalDate returnDate,
            String status,
            BigDecimal fineAmount,
            boolean finePaid) {
    }

    record LibraryStatsResponse(
            int totalBooks,
            int totalCopies,
            int availableCopies,
            int issuedToday,
            int returnedToday,
            int overdueBooks,
            BigDecimal totalFinesPending) {
    }

    record IssueBookRequest(
            UUID bookId,
            UUID studentId,
            int loanDays) {
    }

    record ReturnBookRequest(
            UUID issueId,
            boolean payFine) {
    }

    record RenewBookRequest(
            UUID issueId,
            int additionalDays) {
    }

    // ===== Book Catalog Endpoints =====

    /**
     * Get all books with optional filtering
     */
    @GetMapping("/books")
    public ApiResponse<List<BookResponse>> getAllBooks(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String search) {
        // TODO: Fetch from database with filters
        // Mock data for now
        List<BookResponse> books = List.of(
                new BookResponse(UUID.randomUUID(), "978-0-13-468599-1", "Mathematics for Class 10",
                        "R.D. Sharma", "Dhanpat Rai Publications", "TEXTBOOK", "2025", 2025, 50, 42, "A-1-01", null),
                new BookResponse(UUID.randomUUID(), "978-0-07-136091-5", "Science for Class 10 (NCERT)",
                        "NCERT", "NCERT", "TEXTBOOK", "2024", 2024, 60, 55, "A-1-02", null),
                new BookResponse(UUID.randomUUID(), "978-81-7156-078-8", "English Grammar & Composition",
                        "Wren & Martin", "S. Chand", "REFERENCE", "2023", 2023, 30, 25, "A-2-01", null),
                new BookResponse(UUID.randomUUID(), "978-0-14-028329-7", "The God of Small Things",
                        "Arundhati Roy", "Penguin", "FICTION", "2017", 2017, 10, 8, "B-1-01", null),
                new BookResponse(UUID.randomUUID(), "978-81-291-1331-9", "Wings of Fire",
                        "A.P.J. Abdul Kalam", "Universities Press", "NON_FICTION", "2013", 2013, 15, 12, "B-1-02",
                        null),
                new BookResponse(UUID.randomUUID(), "978-93-5290-456-7", "Computer Science with Python",
                        "Sumita Arora", "Dhanpat Rai", "TEXTBOOK", "2025", 2025, 40, 35, "A-3-01", null),
                new BookResponse(UUID.randomUUID(), "978-81-7319-892-5", "Physics for Class 12 (HC Verma)",
                        "H.C. Verma", "Bharati Bhawan", "REFERENCE", "2022", 2022, 25, 20, "A-3-02", null),
                new BookResponse(UUID.randomUUID(), "978-0-06-112008-4", "To Kill a Mockingbird",
                        "Harper Lee", "HarperCollins", "FICTION", "2015", 2015, 8, 6, "B-2-01", null));

        return ApiResponse.ok(books);
    }

    /**
     * Get a single book by ID
     */
    @GetMapping("/books/{id}")
    public ApiResponse<BookResponse> getBookById(@PathVariable UUID id) {
        // TODO: Fetch from database
        BookResponse book = new BookResponse(
                id, "978-0-13-468599-1", "Mathematics for Class 10",
                "R.D. Sharma", "Dhanpat Rai Publications", "TEXTBOOK",
                "2025", 2025, 50, 42, "A-1-01", "Comprehensive mathematics textbook for Class 10");
        return ApiResponse.ok(book);
    }

    /**
     * Add a new book to catalog
     */
    @PostMapping("/books")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPER_ADMIN', 'LIBRARIAN')")
    public ApiResponse<BookResponse> addBook(@RequestBody Book book) {
        // TODO: Save to database
        BookResponse created = new BookResponse(
                UUID.randomUUID(), book.getIsbn(), book.getTitle(),
                book.getAuthor(), book.getPublisher(), book.getCategory().toString(),
                book.getEdition(), book.getPublicationYear(), book.getTotalCopies(),
                book.getAvailableCopies(), book.getLocation(), book.getDescription());
        return ApiResponse.ok(created);
    }

    // ===== Book Issue/Return Endpoints =====

    /**
     * Get all active issues (books currently issued)
     */
    @GetMapping("/issues")
    public ApiResponse<List<BookIssueResponse>> getActiveIssues() {
        // TODO: Fetch from database
        List<BookIssueResponse> issues = List.of(
                new BookIssueResponse(
                        UUID.randomUUID(), UUID.randomUUID(), "Mathematics for Class 10", "R.D. Sharma",
                        UUID.randomUUID(), "Aarav Sharma", "10-A",
                        LocalDate.of(2026, 1, 10), LocalDate.of(2026, 1, 24), null,
                        "ISSUED", BigDecimal.ZERO, false),
                new BookIssueResponse(
                        UUID.randomUUID(), UUID.randomUUID(), "The God of Small Things", "Arundhati Roy",
                        UUID.randomUUID(), "Priya Patel", "12-B",
                        LocalDate.of(2026, 1, 8), LocalDate.of(2026, 1, 22), null,
                        "OVERDUE", new BigDecimal("12"), false),
                new BookIssueResponse(
                        UUID.randomUUID(), UUID.randomUUID(), "Wings of Fire", "A.P.J. Abdul Kalam",
                        UUID.randomUUID(), "Arjun Singh", "11-A",
                        LocalDate.of(2026, 1, 15), LocalDate.of(2026, 1, 29), null,
                        "ISSUED", BigDecimal.ZERO, false),
                new BookIssueResponse(
                        UUID.randomUUID(), UUID.randomUUID(), "Computer Science with Python", "Sumita Arora",
                        UUID.randomUUID(), "Vivaan Reddy", "11-B",
                        LocalDate.of(2026, 1, 5), LocalDate.of(2026, 1, 19), null,
                        "OVERDUE", new BigDecimal("18"), false));
        return ApiResponse.ok(issues);
    }

    /**
     * Get issue history (including returned books)
     */
    @GetMapping("/issues/history")
    public ApiResponse<List<BookIssueResponse>> getIssueHistory(
            @RequestParam(required = false) UUID studentId,
            @RequestParam(required = false) UUID bookId) {
        // TODO: Fetch from database with filters
        List<BookIssueResponse> history = List.of(
                new BookIssueResponse(
                        UUID.randomUUID(), UUID.randomUUID(), "English Grammar & Composition", "Wren & Martin",
                        UUID.randomUUID(), "Ananya Gupta", "9-C",
                        LocalDate.of(2025, 12, 20), LocalDate.of(2026, 1, 3), LocalDate.of(2026, 1, 5),
                        "RETURNED", new BigDecimal("4"), true),
                new BookIssueResponse(
                        UUID.randomUUID(), UUID.randomUUID(), "To Kill a Mockingbird", "Harper Lee",
                        UUID.randomUUID(), "Kavya Nair", "11-C",
                        LocalDate.of(2025, 12, 28), LocalDate.of(2026, 1, 11), LocalDate.of(2026, 1, 10),
                        "RETURNED", BigDecimal.ZERO, false));
        return ApiResponse.ok(history);
    }

    /**
     * Issue a book to a student
     */
    @PostMapping("/issues")
    public ApiResponse<BookIssueResponse> issueBook(@RequestBody IssueBookRequest request) {
        // TODO: Validate book availability
        // TODO: Check student borrowing limit
        // TODO: Create issue record in database
        // TODO: Update available copies

        LocalDate issueDate = LocalDate.now();
        LocalDate dueDate = issueDate.plusDays(request.loanDays() > 0 ? request.loanDays() : 14);

        BookIssueResponse issue = new BookIssueResponse(
                UUID.randomUUID(), request.bookId(), "Book Title", "Author Name",
                request.studentId(), "Student Name", "Class",
                issueDate, dueDate, null,
                "ISSUED", BigDecimal.ZERO, false);

        return ApiResponse.ok(issue);
    }

    /**
     * Return a book
     */
    @PostMapping("/returns")
    public ApiResponse<Map<String, Object>> returnBook(@RequestBody ReturnBookRequest request) {
        // TODO: Fetch issue from database
        // TODO: Calculate fine if overdue
        // TODO: Update issue status to RETURNED
        // TODO: Update book available copies

        LocalDate returnDate = LocalDate.now();
        BigDecimal fine = new BigDecimal("0"); // Calculate based on overdue days

        Map<String, Object> result = Map.of(
                "issueId", request.issueId(),
                "returnDate", returnDate.toString(),
                "fineAmount", fine,
                "finePaid", request.payFine(),
                "status", "RETURNED",
                "message", "Book returned successfully");

        return ApiResponse.ok(result);
    }

    /**
     * Renew a book issue
     */
    @PostMapping("/renewals")
    public ApiResponse<BookIssueResponse> renewBook(@RequestBody RenewBookRequest request) {
        // TODO: Check if renewal is allowed (max renewals, no reservations)
        // TODO: Update due date

        LocalDate newDueDate = LocalDate.now().plusDays(request.additionalDays() > 0 ? request.additionalDays() : 14);

        BookIssueResponse renewed = new BookIssueResponse(
                request.issueId(), UUID.randomUUID(), "Book Title", "Author",
                UUID.randomUUID(), "Student Name", "Class",
                LocalDate.now().minusDays(7), newDueDate, null,
                "RENEWED", BigDecimal.ZERO, false);

        return ApiResponse.ok(renewed);
    }

    // ===== Statistics Endpoints =====

    /**
     * Get library statistics
     */
    @GetMapping("/stats")
    public ApiResponse<LibraryStatsResponse> getLibraryStats() {
        // TODO: Calculate real stats from database
        LibraryStatsResponse stats = new LibraryStatsResponse(
                12, // totalBooks (unique titles)
                365, // totalCopies
                319, // availableCopies
                3, // issuedToday
                1, // returnedToday
                2, // overdueBooks
                new BigDecimal("30") // totalFinesPending
        );
        return ApiResponse.ok(stats);
    }

    /**
     * Get overdue books
     */
    @GetMapping("/overdue")
    public ApiResponse<List<BookIssueResponse>> getOverdueBooks() {
        // TODO: Fetch overdue issues from database
        List<BookIssueResponse> overdue = List.of(
                new BookIssueResponse(
                        UUID.randomUUID(), UUID.randomUUID(), "The God of Small Things", "Arundhati Roy",
                        UUID.randomUUID(), "Priya Patel", "12-B",
                        LocalDate.of(2026, 1, 8), LocalDate.of(2026, 1, 22), null,
                        "OVERDUE", new BigDecimal("12"), false),
                new BookIssueResponse(
                        UUID.randomUUID(), UUID.randomUUID(), "Computer Science with Python", "Sumita Arora",
                        UUID.randomUUID(), "Vivaan Reddy", "11-B",
                        LocalDate.of(2026, 1, 5), LocalDate.of(2026, 1, 19), null,
                        "OVERDUE", new BigDecimal("18"), false));
        return ApiResponse.ok(overdue);
    }

    /**
     * Calculate fine for a specific issue
     */
    @GetMapping("/fines/{issueId}")
    public ApiResponse<Map<String, Object>> calculateFine(@PathVariable UUID issueId) {
        // TODO: Fetch issue from database
        // TODO: Calculate fine based on overdue days

        int overdueDays = 6;
        BigDecimal finePerDay = new BigDecimal("2");
        BigDecimal totalFine = finePerDay.multiply(BigDecimal.valueOf(overdueDays));

        return ApiResponse.ok(Map.of(
                "issueId", issueId,
                "overdueDays", overdueDays,
                "finePerDay", finePerDay,
                "totalFine", totalFine,
                "finePaid", false));
    }

    /**
     * Get student's borrowing history
     */
    @GetMapping("/students/{studentId}/history")
    public ApiResponse<List<BookIssueResponse>> getStudentHistory(@PathVariable UUID studentId) {
        // TODO: Fetch from database
        List<BookIssueResponse> history = List.of(
                new BookIssueResponse(
                        UUID.randomUUID(), UUID.randomUUID(), "Mathematics for Class 10", "R.D. Sharma",
                        studentId, "Student Name", "10-A",
                        LocalDate.of(2026, 1, 10), LocalDate.of(2026, 1, 24), null,
                        "ISSUED", BigDecimal.ZERO, false));
        return ApiResponse.ok(history);
    }
}
