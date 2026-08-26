'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { DIARY_TYPES, type DiaryEntryRow, type DiaryOptions } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toUuidOrNull(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return UUID_RE.test(trimmed) ? trimmed : null;
}

async function assertBelongsToTenant(
    table: 'grades' | 'sections' | 'subjects' | 'users',
    id: string,
    tenantId: string
): Promise<boolean> {
    const sql = `SELECT 1 FROM ${table} WHERE id = $1 AND tenant_id = $2`;
    const { rowCount } = await pool.query(sql, [id, tenantId]);
    return Boolean(rowCount);
}

export async function listDiaryEntries(filters?: {
    gradeId?: string;
    type?: string;
    date?: string;
}): Promise<DiaryEntryRow[]> {
    const { tenantId } = await requireAuth('diary:read');

    const params: (string | null)[] = [tenantId];
    let sql = `
        SELECT
            d.id,
            d.title,
            d.content,
            d.date,
            d.type,
            d.grade_id AS "gradeId",
            d.section_id AS "sectionId",
            d.subject_id AS "subjectId",
            d.teacher_id AS "teacherId",
            g.name AS "gradeName",
            sec.name AS "sectionName",
            sub.name AS "subjectName",
            NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS "teacherName",
            d.created_at AS "createdAt"
        FROM diary_entries d
        LEFT JOIN grades g ON g.id = d.grade_id AND g.tenant_id = d.tenant_id
        LEFT JOIN sections sec ON sec.id = d.section_id AND sec.tenant_id = d.tenant_id
        LEFT JOIN subjects sub ON sub.id = d.subject_id AND sub.tenant_id = d.tenant_id
        LEFT JOIN users u ON u.id = d.teacher_id AND u.tenant_id = d.tenant_id
        WHERE d.tenant_id = $1
    `;

    const gradeId = toUuidOrNull(filters?.gradeId);
    if (gradeId) {
        params.push(gradeId);
        sql += ` AND d.grade_id = $${params.length}`;
    }

    const type = filters?.type?.trim();
    if (type && (DIARY_TYPES as readonly string[]).includes(type)) {
        params.push(type);
        sql += ` AND d.type = $${params.length}`;
    }

    const date = filters?.date?.trim();
    if (date && DATE_RE.test(date)) {
        params.push(date);
        sql += ` AND d.date = $${params.length}`;
    }

    sql += ` ORDER BY d.date DESC, d.created_at DESC NULLS LAST LIMIT 200`;

    const { rows } = await pool.query(sql, params);
    return rows as DiaryEntryRow[];
}

export async function getDiaryOptions(): Promise<DiaryOptions> {
    const { tenantId } = await requireAuth('diary:read');

    const [gradeResult, subjectResult, teacherResult] = await Promise.all([
        pool.query(
            `SELECT g.id AS "gradeId", g.name AS "gradeName", s.id AS "sectionId", s.name AS "sectionName"
             FROM grades g
             LEFT JOIN sections s ON s.grade_id = g.id AND s.tenant_id = g.tenant_id
             WHERE g.tenant_id = $1
             ORDER BY g.display_order, g.name, s.name`,
            [tenantId]
        ),
        pool.query(
            `SELECT id AS "subjectId", name AS "subjectName" FROM subjects WHERE tenant_id = $1 ORDER BY name`,
            [tenantId]
        ),
        pool.query(
            `SELECT id AS "teacherId",
                    NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '') AS "teacherName"
             FROM users
             WHERE tenant_id = $1 AND is_active = true AND role IN ('TEACHER', 'PRINCIPAL', 'SCHOOL_ADMIN')
             ORDER BY first_name, last_name`,
            [tenantId]
        ),
    ]);

    const grades: DiaryOptions['grades'] = [];
    for (const row of gradeResult.rows) {
        let grade = grades.find((g) => g.gradeId === row.gradeId);
        if (!grade) {
            grade = { gradeId: row.gradeId, gradeName: row.gradeName, sections: [] };
            grades.push(grade);
        }
        if (row.sectionId) {
            grade.sections.push({ sectionId: row.sectionId, sectionName: row.sectionName });
        }
    }

    return {
        grades,
        subjects: subjectResult.rows.map((r) => ({ subjectId: r.subjectId, subjectName: r.subjectName })),
        teachers: teacherResult.rows
            .filter((r) => r.teacherName)
            .map((r) => ({ teacherId: r.teacherId, teacherName: r.teacherName })),
    };
}

export async function createDiaryEntry(input: {
    title: string;
    content: string;
    date: string;
    type?: string;
    gradeId?: string;
    sectionId?: string;
    subjectId?: string;
    teacherId?: string;
}): Promise<{ success: boolean; error?: string; entryId?: string }> {
    const { tenantId, userId } = await requireAuth('diary:write');

    const title = input.title?.trim();
    if (!title) return { success: false, error: 'Title is required.' };
    if (title.length > 255) return { success: false, error: 'Title must be 255 characters or fewer.' };

    const content = input.content?.trim();
    if (!content) return { success: false, error: 'Entry text is required.' };

    const date = input.date?.trim();
    if (!date || !DATE_RE.test(date)) {
        return { success: false, error: 'A valid date (YYYY-MM-DD) is required.' };
    }

    const type = input.type?.trim() || null;
    if (type && !(DIARY_TYPES as readonly string[]).includes(type)) {
        return { success: false, error: 'Unknown entry type.' };
    }

    const gradeId = toUuidOrNull(input.gradeId);
    const sectionId = toUuidOrNull(input.sectionId);
    const subjectId = toUuidOrNull(input.subjectId);
    const teacherId = toUuidOrNull(input.teacherId) ?? userId;

    if (gradeId && !(await assertBelongsToTenant('grades', gradeId, tenantId))) {
        return { success: false, error: 'Selected class was not found.' };
    }
    if (sectionId) {
        const { rowCount } = await pool.query(
            `SELECT 1 FROM sections WHERE id = $1 AND tenant_id = $2
             AND ($3::uuid IS NULL OR grade_id = $3::uuid)`,
            [sectionId, tenantId, gradeId]
        );
        if (!rowCount) return { success: false, error: 'Selected section does not belong to that class.' };
    }
    if (subjectId && !(await assertBelongsToTenant('subjects', subjectId, tenantId))) {
        return { success: false, error: 'Selected subject was not found.' };
    }
    if (!(await assertBelongsToTenant('users', teacherId, tenantId))) {
        return { success: false, error: 'Selected teacher was not found.' };
    }

    const { rows } = await pool.query(
        `INSERT INTO diary_entries
            (tenant_id, title, content, date, grade_id, section_id, subject_id, teacher_id, type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [tenantId, title, content, date, gradeId, sectionId, subjectId, teacherId, type]
    );

    revalidatePath('/diary');
    return { success: true, entryId: rows[0]?.id };
}

export async function updateDiaryEntry(input: {
    entryId: string;
    title: string;
    content: string;
    date: string;
    type?: string;
}): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('diary:write');

    const entryId = toUuidOrNull(input.entryId);
    if (!entryId) return { success: false, error: 'Invalid entry.' };

    const title = input.title?.trim();
    if (!title) return { success: false, error: 'Title is required.' };

    const content = input.content?.trim();
    if (!content) return { success: false, error: 'Entry text is required.' };

    const date = input.date?.trim();
    if (!date || !DATE_RE.test(date)) {
        return { success: false, error: 'A valid date (YYYY-MM-DD) is required.' };
    }

    const type = input.type?.trim() || null;
    if (type && !(DIARY_TYPES as readonly string[]).includes(type)) {
        return { success: false, error: 'Unknown entry type.' };
    }

    const { rowCount } = await pool.query(
        `UPDATE diary_entries
         SET title = $1, content = $2, date = $3, type = $4, updated_at = NOW()
         WHERE id = $5 AND tenant_id = $6`,
        [title, content, date, type, entryId, tenantId]
    );
    if (!rowCount) return { success: false, error: 'Entry was not found.' };

    revalidatePath('/diary');
    return { success: true };
}

export async function deleteDiaryEntry(entryId: string): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = await requireAuth('diary:write');

    const id = toUuidOrNull(entryId);
    if (!id) return { success: false, error: 'Invalid entry.' };

    const { rowCount } = await pool.query(
        'DELETE FROM diary_entries WHERE id = $1 AND tenant_id = $2',
        [id, tenantId]
    );
    if (!rowCount) return { success: false, error: 'Entry was not found.' };

    revalidatePath('/diary');
    return { success: true };
}
