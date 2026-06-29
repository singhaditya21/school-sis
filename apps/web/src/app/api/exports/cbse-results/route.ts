import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export const dynamic = "force-dynamic";

/**
 * CBSE Board Results Export
 *
 * Generates CSV in CBSE LOC (List of Candidates) format
 * required for board exam registration and result submission.
 *
 * GET /api/exports/cbse-results?examId={examId}
 */

export async function GET(request: NextRequest) {
    const session = await getSession();
    if (!session.isLoggedIn) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.tenantId;
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');

    try {
        const params: any[] = [tenantId];
        let examClause = '';
        if (examId) {
            params.push(examId);
            examClause = `AND e.id = $2`;
        }

        const { rows: data } = await pool.query(`
            SELECT
                s.admission_number AS "Roll Number",
                s.first_name || ' ' || s.last_name AS "Candidate Name",
                s.gender AS "Gender",
                s.date_of_birth AS "DOB",
                s.category AS "Category",
                g.name AS "Class",
                sub.name AS "Subject",
                sub.code AS "Subject Code",
                er.marks_obtained AS "Marks Obtained",
                es.max_marks AS "Total Marks",
                er.grade AS "Grade"
            FROM student_results er
            JOIN exam_schedules es ON es.id = er.exam_schedule_id
            JOIN subjects sub ON sub.id = es.subject_id
            JOIN exams e ON e.id = es.exam_id
            JOIN students s ON s.id = er.student_id
            LEFT JOIN sections sec ON sec.id = s.section_id
            LEFT JOIN grades g ON g.id = sec.grade_id
            WHERE e.tenant_id = $1
            ${examClause}
            ORDER BY g.display_order, s.admission_number, sub.name
        `, params);

        if (data.length === 0) {
            return NextResponse.json({ error: 'No results found' }, { status: 404 });
        }

        // Build CSV
        const columns = ['Roll Number', 'Candidate Name', 'Gender', 'DOB', 'Category', 'Class', 'Subject', 'Subject Code', 'Marks Obtained', 'Total Marks', 'Grade'];
        const rows = [columns.join(',')];

        for (const row of data) {
            rows.push(columns.map(col => {
                const val = row[col];
                if (val === null || val === undefined) return '';
                const str = String(val);
                return str.includes(',') ? `"${str}"` : str;
            }).join(','));
        }

        const { rows: tenants } = await pool.query(`SELECT code FROM tenants WHERE id = $1`, [tenantId]);
        const tenant = tenants[0];

        return new NextResponse(rows.join('\n'), {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="cbse_results_${tenant?.code || 'export'}_${new Date().toISOString().slice(0, 10)}.csv"`,
            },
        });
    } catch (error: any) {
        console.error('[CBSE Export] Error:', error.message);
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }
}
