'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export async function getDiaryEntries(): Promise<any[]> {
    const { tenantId } = await requireAuth('diary:read');
    const { rows } = await pool.query(`
        SELECT d.id, d.title, d.content, d.date, g.name AS class, sec.name AS section,
               sub.name AS subject, u.first_name||' '||u.last_name AS "teacherName", d.type
        FROM diary_entries d
        LEFT JOIN grades g ON g.id = d.grade_id LEFT JOIN sections sec ON sec.id = d.section_id
        LEFT JOIN subjects sub ON sub.id = d.subject_id LEFT JOIN users u ON u.id = d.teacher_id
        WHERE d.tenant_id = $1 ORDER BY d.date DESC LIMIT 50
    `, [tenantId]);
    return rows;
}
