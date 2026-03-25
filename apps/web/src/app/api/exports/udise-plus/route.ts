import { NextRequest, NextResponse } from 'next/server';
import { db, setTenantContext } from '@/lib/db';
import { tenants, students, grades, sections, users } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';

/**
 * UDISE+ CSV Export Endpoint
 *
 * Generates a CSV file in the UDISE+ (Unified District Information System for Education)
 * format required by the Government of India for annual school data submission.
 *
 * GET /api/exports/udise-plus
 */

export async function GET(request: NextRequest) {
    const session = await getSession();
    if (!session.isLoggedIn) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.tenantId;
    await setTenantContext(tenantId);

    try {
        // Get school info
        const [school] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        if (!school) {
            return NextResponse.json({ error: 'School not found' }, { status: 404 });
        }

        // Get student counts by grade and gender
        const studentData = await db.execute(sql`
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
            JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = ${tenantId}
            JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = ${tenantId}
            WHERE s.tenant_id = ${tenantId} AND s.status = 'ACTIVE'
            GROUP BY g.name, g.numeric_value, g.display_order
            ORDER BY g.display_order ASC
        `);

        // Get teacher count
        const [teacherData] = await db.execute(sql`
            SELECT COUNT(*) AS total_teachers
            FROM users
            WHERE tenant_id = ${tenantId} AND role = 'TEACHER' AND is_active = true
        `);

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
