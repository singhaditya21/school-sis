import { NextRequest, NextResponse } from 'next/server';
import { pool, } from '@/lib/db';
import { requireApiPermission } from '@/lib/auth/api';

export const dynamic = "force-dynamic";

/**
 * UDISE+ CSV Export Endpoint
 *
 * Generates a CSV file in the UDISE+ (Unified District Information System for Education)
 * format required by the Government of India for annual school data submission.
 *
 * GET /api/exports/udise-plus
 */

export async function GET(request: NextRequest) {
    const auth = await requireApiPermission('reports:read');
    if (auth.ok === false) return auth.response;

    const tenantId = auth.context.tenantId;

    try {
        // Get school info
        const { rows: [school] } = await pool.query(
            `SELECT *, udise_code AS "udiseCode", affiliation_board AS "affiliationBoard" FROM tenants WHERE id = $1 LIMIT 1`,
            [tenantId]
        );
        if (!school) {
            return NextResponse.json({ error: 'School not found' }, { status: 404 });
        }

        // Get student counts by grade and gender
        const { rows: studentData } = await pool.query(`
            SELECT
                g.name AS grade_name,
                g.numeric_value AS grade_number,
                COUNT(*) FILTER (WHERE s.gender = 'MALE') AS boys,
                COUNT(*) FILTER (WHERE s.gender = 'FEMALE') AS girls,
                COUNT(*) FILTER (WHERE s.category = 'SC') AS sc_count,
                COUNT(*) FILTER (WHERE s.category = 'ST') AS st_count,
                COUNT(*) FILTER (WHERE s.category = 'OBC') AS obc_count,
                COUNT(*) FILTER (WHERE s.category = 'GENERAL') AS general_count,
                COUNT(*) AS total
            FROM students s
            JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = $1
            JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = $1
            WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'
            GROUP BY g.name, g.numeric_value, g.display_order
            ORDER BY g.display_order ASC
        `, [tenantId]);

        // Get teacher count
        const { rows: [teacherData] } = await pool.query(`
            SELECT COUNT(*) AS total_teachers
            FROM users
            WHERE tenant_id = $1 AND role = 'TEACHER' AND is_active = true
        `, [tenantId]);

        // Build CSV
        const rows: string[] = [];

        // Header row
        rows.push([
            'UDISE Code', 'School Name', 'State', 'District', 'Affiliation Board',
            'Grade', 'Boys', 'Girls', 'Total',
            'SC', 'ST', 'OBC', 'General',
            'Total Teachers'
        ].join(','));

        // Data rows
        for (const row of studentData as any[]) {
            rows.push([
                school.udiseCode || '',
                `"${school.name}"`,
                school.state || '',
                school.city || '',
                school.affiliationBoard || '',
                row.grade_name,
                row.boys,
                row.girls,
                row.total,
                row.sc_count,
                row.st_count,
                row.obc_count,
                row.general_count,
                (teacherData as any)?.total_teachers || 0,
            ].join(','));
        }

        const csv = rows.join('\n');

        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="udise_plus_${school.code}_${new Date().toISOString().slice(0, 10)}.csv"`,
            },
        });
    } catch (error: any) {
        console.error('[UDISE+ Export] Error:', error.message);
        return NextResponse.json({ error: 'Failed to generate UDISE+ export' }, { status: 500 });
    }
}
