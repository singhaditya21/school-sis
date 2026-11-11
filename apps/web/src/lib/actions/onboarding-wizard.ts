'use server';

import { sqlFor, withTenant } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/observability/logger';
import { revalidatePath } from 'next/cache';

export async function completeOnboarding(data: {
    academicYear: string;
    startDate: string;
    endDate: string;
    grades: string[];
}) {
    const { tenantId } = await requireAuth('academic:write');

    const academicYear = String(data.academicYear || '').trim().slice(0, 64);
    if (!academicYear || !data.startDate || !data.endDate) {
        return { error: 'Academic year and valid start/end dates are required.' };
    }
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
        return { error: 'End date must be after start date.' };
    }
    const grades = Array.isArray(data.grades)
        ? data.grades.map((g) => String(g || '').trim().slice(0, 64)).filter(Boolean).slice(0, 30)
        : [];

    try {
        await withTenant(tenantId, async (client) => {
            const q = sqlFor(client);

            // 1. Create Academic Year
            const yearRow = await q<{ id: string }>`
                INSERT INTO academic_years (tenant_id, name, start_date, end_date, is_current)
                VALUES (${tenantId}, ${academicYear}, ${data.startDate}, ${data.endDate}, true)
                RETURNING id
            `.one();
            const yearId = yearRow.id;

            // 2. Create Default Terms (Term 1 and Term 2)
            // Mid-point calculation
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

            // 3. Create Grades + Default Section A so Attendance, Timetable, Exams, and Admissions are ready immediately
            let displayOrder = 1;
            for (const gradeName of grades) {
                let numericValue: number | null = null;
                const match = gradeName.match(/\d+/);
                if (match) {
                    numericValue = parseInt(match[0], 10);
                } else if (gradeName.toLowerCase().includes('pre') || gradeName.toLowerCase().includes('nursery')) {
                    numericValue = 0;
                }

                const gradeRow = await q<{ id: string }>`
                    INSERT INTO grades (tenant_id, name, numeric_value, display_order)
                    VALUES (${tenantId}, ${gradeName}, ${numericValue}, ${displayOrder})
                    RETURNING id
                `.one();

                await q`
                    INSERT INTO sections (tenant_id, grade_id, academic_year_id, name, capacity)
                    VALUES (${tenantId}, ${gradeRow.id}, ${yearId}, 'A', 40)
                `.execute();

                displayOrder++;
            }
        });

        revalidatePath('/dashboard');
        return { success: true };
    } catch (error: unknown) {
        logger.error('onboarding.wizard_failed', 'Failed to complete onboarding wizard', {
            tenantId,
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return { error: 'Failed to complete onboarding.' };
    }
}
