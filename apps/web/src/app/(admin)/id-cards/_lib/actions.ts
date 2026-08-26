'use server';

import QRCode from 'qrcode';
import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { ID_CARD_STATUSES, type PersonType } from './labels';

/** Flat result shape — Next.js erases union narrowing across the 'use server' boundary. */
export interface IdCardActionResult {
    success: boolean;
    error?: string;
    created?: number;
    skipped?: number;
    updated?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isUuid(value: string | null | undefined): boolean {
    return typeof value === 'string' && UUID_RE.test(value);
}

// ─── Card list ───────────────────────────────────────────────

export interface IdCardItem {
    id: string;
    personId: string;
    personType: string;
    status: string;
    validFrom: string;
    validTo: string;
    qrCode: string | null;
    /** Data URL of a QR image encoding `qrCode`; null when the card has no code. */
    qrImage: string | null;
    templateName: string | null;
    printedAt: Date | null;
    issuedAt: Date | null;
    name: string;
    identifier: string | null;
    subtitle: string | null;
    photoUrl: string | null;
    bloodGroup: string | null;
}

/**
 * `id_cards` has no foreign key to students or users — `person_id` is resolved
 * by `person_type`, so each side is queried separately rather than with a
 * conditional join that would silently mismatch.
 */
export async function listIdCards(
    personType: PersonType,
    statusFilter?: string
): Promise<IdCardItem[]> {
    const { tenantId } = await requireAuth('certificate:read');

    const params: string[] = [tenantId];
    let statusClause = '';
    if (statusFilter && ID_CARD_STATUSES.includes(statusFilter as (typeof ID_CARD_STATUSES)[number])) {
        params.push(statusFilter);
        statusClause = ` AND c.status = $${params.length}::id_card_status`;
    }

    const sql =
        personType === 'STUDENT'
            ? `SELECT
                   c.id,
                   c.person_id AS "personId",
                   c.person_type AS "personType",
                   c.status::text AS status,
                   TO_CHAR(c.valid_from, 'YYYY-MM-DD') AS "validFrom",
                   TO_CHAR(c.valid_to, 'YYYY-MM-DD') AS "validTo",
                   c.qr_code AS "qrCode",
                   c.template_name AS "templateName",
                   c.printed_at AS "printedAt",
                   c.issued_at AS "issuedAt",
                   TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) AS name,
                   s.admission_number AS identifier,
                   NULLIF(TRIM(COALESCE(g.name, '') || COALESCE(' - ' || sec.name, '')), '') AS subtitle,
                   s.photo_url AS "photoUrl",
                   s.blood_group::text AS "bloodGroup"
               FROM id_cards c
               JOIN students s ON s.id = c.person_id AND s.tenant_id = c.tenant_id
               LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = c.tenant_id
               LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = c.tenant_id
               WHERE c.tenant_id = $1 AND c.person_type = 'STUDENT'${statusClause}
               ORDER BY g.display_order NULLS LAST, sec.name, s.roll_number NULLS LAST, s.first_name`
            : `SELECT
                   c.id,
                   c.person_id AS "personId",
                   c.person_type AS "personType",
                   c.status::text AS status,
                   TO_CHAR(c.valid_from, 'YYYY-MM-DD') AS "validFrom",
                   TO_CHAR(c.valid_to, 'YYYY-MM-DD') AS "validTo",
                   c.qr_code AS "qrCode",
                   c.template_name AS "templateName",
                   c.printed_at AS "printedAt",
                   c.issued_at AS "issuedAt",
                   TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS name,
                   sp.employee_id AS identifier,
                   COALESCE(d.name, REPLACE(u.role::text, '_', ' ')) AS subtitle,
                   u.avatar_url AS "photoUrl",
                   NULL::text AS "bloodGroup"
               FROM id_cards c
               JOIN users u ON u.id = c.person_id AND u.tenant_id = c.tenant_id
               LEFT JOIN staff_profiles sp ON sp.user_id = u.id AND sp.tenant_id = c.tenant_id
               LEFT JOIN designations d ON d.id = sp.designation_id AND d.tenant_id = c.tenant_id
               WHERE c.tenant_id = $1 AND c.person_type = 'STAFF'${statusClause}
               ORDER BY u.first_name, u.last_name`;

    const { rows } = await pool.query(sql, params);

    // The QR encodes the stored card code and nothing else, so a gate scanner
    // reads back exactly the value shown under the card.
    return Promise.all(
        (rows as Omit<IdCardItem, 'qrImage'>[]).map(async row => ({
            ...row,
            qrImage: row.qrCode
                ? await QRCode.toDataURL(row.qrCode, { margin: 0, width: 160, errorCorrectionLevel: 'M' })
                : null,
        }))
    );
}

export interface IdCardStats {
    total: number;
    pending: number;
    printed: number;
    issued: number;
    /** People of this type who hold no card at all. */
    withoutCard: number;
}

export async function getIdCardStats(personType: PersonType): Promise<IdCardStats> {
    const { tenantId } = await requireAuth('certificate:read');

    const { rows } = await pool.query(
        `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
             COUNT(*) FILTER (WHERE status = 'PRINTED')::int AS printed,
             COUNT(*) FILTER (WHERE status = 'ISSUED')::int AS issued
         FROM id_cards
         WHERE tenant_id = $1 AND person_type = $2`,
        [tenantId, personType]
    );

    const withoutCardSql =
        personType === 'STUDENT'
            ? `SELECT COUNT(*)::int AS c
               FROM students s
               WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'
                 AND NOT EXISTS (
                     SELECT 1 FROM id_cards ic
                     WHERE ic.tenant_id = s.tenant_id
                       AND ic.person_type = 'STUDENT'
                       AND ic.person_id = s.id
                 )`
            : `SELECT COUNT(*)::int AS c
               FROM users u
               LEFT JOIN staff_profiles sp ON sp.user_id = u.id AND sp.tenant_id = u.tenant_id
               WHERE u.tenant_id = $1
                 AND u.is_active
                 AND u.role NOT IN ('STUDENT', 'PARENT')
                 AND (sp.status IS NULL OR sp.status NOT IN ('RESIGNED', 'TERMINATED'))
                 AND NOT EXISTS (
                     SELECT 1 FROM id_cards ic
                     WHERE ic.tenant_id = u.tenant_id
                       AND ic.person_type = 'STAFF'
                       AND ic.person_id = u.id
                 )`;

    const withoutCard = await pool.query(withoutCardSql, [tenantId]);

    return {
        ...(rows[0] as Omit<IdCardStats, 'withoutCard'>),
        withoutCard: withoutCard.rows[0].c as number,
    };
}

// ─── Grades (generation filter) ──────────────────────────────

export interface GradeOption {
    id: string;
    name: string;
    activeStudents: number;
}

export async function listGradesForIdCards(): Promise<GradeOption[]> {
    const { tenantId } = await requireAuth('certificate:read');

    const { rows } = await pool.query(
        `SELECT g.id, g.name, COUNT(s.id) FILTER (WHERE s.status = 'ACTIVE')::int AS "activeStudents"
         FROM grades g
         LEFT JOIN students s ON s.grade_id = g.id AND s.tenant_id = g.tenant_id
         WHERE g.tenant_id = $1
         GROUP BY g.id, g.name, g.display_order
         ORDER BY g.display_order`,
        [tenantId]
    );

    return rows as GradeOption[];
}

// ─── School identity for the card face ───────────────────────

export interface CardSchool {
    name: string;
    city: string | null;
    logoUrl: string | null;
}

export async function getCardSchool(): Promise<CardSchool> {
    const { tenantId } = await requireAuth('certificate:read');

    const { rows } = await pool.query(
        `SELECT name, city, logo_url AS "logoUrl" FROM tenants WHERE id = $1`,
        [tenantId]
    );

    return (rows[0] as CardSchool | undefined) ?? { name: 'School', city: null, logoUrl: null };
}

// ─── Generate cards ──────────────────────────────────────────

/**
 * Creates cards for people who do not already hold one covering the requested
 * validity window. Runs as a single INSERT…SELECT so a double submit cannot
 * produce duplicates.
 */
export async function generateIdCardsAction(input: {
    personType: PersonType;
    gradeId?: string;
    validFrom: string;
    validTo: string;
    templateName?: string;
}): Promise<IdCardActionResult> {
    const { tenantId } = await requireAuth('certificate:write');

    if (input.personType !== 'STUDENT' && input.personType !== 'STAFF') {
        return { success: false, error: 'Choose student or staff cards.' };
    }
    if (!DATE_RE.test(input.validFrom ?? '') || !DATE_RE.test(input.validTo ?? '')) {
        return { success: false, error: 'Both validity dates are required.' };
    }
    if (input.validTo < input.validFrom) {
        return { success: false, error: 'The "valid to" date cannot be before the "valid from" date.' };
    }
    if (input.gradeId && !isUuid(input.gradeId)) {
        return { success: false, error: 'Invalid class filter.' };
    }

    const templateName = (input.templateName?.trim() || 'Standard').slice(0, 100);

    try {
        if (input.personType === 'STUDENT') {
            const inserted = await pool.query(
                `INSERT INTO id_cards (
                     tenant_id, person_id, person_type, valid_from, valid_to, qr_code, template_name
                 )
                 SELECT s.tenant_id, s.id, 'STUDENT', $2::date, $3::date, s.admission_number, $5
                 FROM students s
                 WHERE s.tenant_id = $1
                   AND s.status = 'ACTIVE'
                   AND ($4::uuid IS NULL OR s.grade_id = $4::uuid)
                   AND NOT EXISTS (
                       SELECT 1 FROM id_cards c
                       WHERE c.tenant_id = s.tenant_id
                         AND c.person_type = 'STUDENT'
                         AND c.person_id = s.id
                         AND c.valid_from <= $3::date
                         AND c.valid_to >= $2::date
                   )
                 RETURNING id`,
                [tenantId, input.validFrom, input.validTo, input.gradeId ?? null, templateName]
            );

            const eligible = await pool.query(
                `SELECT COUNT(*)::int AS c FROM students s
                 WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'
                   AND ($2::uuid IS NULL OR s.grade_id = $2::uuid)`,
                [tenantId, input.gradeId ?? null]
            );

            const created = inserted.rowCount ?? 0;
            revalidatePath('/id-cards');
            return { success: true, created, skipped: (eligible.rows[0].c as number) - created };
        }

        const inserted = await pool.query(
            `INSERT INTO id_cards (
                 tenant_id, person_id, person_type, valid_from, valid_to, qr_code, template_name
             )
             SELECT u.tenant_id, u.id, 'STAFF', $2::date, $3::date, sp.employee_id, $4
             FROM users u
             LEFT JOIN staff_profiles sp ON sp.user_id = u.id AND sp.tenant_id = u.tenant_id
             WHERE u.tenant_id = $1
               AND u.is_active
               AND u.role NOT IN ('STUDENT', 'PARENT')
               AND (sp.status IS NULL OR sp.status NOT IN ('RESIGNED', 'TERMINATED'))
               AND NOT EXISTS (
                   SELECT 1 FROM id_cards c
                   WHERE c.tenant_id = u.tenant_id
                     AND c.person_type = 'STAFF'
                     AND c.person_id = u.id
                     AND c.valid_from <= $3::date
                     AND c.valid_to >= $2::date
               )
             RETURNING id`,
            [tenantId, input.validFrom, input.validTo, templateName]
        );

        const eligible = await pool.query(
            `SELECT COUNT(*)::int AS c
             FROM users u
             LEFT JOIN staff_profiles sp ON sp.user_id = u.id AND sp.tenant_id = u.tenant_id
             WHERE u.tenant_id = $1 AND u.is_active
               AND u.role NOT IN ('STUDENT', 'PARENT')
               AND (sp.status IS NULL OR sp.status NOT IN ('RESIGNED', 'TERMINATED'))`,
            [tenantId]
        );

        const created = inserted.rowCount ?? 0;
        revalidatePath('/id-cards');
        return { success: true, created, skipped: (eligible.rows[0].c as number) - created };
    } catch {
        return { success: false, error: 'Could not generate the ID cards.' };
    }
}

// ─── Status transitions ──────────────────────────────────────

/**
 * PENDING → PRINTED → ISSUED. Timestamps are only stamped when the card first
 * reaches that state, so re-running a batch does not rewrite history.
 */
export async function setIdCardStatusAction(input: {
    cardIds: string[];
    status: 'PRINTED' | 'ISSUED';
}): Promise<IdCardActionResult> {
    const { tenantId } = await requireAuth('certificate:write');

    if (input.status !== 'PRINTED' && input.status !== 'ISSUED') {
        return { success: false, error: 'Unsupported card status.' };
    }
    const ids = (input.cardIds ?? []).filter(isUuid);
    if (ids.length === 0) return { success: false, error: 'Select at least one card.' };
    if (ids.length > 1000) return { success: false, error: 'Select fewer than 1000 cards at a time.' };

    const sql =
        input.status === 'PRINTED'
            ? `UPDATE id_cards
                  SET status = 'PRINTED', printed_at = COALESCE(printed_at, NOW())
                WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'PENDING'`
            : `UPDATE id_cards
                  SET status = 'ISSUED',
                      printed_at = COALESCE(printed_at, NOW()),
                      issued_at = COALESCE(issued_at, NOW())
                WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status <> 'ISSUED'`;

    const { rowCount } = await pool.query(sql, [tenantId, ids]);

    revalidatePath('/id-cards');
    return { success: true, updated: rowCount ?? 0 };
}
