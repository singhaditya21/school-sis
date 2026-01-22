/**
 * Library Management Service
 * Handles book catalog, issue/return, and fine calculations
 */

export interface Book {
    id: string;
    isbn: string;
    title: string;
    author: string;
    publisher: string;
    category: 'TEXTBOOK' | 'REFERENCE' | 'FICTION' | 'NON_FICTION' | 'MAGAZINE' | 'NEWSPAPER';
    language: string;
    edition: string;
    year: number;
    totalCopies: number;
    availableCopies: number;
    location: string; // Shelf location
    coverUrl?: string;
}

export interface BookIssue {
    id: string;
    bookId: string;
    bookTitle: string;
    studentId: string;
    studentName: string;
    studentClass: string;
    issueDate: string;
    dueDate: string;
    returnDate?: string;
    status: 'ISSUED' | 'RETURNED' | 'OVERDUE' | 'LOST';
    fineAmount: number;
    finePaid: boolean;
}

export interface LibraryStats {
    totalBooks: number;
    totalCopies: number;
    availableCopies: number;
    issuedToday: number;
    returnedToday: number;
    overdueBooks: number;
    totalFinesPending: number;
}

// Fine rate per day
const FINE_RATE_PER_DAY = 2; // ₹2 per day
const DEFAULT_LOAN_DAYS = 14;

/**
 * Calculate fine for overdue book
 */
export function calculateFine(dueDate: string, returnDate?: string): number {
    const due = new Date(dueDate);
    const returned = returnDate ? new Date(returnDate) : new Date();

    const diffTime = returned.getTime() - due.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 0;
    return diffDays * FINE_RATE_PER_DAY;
}

/**
 * Calculate due date from issue date
 */
export function calculateDueDate(issueDate: string, loanDays = DEFAULT_LOAN_DAYS): string {
    const issue = new Date(issueDate);
    issue.setDate(issue.getDate() + loanDays);
    return issue.toISOString().split('T')[0];
}

/**
 * Check if book is overdue
 */
export function isOverdue(dueDate: string): boolean {
    return new Date(dueDate) < new Date();
}

// Mock book catalog
export const mockBooks: Book[] = [
    { id: 'b1', isbn: '978-0-13-468599-1', title: 'Mathematics for Class 10', author: 'R.D. Sharma', publisher: 'Dhanpat Rai Publications', category: 'TEXTBOOK', language: 'English', edition: '2025', year: 2025, totalCopies: 50, availableCopies: 42, location: 'A-1-01' },
    { id: 'b2', isbn: '978-0-07-136091-5', title: 'Science for Class 10 (NCERT)', author: 'NCERT', publisher: 'NCERT', category: 'TEXTBOOK', language: 'English', edition: '2024', year: 2024, totalCopies: 60, availableCopies: 55, location: 'A-1-02' },
    { id: 'b3', isbn: '978-81-7156-078-8', title: 'English Grammar & Composition', author: 'Wren & Martin', publisher: 'S. Chand', category: 'REFERENCE', language: 'English', edition: '2023', year: 2023, totalCopies: 30, availableCopies: 25, location: 'A-2-01' },
    { id: 'b4', isbn: '978-93-5300-123-4', title: 'Hindi Vyakaran', author: 'Dr. Hardev Bahri', publisher: 'Arihant', category: 'TEXTBOOK', language: 'Hindi', edition: '2024', year: 2024, totalCopies: 45, availableCopies: 40, location: 'A-2-02' },
    { id: 'b5', isbn: '978-0-14-028329-7', title: 'The God of Small Things', author: 'Arundhati Roy', publisher: 'Penguin', category: 'FICTION', language: 'English', edition: '2017', year: 2017, totalCopies: 10, availableCopies: 8, location: 'B-1-01' },
    { id: 'b6', isbn: '978-81-291-1331-9', title: 'Wings of Fire', author: 'A.P.J. Abdul Kalam', publisher: 'Universities Press', category: 'NON_FICTION', language: 'English', edition: '2013', year: 2013, totalCopies: 15, availableCopies: 12, location: 'B-1-02' },
    { id: 'b7', isbn: '978-0-19-861189-4', title: 'Oxford Advanced Learners Dictionary', author: 'A.S. Hornby', publisher: 'Oxford', category: 'REFERENCE', language: 'English', edition: '2020', year: 2020, totalCopies: 20, availableCopies: 18, location: 'C-1-01' },
    { id: 'b8', isbn: '978-93-5290-456-7', title: 'Computer Science with Python', author: 'Sumita Arora', publisher: 'Dhanpat Rai', category: 'TEXTBOOK', language: 'English', edition: '2025', year: 2025, totalCopies: 40, availableCopies: 35, location: 'A-3-01' },
    { id: 'b9', isbn: '978-81-7319-892-5', title: 'Physics for Class 12 (HC Verma)', author: 'H.C. Verma', publisher: 'Bharati Bhawan', category: 'REFERENCE', language: 'English', edition: '2022', year: 2022, totalCopies: 25, availableCopies: 20, location: 'A-3-02' },
    { id: 'b10', isbn: '978-0-06-112008-4', title: 'To Kill a Mockingbird', author: 'Harper Lee', publisher: 'HarperCollins', category: 'FICTION', language: 'English', edition: '2015', year: 2015, totalCopies: 8, availableCopies: 6, location: 'B-2-01' },
    { id: 'b11', isbn: '978-81-89920-76-8', title: 'History of Modern India', author: 'Bipan Chandra', publisher: 'Orient Blackswan', category: 'REFERENCE', language: 'English', edition: '2020', year: 2020, totalCopies: 12, availableCopies: 10, location: 'C-2-01' },
    { id: 'b12', isbn: '978-93-8655-234-1', title: 'Biology for Class 11 (NCERT)', author: 'NCERT', publisher: 'NCERT', category: 'TEXTBOOK', language: 'English', edition: '2024', year: 2024, totalCopies: 55, availableCopies: 48, location: 'A-4-01' },
];

// Mock issued books
export const mockIssues: BookIssue[] = [
    { id: 'i1', bookId: 'b1', bookTitle: 'Mathematics for Class 10', studentId: 's1', studentName: 'Aarav Sharma', studentClass: '10-A', issueDate: '2026-01-10', dueDate: '2026-01-24', status: 'ISSUED', fineAmount: 0, finePaid: false },
    { id: 'i2', bookId: 'b5', bookTitle: 'The God of Small Things', studentId: 's2', studentName: 'Priya Patel', studentClass: '12-B', issueDate: '2026-01-08', dueDate: '2026-01-22', status: 'OVERDUE', fineAmount: 0, finePaid: false },
    { id: 'i3', bookId: 'b6', bookTitle: 'Wings of Fire', studentId: 's3', studentName: 'Arjun Singh', studentClass: '11-A', issueDate: '2026-01-15', dueDate: '2026-01-29', status: 'ISSUED', fineAmount: 0, finePaid: false },
    { id: 'i4', bookId: 'b3', bookTitle: 'English Grammar & Composition', studentId: 's4', studentName: 'Ananya Gupta', studentClass: '9-C', issueDate: '2025-12-20', dueDate: '2026-01-03', returnDate: '2026-01-05', status: 'RETURNED', fineAmount: 4, finePaid: true },
    { id: 'i5', bookId: 'b8', bookTitle: 'Computer Science with Python', studentId: 's5', studentName: 'Vivaan Reddy', studentClass: '11-B', issueDate: '2026-01-05', dueDate: '2026-01-19', status: 'OVERDUE', fineAmount: 6, finePaid: false },
    { id: 'i6', bookId: 'b9', bookTitle: 'Physics for Class 12 (HC Verma)', studentId: 's6', studentName: 'Saanvi Jain', studentClass: '12-A', issueDate: '2026-01-12', dueDate: '2026-01-26', status: 'ISSUED', fineAmount: 0, finePaid: false },
    { id: 'i7', bookId: 'b2', bookTitle: 'Science for Class 10 (NCERT)', studentId: 's7', studentName: 'Krishna Menon', studentClass: '10-B', issueDate: '2026-01-18', dueDate: '2026-02-01', status: 'ISSUED', fineAmount: 0, finePaid: false },
    { id: 'i8', bookId: 'b10', bookTitle: 'To Kill a Mockingbird', studentId: 's8', studentName: 'Kavya Nair', studentClass: '11-C', issueDate: '2025-12-28', dueDate: '2026-01-11', returnDate: '2026-01-10', status: 'RETURNED', fineAmount: 0, finePaid: false },
];

/**
 * Get library statistics
 */
export function getLibraryStats(): LibraryStats {
    const today = new Date().toISOString().split('T')[0];

    return {
        totalBooks: mockBooks.length,
        totalCopies: mockBooks.reduce((sum, b) => sum + b.totalCopies, 0),
        availableCopies: mockBooks.reduce((sum, b) => sum + b.availableCopies, 0),
        issuedToday: mockIssues.filter(i => i.issueDate === today).length,
        returnedToday: mockIssues.filter(i => i.returnDate === today).length,
        overdueBooks: mockIssues.filter(i => i.status === 'OVERDUE' || (i.status === 'ISSUED' && isOverdue(i.dueDate))).length,
        totalFinesPending: mockIssues.filter(i => !i.finePaid && i.fineAmount > 0).reduce((sum, i) => sum + i.fineAmount, 0),
    };
}

/**
 * Get books by category
 */
export function getBooksByCategory(category?: Book['category']): Book[] {
    if (!category) return mockBooks;
    return mockBooks.filter(b => b.category === category);
}

/**
 * Search books
 */
export function searchBooks(query: string): Book[] {
    const lowerQuery = query.toLowerCase();
    return mockBooks.filter(b =>
        b.title.toLowerCase().includes(lowerQuery) ||
        b.author.toLowerCase().includes(lowerQuery) ||
        b.isbn.includes(query)
    );
}

/**
 * Get student borrowing history
 */
export function getStudentBorrowingHistory(studentId: string): BookIssue[] {
    return mockIssues.filter(i => i.studentId === studentId);
}

/**
 * Get overdue books
 */
export function getOverdueBooks(): BookIssue[] {
    return mockIssues.filter(i => {
        if (i.status === 'RETURNED') return false;
        return isOverdue(i.dueDate);
    }).map(i => ({
        ...i,
        fineAmount: calculateFine(i.dueDate),
        status: 'OVERDUE' as const,
    }));
}
