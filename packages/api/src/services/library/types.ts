export interface Book {
    id: string;
    isbn: string;
    title: string;
    author: string;
    publisher: string;
    category: string;
    language: string;
    edition: string;
    year: number;
    totalCopies: number;
    availableCopies: number;
    location: string;
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