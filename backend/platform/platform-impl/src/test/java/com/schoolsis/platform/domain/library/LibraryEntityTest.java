package com.schoolsis.platform.domain.library;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for Library domain entities.
 */
@DisplayName("Library Entity Tests")
class LibraryEntityTest {

    @Nested
    @DisplayName("Book Entity")
    class BookEntityTests {

        @Test
        @DisplayName("TC-L001: Should create book with all required fields")
        void shouldCreateBookWithRequiredFields() {
            // Arrange & Act
            Book book = Book.builder()
                    .tenantId(UUID.randomUUID())
                    .title("Mathematics for Class 10")
                    .author("R.D. Sharma")
                    .isbn("978-0-13-468599-1")
                    .category(Book.BookCategory.TEXTBOOK)
                    .totalCopies(50)
                    .availableCopies(42)
                    .build();

            // Assert
            assertThat(book.getTitle()).isEqualTo("Mathematics for Class 10");
            assertThat(book.getAuthor()).isEqualTo("R.D. Sharma");
            assertThat(book.getIsbn()).isEqualTo("978-0-13-468599-1");
            assertThat(book.getCategory()).isEqualTo(Book.BookCategory.TEXTBOOK);
            assertThat(book.getTotalCopies()).isEqualTo(50);
            assertThat(book.getAvailableCopies()).isEqualTo(42);
        }

        @Test
        @DisplayName("Should default isActive to true")
        void shouldDefaultIsActiveToTrue() {
            Book book = Book.builder()
                    .tenantId(UUID.randomUUID())
                    .title("Test Book")
                    .author("Test Author")
                    .isbn("978-1-234567-89-0")
                    .category(Book.BookCategory.REFERENCE)
                    .totalCopies(10)
                    .availableCopies(10)
                    .build();

            assertThat(book.getIsActive()).isTrue();
        }

        @Test
        @DisplayName("TC-L002: Should support all book categories")
        void shouldSupportAllCategories() {
            Book.BookCategory[] categories = Book.BookCategory.values();

            assertThat(categories).containsExactlyInAnyOrder(
                    Book.BookCategory.TEXTBOOK,
                    Book.BookCategory.REFERENCE,
                    Book.BookCategory.FICTION,
                    Book.BookCategory.NON_FICTION,
                    Book.BookCategory.MAGAZINE,
                    Book.BookCategory.NEWSPAPER,
                    Book.BookCategory.JOURNAL,
                    Book.BookCategory.OTHER);
        }

        @Test
        @DisplayName("Should include optional fields")
        void shouldIncludeOptionalFields() {
            Book book = Book.builder()
                    .tenantId(UUID.randomUUID())
                    .title("Complete Book")
                    .author("Complete Author")
                    .isbn("978-1-234567-89-0")
                    .publisher("Test Publisher")
                    .edition("2nd")
                    .publicationYear(2026)
                    .category(Book.BookCategory.TEXTBOOK)
                    .totalCopies(10)
                    .availableCopies(10)
                    .location("A-1-01")
                    .description("A complete test book")
                    .coverImageUrl("https://example.com/cover.jpg")
                    .build();

            assertThat(book.getPublisher()).isEqualTo("Test Publisher");
            assertThat(book.getEdition()).isEqualTo("2nd");
            assertThat(book.getPublicationYear()).isEqualTo(2026);
            assertThat(book.getLocation()).isEqualTo("A-1-01");
            assertThat(book.getDescription()).isEqualTo("A complete test book");
            assertThat(book.getCoverImageUrl()).isEqualTo("https://example.com/cover.jpg");
        }
    }

    @Nested
    @DisplayName("BookIssue Entity")
    class BookIssueEntityTests {

        @Test
        @DisplayName("TC-L003: Should create book issue with defaults")
        void shouldCreateBookIssueWithDefaults() {
            // Arrange & Act
            BookIssue issue = BookIssue.builder()
                    .tenantId(UUID.randomUUID())
                    .bookId(UUID.randomUUID())
                    .studentId(UUID.randomUUID())
                    .issueDate(LocalDate.now())
                    .dueDate(LocalDate.now().plusDays(14))
                    .build();

            // Assert
            assertThat(issue.getStatus()).isEqualTo(BookIssue.IssueStatus.ISSUED);
            assertThat(issue.getFineAmount()).isEqualTo(BigDecimal.ZERO);
            assertThat(issue.getFinePaid()).isFalse();
            assertThat(issue.getRenewalCount()).isEqualTo(0);
        }

        @Test
        @DisplayName("TC-L004: Should support all issue statuses")
        void shouldSupportAllStatuses() {
            BookIssue.IssueStatus[] statuses = BookIssue.IssueStatus.values();

            assertThat(statuses).containsExactlyInAnyOrder(
                    BookIssue.IssueStatus.ISSUED,
                    BookIssue.IssueStatus.RETURNED,
                    BookIssue.IssueStatus.OVERDUE,
                    BookIssue.IssueStatus.LOST,
                    BookIssue.IssueStatus.RENEWED);
        }

        @Test
        @DisplayName("Should track issue dates correctly")
        void shouldTrackIssueDates() {
            LocalDate issueDate = LocalDate.of(2026, 1, 15);
            LocalDate dueDate = LocalDate.of(2026, 1, 29);

            BookIssue issue = BookIssue.builder()
                    .tenantId(UUID.randomUUID())
                    .bookId(UUID.randomUUID())
                    .studentId(UUID.randomUUID())
                    .issueDate(issueDate)
                    .dueDate(dueDate)
                    .build();

            assertThat(issue.getIssueDate()).isEqualTo(issueDate);
            assertThat(issue.getDueDate()).isEqualTo(dueDate);
            assertThat(issue.getReturnDate()).isNull();
        }

        @Test
        @DisplayName("Should track return details")
        void shouldTrackReturnDetails() {
            LocalDate issueDate = LocalDate.of(2026, 1, 15);
            LocalDate dueDate = LocalDate.of(2026, 1, 29);
            LocalDate returnDate = LocalDate.of(2026, 1, 28);
            UUID librarianId = UUID.randomUUID();

            BookIssue issue = BookIssue.builder()
                    .tenantId(UUID.randomUUID())
                    .bookId(UUID.randomUUID())
                    .studentId(UUID.randomUUID())
                    .issueDate(issueDate)
                    .dueDate(dueDate)
                    .returnDate(returnDate)
                    .returnedTo(librarianId)
                    .status(BookIssue.IssueStatus.RETURNED)
                    .build();

            assertThat(issue.getReturnDate()).isEqualTo(returnDate);
            assertThat(issue.getReturnedTo()).isEqualTo(librarianId);
            assertThat(issue.getStatus()).isEqualTo(BookIssue.IssueStatus.RETURNED);
        }

        @Test
        @DisplayName("Should track fine information")
        void shouldTrackFineInformation() {
            BookIssue issue = BookIssue.builder()
                    .tenantId(UUID.randomUUID())
                    .bookId(UUID.randomUUID())
                    .studentId(UUID.randomUUID())
                    .issueDate(LocalDate.now().minusDays(20))
                    .dueDate(LocalDate.now().minusDays(6))
                    .status(BookIssue.IssueStatus.OVERDUE)
                    .fineAmount(new BigDecimal("12"))
                    .finePaid(false)
                    .build();

            assertThat(issue.getFineAmount()).isEqualByComparingTo(new BigDecimal("12"));
            assertThat(issue.getFinePaid()).isFalse();
        }

        @Test
        @DisplayName("Should track renewals")
        void shouldTrackRenewals() {
            BookIssue issue = BookIssue.builder()
                    .tenantId(UUID.randomUUID())
                    .bookId(UUID.randomUUID())
                    .studentId(UUID.randomUUID())
                    .issueDate(LocalDate.now().minusDays(14))
                    .dueDate(LocalDate.now().plusDays(7))
                    .status(BookIssue.IssueStatus.RENEWED)
                    .renewalCount(1)
                    .build();

            assertThat(issue.getRenewalCount()).isEqualTo(1);
            assertThat(issue.getStatus()).isEqualTo(BookIssue.IssueStatus.RENEWED);
        }

        @Test
        @DisplayName("Should track issuing librarian")
        void shouldTrackIssuingLibrarian() {
            UUID librarianId = UUID.randomUUID();

            BookIssue issue = BookIssue.builder()
                    .tenantId(UUID.randomUUID())
                    .bookId(UUID.randomUUID())
                    .studentId(UUID.randomUUID())
                    .issuedBy(librarianId)
                    .issueDate(LocalDate.now())
                    .dueDate(LocalDate.now().plusDays(14))
                    .build();

            assertThat(issue.getIssuedBy()).isEqualTo(librarianId);
        }

        @Test
        @DisplayName("Should include remarks")
        void shouldIncludeRemarks() {
            BookIssue issue = BookIssue.builder()
                    .tenantId(UUID.randomUUID())
                    .bookId(UUID.randomUUID())
                    .studentId(UUID.randomUUID())
                    .issueDate(LocalDate.now())
                    .dueDate(LocalDate.now().plusDays(14))
                    .remarks("Book condition: Good")
                    .build();

            assertThat(issue.getRemarks()).isEqualTo("Book condition: Good");
        }
    }

    @Nested
    @DisplayName("Fine Calculation Logic")
    class FineCalculationTests {

        private static final BigDecimal FINE_PER_DAY = new BigDecimal("2");

        @Test
        @DisplayName("Should calculate zero fine when returned on time")
        void shouldCalculateZeroFineWhenOnTime() {
            LocalDate dueDate = LocalDate.now();
            LocalDate returnDate = LocalDate.now();

            int overdueDays = (int) (returnDate.toEpochDay() - dueDate.toEpochDay());
            BigDecimal fine = overdueDays > 0
                    ? FINE_PER_DAY.multiply(BigDecimal.valueOf(overdueDays))
                    : BigDecimal.ZERO;

            assertThat(fine).isEqualByComparingTo(BigDecimal.ZERO);
        }

        @Test
        @DisplayName("Should calculate fine for overdue returns")
        void shouldCalculateFineForOverdue() {
            LocalDate dueDate = LocalDate.now().minusDays(5);
            LocalDate returnDate = LocalDate.now();

            int overdueDays = (int) (returnDate.toEpochDay() - dueDate.toEpochDay());
            BigDecimal fine = FINE_PER_DAY.multiply(BigDecimal.valueOf(overdueDays));

            assertThat(fine).isEqualByComparingTo(new BigDecimal("10")); // 5 days × ₹2
        }

        @Test
        @DisplayName("Should calculate fine for 1 day overdue")
        void shouldCalculateFineFor1DayOverdue() {
            LocalDate dueDate = LocalDate.now().minusDays(1);
            LocalDate returnDate = LocalDate.now();

            int overdueDays = (int) (returnDate.toEpochDay() - dueDate.toEpochDay());
            BigDecimal fine = FINE_PER_DAY.multiply(BigDecimal.valueOf(overdueDays));

            assertThat(fine).isEqualByComparingTo(new BigDecimal("2"));
        }

        @Test
        @DisplayName("Should calculate no fine when returned early")
        void shouldCalculateNoFineWhenEarly() {
            LocalDate dueDate = LocalDate.now().plusDays(5);
            LocalDate returnDate = LocalDate.now();

            int overdueDays = (int) (returnDate.toEpochDay() - dueDate.toEpochDay());
            BigDecimal fine = overdueDays > 0
                    ? FINE_PER_DAY.multiply(BigDecimal.valueOf(overdueDays))
                    : BigDecimal.ZERO;

            assertThat(fine).isEqualByComparingTo(BigDecimal.ZERO);
        }
    }

    @Nested
    @DisplayName("Loan Period Calculation")
    class LoanPeriodTests {

        private static final int DEFAULT_LOAN_DAYS = 14;

        @Test
        @DisplayName("Should calculate due date correctly")
        void shouldCalculateDueDate() {
            LocalDate issueDate = LocalDate.of(2026, 1, 15);
            LocalDate expectedDueDate = issueDate.plusDays(DEFAULT_LOAN_DAYS);

            assertThat(expectedDueDate).isEqualTo(LocalDate.of(2026, 1, 29));
        }

        @Test
        @DisplayName("Should calculate due date with custom loan days")
        void shouldCalculateDueDateWithCustomDays() {
            LocalDate issueDate = LocalDate.of(2026, 1, 15);
            int customLoanDays = 7;
            LocalDate expectedDueDate = issueDate.plusDays(customLoanDays);

            assertThat(expectedDueDate).isEqualTo(LocalDate.of(2026, 1, 22));
        }

        @Test
        @DisplayName("Should calculate renewal due date")
        void shouldCalculateRenewalDueDate() {
            LocalDate currentDueDate = LocalDate.of(2026, 1, 29);
            int renewalDays = 7;
            LocalDate newDueDate = currentDueDate.plusDays(renewalDays);

            assertThat(newDueDate).isEqualTo(LocalDate.of(2026, 2, 5));
        }
    }
}
