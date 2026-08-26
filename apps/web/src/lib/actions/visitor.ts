'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';

// ─── Types ───────────────────────────────────────────────────

export type VisitorRow = {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    company: string | null;
    purpose: string;
    purposeDetails: string | null;
    hostName: string;
    hostDepartment: string;
    idProof: string;
    idNumber: string;
    vehicleNumber: string | null;
    status: string;
    visitorPass: string | null;
    /** Check-in clock time in the school's local calendar, e.g. "09:42 AM". */
    checkInLabel: string;
    /** Day of check-in, e.g. "24 Aug" — only shown for visits carried over from an earlier day. */
    checkInDayLabel: string;
    checkOutLabel: string | null;
    /** Minutes elapsed inside: since check-in while present, total stay once checked out. */
    minutesInside: number;
    /** True when this visit started before today and the visitor never checked out. */
    carriedOver: boolean;
};

export type ExpectedVisitorRow = {
    id: string;
    name: string;
    phone: string;
    company: string | null;
    purpose: string;
    purposeDetails: string | null;
    hostName: string;
    hostDepartment: string;
    /** When the pre-approval was recorded, e.g. "24 Aug, 03:10 PM". */
    preApprovedLabel: string | null;
};

export type VisitorStats = {
    todayTotal: number;
    currentlyIn: number;
    checkedOutToday: number;
    expected: number;
};

export type GateSuggestions = {
    hosts: string[];
    departments: string[];
};

export type CheckInResult = {
    success: boolean;
    error?: string;
    visitorId?: string;
    visitorName?: string;
    visitorPass?: string;
};

export type CheckOutResult = {
    success: boolean;
    error?: string;
    visitorName?: string;
    minutesInside?: number;
};

// ─── SQL fragments ───────────────────────────────────────────

/** Start of the current day in the school's local (IST) calendar, as a timestamptz. */
const DAY_START = `(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`;

/** Today's gate-pass prefix, e.g. VP-260826- */
const PASS_PREFIX = `('VP-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD') || '-')`;

/**
 * Next gate pass for a tenant: sequential within the day, derived from the
 * passes already issued today so both check-in paths stay in step.
 * `$1` must be the tenant id.
 */
const NEXT_PASS = `(${PASS_PREFIX} || lpad((
    SELECT (count(*) + 1)::text
    FROM visitors seq
    WHERE seq.tenant_id = $1 AND seq.visitor_pass LIKE ${PASS_PREFIX} || '%'
), 3, '0'))`;

const VISITOR_COLUMNS = `
    id, name, phone, email, company, purpose,
    purpose_details AS "purposeDetails",
    host_name AS "hostName", host_department AS "hostDepartment",
    id_proof AS "idProof", id_number AS "idNumber",
    vehicle_number AS "vehicleNumber",
    status, visitor_pass AS "visitorPass",
    to_char(check_in_time AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS "checkInLabel",
    to_char(check_in_time AT TIME ZONE 'Asia/Kolkata', 'DD Mon') AS "checkInDayLabel",
    to_char(check_out_time AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS "checkOutLabel",
    (extract(epoch FROM (COALESCE(check_out_time, now()) - check_in_time)) / 60)::int AS "minutesInside",
    (check_in_time < ${DAY_START}) AS "carriedOver"
`;

const VISIT_PURPOSES = [
    'MEETING',
    'ADMISSION',
    'DELIVERY',
    'INTERVIEW',
    'PARENT_VISIT',
    'VENDOR',
    'OTHER',
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(value: string | undefined | null, max: number): string {
    return (value ?? '').trim().slice(0, max);
}

// ─── Read: today's register ──────────────────────────────────

/**
 * The gate register the guard works from: everyone who checked in today, plus
 * anyone still marked as inside from an earlier day (they never checked out,
 * so they must stay visible).
 */
export async function getTodayRegister(): Promise<VisitorRow[]> {
    const { tenantId } = await requireAuth('visitor:read');

    const { rows } = await pool.query<VisitorRow>(
        `
        SELECT ${VISITOR_COLUMNS}
        FROM visitors
        WHERE tenant_id = $1
          AND status <> 'PRE_APPROVED'
          AND (status = 'CHECKED_IN' OR check_in_time >= ${DAY_START})
        ORDER BY (status = 'CHECKED_IN') DESC, check_in_time DESC
        `,
        [tenantId],
    );

    return rows;
}

/** Pre-approved visitors who have not arrived yet. */
export async function getExpectedVisitors(): Promise<ExpectedVisitorRow[]> {
    const { tenantId } = await requireAuth('visitor:read');

    const { rows } = await pool.query<ExpectedVisitorRow>(
        `
        SELECT id, name, phone, company, purpose,
               purpose_details AS "purposeDetails",
               host_name AS "hostName", host_department AS "hostDepartment",
               to_char(pre_approved_date AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM') AS "preApprovedLabel"
        FROM visitors
        WHERE tenant_id = $1 AND status = 'PRE_APPROVED'
        ORDER BY pre_approved_date DESC NULLS LAST
        LIMIT 50
        `,
        [tenantId],
    );

    return rows;
}

/** Live counts for the gate desk — all four come from the visitors table. */
export async function getVisitorStats(): Promise<VisitorStats> {
    const { tenantId } = await requireAuth('visitor:read');

    const { rows } = await pool.query<VisitorStats>(
        `
        SELECT
            count(*) FILTER (
                WHERE status <> 'PRE_APPROVED' AND check_in_time >= ${DAY_START}
            )::int AS "todayTotal",
            count(*) FILTER (WHERE status = 'CHECKED_IN')::int AS "currentlyIn",
            count(*) FILTER (
                WHERE status = 'CHECKED_OUT' AND check_out_time >= ${DAY_START}
            )::int AS "checkedOutToday",
            count(*) FILTER (WHERE status = 'PRE_APPROVED')::int AS "expected"
        FROM visitors
        WHERE tenant_id = $1
        `,
        [tenantId],
    );

    return rows[0] ?? { todayTotal: 0, currentlyIn: 0, checkedOutToday: 0, expected: 0 };
}

/**
 * Type-ahead values for the two free-text fields on the check-in form.
 * Hosts come from real staff accounts plus hosts already used at the gate;
 * departments come from the staff department list plus departments already used.
 */
export async function getGateSuggestions(): Promise<GateSuggestions> {
    const { tenantId } = await requireAuth('visitor:read');

    const [hostResult, deptResult] = await Promise.all([
        pool.query<{ label: string }>(
            `
            SELECT label FROM (
                SELECT DISTINCT u.first_name || ' ' || u.last_name AS label
                FROM users u
                WHERE u.tenant_id = $1
                  AND u.is_active
                  AND u.role NOT IN ('PARENT', 'STUDENT')
                UNION
                SELECT DISTINCT v.host_name AS label
                FROM visitors v
                WHERE v.tenant_id = $1
            ) hosts
            WHERE label IS NOT NULL AND btrim(label) <> ''
            ORDER BY label
            LIMIT 100
            `,
            [tenantId],
        ),
        pool.query<{ label: string }>(
            `
            SELECT label FROM (
                SELECT DISTINCT d.name AS label
                FROM staff_departments d
                WHERE d.tenant_id = $1 AND d.is_active
                UNION
                SELECT DISTINCT v.host_department AS label
                FROM visitors v
                WHERE v.tenant_id = $1
            ) departments
            WHERE label IS NOT NULL AND btrim(label) <> ''
            ORDER BY label
            LIMIT 100
            `,
            [tenantId],
        ),
    ]);

    return {
        hosts: hostResult.rows.map((r) => r.label),
        departments: deptResult.rows.map((r) => r.label),
    };
}

/** Kept for callers that need the unfiltered history rather than today's register. */
export async function getVisitors(filters?: { status?: string; purpose?: string }): Promise<VisitorRow[]> {
    const { tenantId } = await requireAuth('visitor:read');

    let query = `
        SELECT ${VISITOR_COLUMNS}
        FROM visitors
        WHERE tenant_id = $1
    `;
    const params: string[] = [tenantId];

    if (filters?.status) {
        params.push(filters.status);
        query += ` AND status = $${params.length}::visitor_status`;
    }
    if (filters?.purpose) {
        params.push(filters.purpose);
        query += ` AND purpose = $${params.length}::visit_purpose`;
    }

    query += ` ORDER BY check_in_time DESC LIMIT 500`;

    const { rows } = await pool.query<VisitorRow>(query, params);
    return rows;
}

// ─── Write: check in ─────────────────────────────────────────

export async function checkInVisitor(data: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
    purpose: string;
    purposeDetails?: string;
    hostName: string;
    hostDepartment: string;
    idProof: string;
    idNumber: string;
    vehicleNumber?: string;
}): Promise<CheckInResult> {
    const { tenantId } = await requireAuth('visitor:write');

    const name = clean(data.name, 200);
    const phone = clean(data.phone, 20);
    const hostName = clean(data.hostName, 200);
    const hostDepartment = clean(data.hostDepartment, 100);
    const idProof = clean(data.idProof, 100);
    const idNumber = clean(data.idNumber, 100);
    const purpose = clean(data.purpose, 32).toUpperCase();

    if (!name) return { success: false, error: 'Visitor name is required.' };
    if (phone.replace(/\D/g, '').length < 6) {
        return { success: false, error: 'Enter a valid phone number.' };
    }
    if (!VISIT_PURPOSES.includes(purpose as (typeof VISIT_PURPOSES)[number])) {
        return { success: false, error: 'Select the purpose of the visit.' };
    }
    if (!hostName) return { success: false, error: 'Enter who the visitor is here to meet.' };
    if (!hostDepartment) return { success: false, error: 'Enter the department being visited.' };
    if (!idProof) return { success: false, error: 'Select the ID proof shown at the gate.' };
    if (!idNumber) return { success: false, error: 'Enter the ID number.' };

    const { rows } = await pool.query<{ id: string; name: string; visitorPass: string | null }>(
        `
        INSERT INTO visitors (
            tenant_id, name, phone, email, company, purpose, purpose_details,
            host_name, host_department, id_proof, id_number, vehicle_number,
            status, visitor_pass, check_in_time
        )
        VALUES (
            $1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6::visit_purpose, NULLIF($7, ''),
            $8, $9, $10, $11, NULLIF($12, ''),
            'CHECKED_IN', ${NEXT_PASS}, now()
        )
        RETURNING id, name, visitor_pass AS "visitorPass"
        `,
        [
            tenantId,
            name,
            phone,
            clean(data.email, 255),
            clean(data.company, 255),
            purpose,
            clean(data.purposeDetails, 2000),
            hostName,
            hostDepartment,
            idProof,
            idNumber,
            clean(data.vehicleNumber, 20).toUpperCase(),
        ],
    );

    const created = rows[0];
    if (!created) return { success: false, error: 'Could not record the check-in. Try again.' };

    revalidatePath('/visitors');

    return {
        success: true,
        visitorId: created.id,
        visitorName: created.name,
        visitorPass: created.visitorPass ?? undefined,
    };
}

/** Mark a pre-approved visitor as arrived and issue their gate pass. */
export async function checkInExpectedVisitor(visitorId: string): Promise<CheckInResult> {
    const { tenantId } = await requireAuth('visitor:write');

    if (!UUID_RE.test(visitorId ?? '')) {
        return { success: false, error: 'That visitor record could not be found.' };
    }

    const { rows } = await pool.query<{ id: string; name: string; visitorPass: string | null }>(
        `
        UPDATE visitors
        SET status = 'CHECKED_IN',
            check_in_time = now(),
            check_out_time = NULL,
            visitor_pass = COALESCE(visitor_pass, ${NEXT_PASS})
        WHERE tenant_id = $1 AND id = $2 AND status = 'PRE_APPROVED'
        RETURNING id, name, visitor_pass AS "visitorPass"
        `,
        [tenantId, visitorId],
    );

    const arrived = rows[0];
    if (!arrived) {
        return { success: false, error: 'That visitor is no longer awaiting arrival.' };
    }

    revalidatePath('/visitors');

    return {
        success: true,
        visitorId: arrived.id,
        visitorName: arrived.name,
        visitorPass: arrived.visitorPass ?? undefined,
    };
}

// ─── Write: check out ────────────────────────────────────────

export async function checkOutVisitor(visitorId: string): Promise<CheckOutResult> {
    const { tenantId } = await requireAuth('visitor:write');

    if (!UUID_RE.test(visitorId ?? '')) {
        return { success: false, error: 'That visitor record could not be found.' };
    }

    const { rows } = await pool.query<{ name: string; minutesInside: number }>(
        `
        UPDATE visitors
        SET status = 'CHECKED_OUT', check_out_time = now()
        WHERE tenant_id = $1 AND id = $2 AND status = 'CHECKED_IN'
        RETURNING name,
                  (extract(epoch FROM (now() - check_in_time)) / 60)::int AS "minutesInside"
        `,
        [tenantId, visitorId],
    );

    const released = rows[0];
    if (!released) {
        return { success: false, error: 'That visitor is not checked in right now.' };
    }

    revalidatePath('/visitors');

    return {
        success: true,
        visitorName: released.name,
        minutesInside: released.minutesInside,
    };
}

// ─── Write: pre-approve ──────────────────────────────────────

export async function preApproveVisitor(data: {
    name: string;
    phone: string;
    email?: string;
    company?: string;
    purpose: string;
    purposeDetails?: string;
    hostName: string;
    hostDepartment: string;
    idProof: string;
    idNumber: string;
}): Promise<CheckInResult> {
    const { tenantId, userId } = await requireAuth('visitor:write');

    const name = clean(data.name, 200);
    const phone = clean(data.phone, 20);
    const hostName = clean(data.hostName, 200);
    const hostDepartment = clean(data.hostDepartment, 100);
    const purpose = clean(data.purpose, 32).toUpperCase();

    if (!name) return { success: false, error: 'Visitor name is required.' };
    if (phone.replace(/\D/g, '').length < 6) {
        return { success: false, error: 'Enter a valid phone number.' };
    }
    if (!VISIT_PURPOSES.includes(purpose as (typeof VISIT_PURPOSES)[number])) {
        return { success: false, error: 'Select the purpose of the visit.' };
    }
    if (!hostName) return { success: false, error: 'Enter who the visitor is here to meet.' };
    if (!hostDepartment) return { success: false, error: 'Enter the department being visited.' };

    const { rows } = await pool.query<{ id: string; name: string }>(
        `
        INSERT INTO visitors (
            tenant_id, name, phone, email, company, purpose, purpose_details,
            host_name, host_department, id_proof, id_number, status,
            pre_approved_by, pre_approved_date
        )
        VALUES (
            $1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6::visit_purpose, NULLIF($7, ''),
            $8, $9, $10, $11, 'PRE_APPROVED', $12, now()
        )
        RETURNING id, name
        `,
        [
            tenantId,
            name,
            phone,
            clean(data.email, 255),
            clean(data.company, 255),
            purpose,
            clean(data.purposeDetails, 2000),
            hostName,
            hostDepartment,
            clean(data.idProof, 100),
            clean(data.idNumber, 100),
            userId,
        ],
    );

    const created = rows[0];
    if (!created) return { success: false, error: 'Could not save the pre-approval. Try again.' };

    revalidatePath('/visitors');

    return { success: true, visitorId: created.id, visitorName: created.name };
}
