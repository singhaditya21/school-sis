'use server';

import { pool, sqlFor } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';

export async function completeOnboarding(data: {
    academicYear: string;
    startDate: string;
    endDate: string;
    grades: string[];
}) {
    const { tenantId } = await requireAuth();

    const client = await pool.connect();
    const q = sqlFor(client);
    try {
        await client.query('BEGIN');

        // 1. Create Academic Year
        const yearRow = await q<{ id: string }>`
            INSERT INTO academic_years (tenant_id, name, start_date, end_date, is_current)
            VALUES (${tenantId}, ${data.academicYear}, ${data.startDate}, ${data.endDate}, true)
            RETURNING id
        `.one();
        const yearId = yearRow.id;

        // 2. Create Default Terms (Term 1 and Term 2)
        // Mid-point calculation
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        const midTime = start.getTime() + (end.getTime() - start.getTime()) / 2;
        const midDate = new Date(midTime);
        const midDateStr = midDate.toISOString().split('T')[0];

        // Term 1: Start to Mid
        await q`
            INSERT INTO terms (tenant_id, academic_year_id, name, type, start_date, end_date)
            VALUES (${tenantId}, ${yearId}, 'Term 1', 'TERM_1', ${data.startDate}, ${midDateStr})
        `.execute();

        // Term 2: Mid to End
        const term2Start = new Date(midDate);
        term2Start.setDate(term2Start.getDate() + 1);
        const term2StartStr = term2Start.toISOString().split('T')[0];
        await q`
            INSERT INTO terms (tenant_id, academic_year_id, name, type, start_date, end_date)
            VALUES (${tenantId}, ${yearId}, 'Term 2', 'TERM_2', ${term2StartStr}, ${data.endDate})
        `.execute();

        // 3. Create Grades
        let displayOrder = 1;
        for (const gradeName of data.grades) {
            let numericValue: number | null = null;
            const match = gradeName.match(/\d+/);
            if (match) {
                numericValue = parseInt(match[0], 10);
            } else if (gradeName.toLowerCase().includes('pre') || gradeName.toLowerCase().includes('nursery')) {
                numericValue = 0;
            }

            await q`
                INSERT INTO grades (tenant_id, name, numeric_value, display_order)
                VALUES (${tenantId}, ${gradeName}, ${numericValue}, ${displayOrder})
            `.execute();
            displayOrder++;
        }

        await client.query('COMMIT');
        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: unknown) {
        await client.query('ROLLBACK');
        console.error('[ONBOARDING_WIZARD_ERROR]', error);
        return { error: (error as Error)?.message || 'Failed to complete onboarding.' };
    } finally {
        client.release();
    }
}
