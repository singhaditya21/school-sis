// Library Management Service — Production (Real DB)
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export interface Book { id: string; isbn: string; title: string; author: string; publisher: string; category: string; language: string; edition: string; year: number; totalCopies: number; availableCopies: number; location: string; }
export interface BookIssue { id: string; bookId: string; bookTitle: string; studentId: string; studentName: string; studentClass: string; issueDate: string; dueDate: string; returnDate?: string; status: 'ISSUED' | 'RETURNED' | 'OVERDUE' | 'LOST'; fineAmount: number; finePaid: boolean; }

export const LibraryService = {
    async getDashboardStats(tenantId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`SELECT (SELECT COUNT(*) FROM books WHERE tenant_id=${tenantId}) AS "totalBooks", (SELECT SUM(total_copies) FROM books WHERE tenant_id=${tenantId}) AS "totalCopies", (SELECT SUM(available_copies) FROM books WHERE tenant_id=${tenantId}) AS "availableCopies", (SELECT COUNT(*) FROM book_issues WHERE tenant_id=${tenantId} AND issue_date=CURRENT_DATE) AS "issuedToday", (SELECT COUNT(*) FROM book_issues WHERE tenant_id=${tenantId} AND return_date=CURRENT_DATE) AS "returnedToday", (SELECT COUNT(*) FROM book_issues WHERE tenant_id=${tenantId} AND status='OVERDUE') AS "overdueBooks", (SELECT COALESCE(SUM(fine_amount),0) FROM book_issues WHERE tenant_id=${tenantId} AND fine_paid=false AND fine_amount>0) AS "totalFinesPending"`) as any[];
        return { totalBooks: Number(s?.totalBooks||0), totalCopies: Number(s?.totalCopies||0), availableCopies: Number(s?.availableCopies||0), issuedToday: Number(s?.issuedToday||0), returnedToday: Number(s?.returnedToday||0), overdueBooks: Number(s?.overdueBooks||0), totalFinesPending: Number(s?.totalFinesPending||0) };
    },
    async getBooks(tenantId: string, category?: string): Promise<Book[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT id,isbn,title,author,publisher,category,language,edition,year,total_copies AS "totalCopies",available_copies AS "availableCopies",location FROM books WHERE tenant_id=${tenantId} ${category?sql`AND category=${category}`:sql``} ORDER BY title LIMIT 200`);
        return rows as Book[];
    },
    async searchBooks(tenantId: string, query: string): Promise<Book[]> {
        await setTenantContext(tenantId);
        const q = `%${query}%`;
        const rows = await db.execute(sql`SELECT id,isbn,title,author,publisher,category,language,edition,year,total_copies AS "totalCopies",available_copies AS "availableCopies",location FROM books WHERE tenant_id=${tenantId} AND (title ILIKE ${q} OR author ILIKE ${q} OR isbn ILIKE ${q}) ORDER BY title LIMIT 50`);
        return rows as Book[];
    },
    async getStudentIssues(tenantId: string, studentId: string): Promise<BookIssue[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT bi.id,bi.book_id AS "bookId",b.title AS "bookTitle",bi.student_id AS "studentId",s.first_name||' '||s.last_name AS "studentName",g.name||'-'||sec.name AS "studentClass",bi.issue_date AS "issueDate",bi.due_date AS "dueDate",bi.return_date AS "returnDate",bi.status,bi.fine_amount AS "fineAmount",bi.fine_paid AS "finePaid" FROM book_issues bi JOIN books b ON b.id=bi.book_id JOIN students s ON s.id=bi.student_id LEFT JOIN sections sec ON sec.id=s.section_id LEFT JOIN grades g ON g.id=sec.grade_id WHERE bi.tenant_id=${tenantId} AND bi.student_id=${studentId} ORDER BY bi.issue_date DESC`);
        return rows as BookIssue[];
    },
    async getOverdueBooks(tenantId: string): Promise<BookIssue[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT bi.id,bi.book_id AS "bookId",b.title AS "bookTitle",bi.student_id AS "studentId",s.first_name||' '||s.last_name AS "studentName",g.name||'-'||sec.name AS "studentClass",bi.issue_date AS "issueDate",bi.due_date AS "dueDate",bi.status,bi.fine_amount AS "fineAmount",bi.fine_paid AS "finePaid" FROM book_issues bi JOIN books b ON b.id=bi.book_id JOIN students s ON s.id=bi.student_id LEFT JOIN sections sec ON sec.id=s.section_id LEFT JOIN grades g ON g.id=sec.grade_id WHERE bi.tenant_id=${tenantId} AND bi.status='OVERDUE' ORDER BY bi.due_date ASC LIMIT 100`);
        return rows as BookIssue[];
    },
    getCategories(): string[] { return ['TEXTBOOK','REFERENCE','FICTION','NON_FICTION','PERIODICAL','ENCYCLOPEDIA','BIOGRAPHY','SCIENCE','MATHEMATICS']; },
};
