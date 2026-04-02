import { NextRequest, NextResponse } from 'next/server';
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';
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

    await setTenantContext(tenantId);

    try {
        const data = await db.execute(sql`
            SELECT
                s.admission_number AS "Roll Number",
                s.first_name || ' ' || s.last_name AS "Candidate Name",
                s.gender AS "Gender",
                s.date_of_birth AS "DOB",
                s.category AS "Category",
                g.name AS "Class",
                sub.name AS "Subject",
                es.subject_code AS "Subject Code",
                er.marks_obtained AS "Marks Obtained",
                er.total_marks AS "Total Marks",
                er.grade AS "Grade"
            FROM exam_results er
            JOIN exam_subjects es ON es.id = er.exam_subject_id
            JOIN subjects sub ON sub.id = es.subject_id
            JOIN exams e ON e.id = es.exam_id
            JOIN students s ON s.id = er.student_id
            LEFT JOIN sections sec ON sec.id = s.section_id
            LEFT JOIN grades g ON g.id = sec.grade_id
            WHERE e.tenant_id = ${tenantId}
            ${examId ? sql`AND e.id = ${examId}` : sql``}
            ORDER BY g.display_order, s.admission_number, sub.name
        `);

        if ((data as any[]).length === 0) {
            return NextResponse.json({ error: 'No results found' }, { status: 404 });
        }

        // Build CSV
        const columns = ['Roll Number', 'Candidate Name', 'Gender', 'DOB', 'Category', 'Class', 'Subject', 'Subject Code', 'Marks Obtained', 'Total Marks', 'Grade'];
        const rows = [columns.join(',')];

        for (const row of data as any[]) {
            rows.push(columns.map(col => {
                const val = row[col];
                if (val === null || val === undefined) return '';
                const str = String(val);
                return str.includes(',') ? `"${str}"` : str;
            }).join(','));
        }

        const [tenant] = await db.execute(sql`SELECT code FROM tenants WHERE id = ${tenantId}`) as any[];

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
