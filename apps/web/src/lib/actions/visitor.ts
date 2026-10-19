'use server';

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';
import { encryptDeterministic, decryptFieldTolerant } from '@/lib/encryption';

/** Decrypt the contact columns read as COALESCE(*_enc, plaintext). */
function decodeVisitor<T extends { phone: string; email?: string | null }>(rows: T[]): T[] {
    return rows.map((row) => ({
        ...row,
        phone: decryptFieldTolerant(row.phone),
        ...('email' in row ? { email: row.email == null ? null : decryptFieldTolerant(row.email) } : {}),
    }));
}

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
const DAY_START = sql`(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`;

/** Today's gate-pass prefix, e.g. VP-260826- */
const PASS_PREFIX = sql`('VP-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYMMDD') || '-')`;

/**
 * Next gate pass for a tenant: sequential within the day, derived from the
 * passes already issued today so both check-in paths stay in step.
 */
function nextPassFragment(tenantId: string) {
    return sql`(${PASS_PREFIX} || lpad((
        SELECT (count(*) + 1)::text
        FROM visitors seq
        WHERE seq.tenant_id = ${tenantId} AND seq.visitor_pass LIKE ${PASS_PREFIX} || '%'
    ), 3, '0'))`;
}

const VISITOR_COLUMNS = sql`
    id, name,
    COALESCE(phone_enc, phone) AS "phone",
    COALESCE(email_enc, email) AS "email",
    company, purpose,
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

    const rows = await sql<VisitorRow>`
        SELECT ${VISITOR_COLUMNS}
        FROM visitors
        WHERE tenant_id = ${tenantId}
          AND status <> 'PRE_APPROVED'
          AND (status = 'CHECKED_IN' OR check_in_time >= ${DAY_START})
        ORDER BY (status = 'CHECKED_IN') DESC, check_in_time DESC
    `;

    return decodeVisitor(rows);
}

/** Pre-approved visitors who have not arrived yet. */
export async function getExpectedVisitors(): Promise<ExpectedVisitorRow[]> {
    const { tenantId } = await requireAuth('visitor:read');

    const rows = await sql<ExpectedVisitorRow>`
        SELECT id, name, COALESCE(phone_enc, phone) AS "phone", company, purpose,
               purpose_details AS "purposeDetails",
               host_name AS "hostName", host_department AS "hostDepartment",
               to_char(pre_approved_date AT TIME ZONE 'Asia/Kolkata', 'DD Mon, HH12:MI AM') AS "preApprovedLabel"
        FROM visitors
        WHERE tenant_id = ${tenantId} AND status = 'PRE_APPROVED'
        ORDER BY pre_approved_date DESC NULLS LAST
        LIMIT 50
    `;

    return decodeVisitor(rows);
}

/** Live counts for the gate desk — all four come from the visitors table. */
export async function getVisitorStats(): Promise<VisitorStats> {
    const { tenantId } = await requireAuth('visitor:read');

    const row = await sql<VisitorStats>`
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
        WHERE tenant_id = ${tenantId}
    `.maybeOne();

    return row ?? { todayTotal: 0, currentlyIn: 0, checkedOutToday: 0, expected: 0 };
}

/**
 * Type-ahead values for the two free-text fields on the check-in form.
 * Hosts come from real staff accounts plus hosts already used at the gate;
 * departments come from the staff department list plus departments already used.
 */
export async function getGateSuggestions(): Promise<GateSuggestions> {
    const { tenantId } = await requireAuth('visitor:read');

    const [hostRows, deptRows] = await Promise.all([
        sql<{ label: string }>`
            SELECT label FROM (
                SELECT DISTINCT u.first_name || ' ' || u.last_name AS label
                FROM users u
                WHERE u.tenant_id = ${tenantId}
                  AND u.is_active
                  AND u.role NOT IN ('PARENT', 'STUDENT')
                UNION
                SELECT DISTINCT v.host_name AS label
                FROM visitors v
                WHERE v.tenant_id = ${tenantId}
            ) hosts
            WHERE label IS NOT NULL AND btrim(label) <> ''
            ORDER BY label
            LIMIT 100
        `,
        sql<{ label: string }>`
            SELECT label FROM (
                SELECT DISTINCT d.name AS label
                FROM staff_departments d
                WHERE d.tenant_id = ${tenantId} AND d.is_active
                UNION
                SELECT DISTINCT v.host_department AS label
                FROM visitors v
                WHERE v.tenant_id = ${tenantId}
            ) departments
            WHERE label IS NOT NULL AND btrim(label) <> ''
            ORDER BY label
            LIMIT 100
        `,
    ]);

    return {
        hosts: hostRows.map((r) => r.label),
        departments: deptRows.map((r) => r.label),
    };
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

    const phoneEnc = encryptDeterministic(phone, 'visitors.phone');
    const cleanedEmail = clean(data.email, 255);
    const emailEnc = cleanedEmail ? encryptDeterministic(cleanedEmail, 'visitors.email') : null;
    const company = clean(data.company, 255);
    const purposeDetails = clean(data.purposeDetails, 2000);
    const vehicleNumber = clean(data.vehicleNumber, 20).toUpperCase();
    const nextPass = nextPassFragment(tenantId);

    const created = await sql<{ id: string; name: string; visitorPass: string | null }>`
        INSERT INTO visitors (
            tenant_id, name, phone_enc, email_enc, company, purpose, purpose_details,
            host_name, host_department, id_proof, id_number, vehicle_number,
            status, visitor_pass, check_in_time
        )
        VALUES (
            ${tenantId}, ${name}, ${phoneEnc}, ${emailEnc}, NULLIF(${company}, ''), ${purpose}::visit_purpose, NULLIF(${purposeDetails}, ''),
            ${hostName}, ${hostDepartment}, ${idProof}, ${idNumber}, NULLIF(${vehicleNumber}, ''),
            'CHECKED_IN', ${nextPass}, now()
        )
        RETURNING id, name, visitor_pass AS "visitorPass"
    `.maybeOne();

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

    const nextPass = nextPassFragment(tenantId);
    const arrived = await sql<{ id: string; name: string; visitorPass: string | null }>`
        UPDATE visitors
        SET status = 'CHECKED_IN',
            check_in_time = now(),
            check_out_time = NULL,
            visitor_pass = COALESCE(visitor_pass, ${nextPass})
        WHERE tenant_id = ${tenantId} AND id = ${visitorId} AND status = 'PRE_APPROVED'
        RETURNING id, name, visitor_pass AS "visitorPass"
    `.maybeOne();

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

    const released = await sql<{ name: string; minutesInside: number }>`
        UPDATE visitors
        SET status = 'CHECKED_OUT', check_out_time = now()
        WHERE tenant_id = ${tenantId} AND id = ${visitorId} AND status = 'CHECKED_IN'
        RETURNING name,
                  (extract(epoch FROM (now() - check_in_time)) / 60)::int AS "minutesInside"
    `.maybeOne();

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
