'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * Infirmary server actions.
 *
 * These live beside the route rather than in `lib/actions/health.ts` because the
 * queries here need columns that the shared helpers do not select (and
 * `health_records` has no `created_at` column, which the shared
 * `getHealthRecord` helper asks for).
 */

/** Mirrors the `health_incident_type` enum in the database. */
const HEALTH_INCIDENT_TYPES = ['INJURY', 'ILLNESS', 'ALLERGY', 'EMERGENCY', 'OTHER'] as const;

export type HealthIncidentType = (typeof HEALTH_INCIDENT_TYPES)[number];

export type StudentOption = {
    id: string;
    name: string;
    admissionNumber: string;
    className: string | null;
};

export type MedicalAlertRow = {
    studentId: string;
    studentName: string;
    className: string | null;
    bloodGroup: string | null;
    allergies: string[];
    conditions: string[];
    medications: string[];
    emergencyContact: string | null;
    emergencyPhone: string | null;
};

export type ImmunizationDueRow = {
    id: string;
    studentName: string;
    vaccineName: string;
    doseNumber: number;
    nextDueDate: string;
    overdue: boolean;
};

export type LogIncidentResult = {
    success: boolean;
    error?: string;
    incidentId?: string;
};

function isIncidentType(value: string): value is HealthIncidentType {
    return (HEALTH_INCIDENT_TYPES as readonly string[]).includes(value);
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

/** Students that can be attached to an incident. Real roll, no placeholders. */
export async function getStudentOptions(): Promise<StudentOption[]> {
    const { tenantId } = await requireAuth('health:read');

    const { rows } = await pool.query(
        `SELECT
             s.id,
             s.first_name || ' ' || s.last_name AS name,
             s.admission_number AS "admissionNumber",
             CASE WHEN g.name IS NULL THEN NULL ELSE g.name || ' - ' || COALESCE(sec.name, '') END AS "className"
         FROM students s
         LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
         LEFT JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'
         ORDER BY s.first_name ASC, s.last_name ASC`,
        [tenantId],
    );

    return rows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        admissionNumber: row.admissionNumber as string,
        className: (row.className as string | null) ?? null,
    }));
}

/**
 * Students whose health record carries an allergy, condition or regular
 * medication — the list an infirmary actually needs at hand.
 */
export async function getMedicalAlerts(): Promise<MedicalAlertRow[]> {
    const { tenantId } = await requireAuth('health:read');

    const { rows } = await pool.query(
        `SELECT
             hr.student_id AS "studentId",
             s.first_name || ' ' || s.last_name AS "studentName",
             CASE WHEN g.name IS NULL THEN NULL ELSE g.name || ' - ' || COALESCE(sec.name, '') END AS "className",
             hr.blood_group AS "bloodGroup",
             hr.allergies,
             hr.conditions,
             hr.medications,
             hr.emergency_contact AS "emergencyContact",
             hr.emergency_phone AS "emergencyPhone"
         FROM health_records hr
         JOIN students s ON s.id = hr.student_id AND s.tenant_id = hr.tenant_id
         LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
         LEFT JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = s.tenant_id
         WHERE hr.tenant_id = $1
           AND (
                (jsonb_typeof(hr.allergies) = 'array' AND jsonb_array_length(hr.allergies) > 0)
             OR (jsonb_typeof(hr.conditions) = 'array' AND jsonb_array_length(hr.conditions) > 0)
             OR (jsonb_typeof(hr.medications) = 'array' AND jsonb_array_length(hr.medications) > 0)
           )
         ORDER BY s.first_name ASC, s.last_name ASC
         LIMIT 100`,
        [tenantId],
    );

    return rows.map((row) => ({
        studentId: row.studentId as string,
        studentName: row.studentName as string,
        className: (row.className as string | null) ?? null,
        bloodGroup: (row.bloodGroup as string | null) ?? null,
        allergies: toStringArray(row.allergies),
        conditions: toStringArray(row.conditions),
        medications: toStringArray(row.medications),
        emergencyContact: (row.emergencyContact as string | null) ?? null,
        emergencyPhone: (row.emergencyPhone as string | null) ?? null,
    }));
}

/** Immunisation doses already overdue or falling due within 60 days. */
export async function getImmunizationsDue(): Promise<ImmunizationDueRow[]> {
    const { tenantId } = await requireAuth('health:read');

    const { rows } = await pool.query(
        `SELECT
             i.id,
             s.first_name || ' ' || s.last_name AS "studentName",
             i.vaccine_name AS "vaccineName",
             i.dose_number AS "doseNumber",
             i.next_due_date AS "nextDueDate",
             (i.next_due_date < CURRENT_DATE) AS overdue
         FROM immunizations i
         JOIN students s ON s.id = i.student_id AND s.tenant_id = i.tenant_id
         WHERE i.tenant_id = $1
           AND i.next_due_date IS NOT NULL
           AND i.next_due_date <= CURRENT_DATE + INTERVAL '60 days'
           AND s.status = 'ACTIVE'
         ORDER BY i.next_due_date ASC
         LIMIT 50`,
        [tenantId],
    );

    return rows.map((row) => {
        const due = row.nextDueDate as Date | string;
        return {
            id: row.id as string,
            studentName: row.studentName as string,
            vaccineName: row.vaccineName as string,
            doseNumber: Number(row.doseNumber ?? 1),
            nextDueDate: due instanceof Date ? due.toISOString().slice(0, 10) : String(due).slice(0, 10),
            overdue: Boolean(row.overdue),
        };
    });
}

/**
 * Record a medical incident against a student.
 * Writes `health_incidents` directly so the observed date, follow-up flag and
 * follow-up notes can be captured (the shared `logIncident` helper drops them).
 */
export async function logHealthIncident(input: {
    studentId: string;
    type: string;
    description: string;
    actionTaken?: string;
    incidentDate?: string;
    parentNotified?: boolean;
    followUpRequired?: boolean;
    followUpNotes?: string;
}): Promise<LogIncidentResult> {
    const { tenantId, userId } = await requireAuth('health:write');

    const studentId = input.studentId?.trim();
    const description = input.description?.trim();

    if (!studentId) return { success: false, error: 'Select the student this incident concerns.' };
    if (!description) return { success: false, error: 'Describe what happened.' };
    if (!isIncidentType(input.type)) return { success: false, error: 'Choose a valid incident category.' };

    const { rows: studentRows } = await pool.query(
        `SELECT id FROM students WHERE id = $1 AND tenant_id = $2`,
        [studentId, tenantId],
    );
    if (studentRows.length === 0) {
        return { success: false, error: 'That student is not on this school roll.' };
    }

    let incidentDate: Date | null = null;
    if (input.incidentDate) {
        const parsed = new Date(input.incidentDate);
        if (Number.isNaN(parsed.getTime())) {
            return { success: false, error: 'The incident date and time could not be read.' };
        }
        if (parsed.getTime() > Date.now() + 60_000) {
            return { success: false, error: 'An incident cannot be recorded in the future.' };
        }
        incidentDate = parsed;
    }

    const parentNotified = Boolean(input.parentNotified);
    const followUpRequired = Boolean(input.followUpRequired);

    const { rows } = await pool.query(
        `INSERT INTO health_incidents (
             tenant_id, student_id, incident_date, type, description, action_taken,
             reported_by, parent_notified, parent_notified_at,
             follow_up_required, follow_up_notes
         ) VALUES (
             $1, $2, COALESCE($3::timestamptz, now()), $4::health_incident_type, $5, $6,
             $7, $8, $9,
             $10, $11
         )
         RETURNING id`,
        [
            tenantId,
            studentId,
            incidentDate,
            input.type,
            description,
            input.actionTaken?.trim() || null,
            userId,
            parentNotified,
            parentNotified ? new Date() : null,
            followUpRequired,
            input.followUpNotes?.trim() || null,
        ],
    );

    revalidatePath('/health');

    return { success: true, incidentId: rows[0]?.id as string | undefined };
}
