'use server';

import { pool } from '@/lib/db';
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
    try {
        await client.query('BEGIN');

        // 1. Create Academic Year
        const { rows: yearRows } = await client.query(
            `INSERT INTO academic_years (tenant_id, name, start_date, end_date, is_current)
             VALUES ($1, $2, $3, $4, true)
             RETURNING id`,
            [tenantId, data.academicYear, data.startDate, data.endDate]
        );
        const yearId = yearRows[0].id;

        // 2. Create Default Terms (Term 1 and Term 2)
        // Mid-point calculation
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        const midTime = start.getTime() + (end.getTime() - start.getTime()) / 2;
        const midDate = new Date(midTime);

        // Term 1: Start to Mid
        await client.query(
            `INSERT INTO terms (tenant_id, academic_year_id, name, type, start_date, end_date)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [tenantId, yearId, 'Term 1', 'TERM_1', data.startDate, midDate.toISOString().split('T')[0]]
        );

        // Term 2: Mid to End
        const term2Start = new Date(midDate);
        term2Start.setDate(term2Start.getDate() + 1);
        await client.query(
            `INSERT INTO terms (tenant_id, academic_year_id, name, type, start_date, end_date)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [tenantId, yearId, 'Term 2', 'TERM_2', term2Start.toISOString().split('T')[0], data.endDate]
        );

        // 3. Create Grades
        let displayOrder = 1;
        for (const gradeName of data.grades) {
            let numericValue = null;
            const match = gradeName.match(/\d+/);
            if (match) {
                numericValue = parseInt(match[0], 10);
            } else if (gradeName.toLowerCase().includes('pre') || gradeName.toLowerCase().includes('nursery')) {
                numericValue = 0;
            }

            await client.query(
                `INSERT INTO grades (tenant_id, name, numeric_value, display_order)
                 VALUES ($1, $2, $3, $4)`,
                [tenantId, gradeName, numericValue, displayOrder]
            );
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
