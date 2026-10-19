'use server';

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export async function getGradesList() {
    const { tenantId } = await requireAuth('students:read');

    return sql<{ id: string; name: string; displayOrder: number }>`
        SELECT id, name, display_order AS "displayOrder"
        FROM grades
        WHERE tenant_id = ${tenantId}
        ORDER BY display_order ASC
    `;
}
