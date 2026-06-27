'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import type { Book, BookIssue } from './types';


/**
 * Fetch students for library auto-complete/select dropdown.
 * Checks permissions using 'library:read'.
 */
export async function getLibraryStudents(): Promise<any[]> {
    const { tenantId } = await requireAuth('library:read');
    const { rows } = await pool.query(`
        SELECT s.id, 
               COALESCE(s.user_id, (SELECT user_id FROM guardians WHERE student_id = s.id AND is_primary = true LIMIT 1)) AS "userId",
               s.admission_number AS "admissionNo", 
               s.first_name||' '||s.last_name AS name,
               g.name||'-'||sec.name AS class
        FROM students s 
        LEFT JOIN sections sec ON sec.id = s.section_id 
        LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE s.tenant_id = $1 AND s.status = 'ACTIVE' 
        ORDER BY s.first_name 
        LIMIT 100
    `, [tenantId]);
    return rows;
}

/**
 * Fetch all library borrowing history for the current tenant.
 * Checks permissions using 'library:read'.
 */
export async function getLibraryHistory(): Promise<any[]> {
    const { tenantId } = await requireAuth('library:read');
    const { rows } = await pool.query(`
        SELECT 
            bi.id,
            bi.book_id AS "bookId",
            b.title AS "bookTitle",
            bi.issued_to_student_id AS "studentId",
            s.first_name AS "studentName",
            s.last_name AS "studentLastName",
            g.name||'-'||sec.name AS "studentClass",
            u.first_name AS "userName",
            u.last_name AS "userLastName",
            bi.issue_date AS "issueDate",
            bi.due_date AS "dueDate",
            bi.return_date AS "returnDate",
            bi.status,
            bi.fine_amount AS "fineAmount",
            bi.is_fine_paid AS "finePaid"
        FROM book_issues bi
        LEFT JOIN books b ON bi.book_id = b.id
        LEFT JOIN students s ON bi.issued_to_student_id = s.id
        LEFT JOIN sections sec ON sec.id = s.section_id
        LEFT JOIN grades g ON g.id = sec.grade_id
        LEFT JOIN users u ON bi.issued_to_user_id = u.id
        WHERE bi.tenant_id = $1
        ORDER BY bi.issue_date DESC
    `, [tenantId]);
    return rows.map(r => ({
        ...r,
        issueDate: r.issueDate instanceof Date ? r.issueDate.toISOString().split('T')[0] : r.issueDate,
        dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : r.dueDate,
        returnDate: r.returnDate instanceof Date ? r.returnDate.toISOString().split('T')[0] : r.returnDate,
    }));
}
