'use server';

/**
 * DPDPA right-to-erasure for a student's personal data.
 *
 * The only "removal" the product had was an archive — a status flip that leaves
 * every identifying field in place. A data principal's erasure request could not
 * actually erase anything. This does.
 *
 * It ANONYMISES IN PLACE rather than hard-deleting: invoices, payments and
 * attendance reference the student row, and deleting it would orphan or cascade
 * a school's financial and academic records. So the row survives for referential
 * integrity while every piece of identifying PII — the child's and the
 * guardians' — is stripped. That is the erasure a school can lawfully perform:
 * the person is no longer identifiable, the ledger still balances.
 *
 * Runs inside withTenant so the queries carry the RLS tenant context (without it,
 * FORCE RLS would make the rows invisible and the erase a silent no-op), in one
 * transaction, with the audit row written on the same client so the record of the
 * erasure commits atomically with the erasure itself. Idempotent — re-erasing an
 * already-erased record changes nothing new.
 */

import { withTenant } from '@/lib/db';

const REDACTED = '[erased]';

export interface ErasureResult {
    erased: boolean;
    studentId: string;
    guardiansErased: number;
    alreadyErased: boolean;
}

export async function anonymizeStudentRecord(input: {
    tenantId: string;
    studentId: string;
    actorUserId: string;
    reason: string;
}): Promise<ErasureResult> {
    const { tenantId, studentId, actorUserId, reason } = input;

    return withTenant(tenantId, async (client) => {
        const { rows: existing } = await client.query<{
            admissionNumber: string;
            alreadyErased: boolean;
        }>(
            `SELECT admission_number AS "admissionNumber",
                    COALESCE((custom_data->>'erased')::boolean, false) AS "alreadyErased"
             FROM students WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
            [studentId, tenantId],
        );
        if (existing.length === 0) {
            throw new Error('Student not found in this tenant.');
        }
        const { admissionNumber, alreadyErased } = existing[0];

        // Strip every identifying field. NOT NULL columns get a redaction
        // placeholder; the rest are nulled. date_of_birth is NOT NULL, so it
        // becomes a fixed sentinel rather than a real date.
        await client.query(
            `UPDATE students SET
                 first_name = $3,
                 last_name = $3,
                 date_of_birth = DATE '1970-01-01',
                 blood_group = NULL,
                 aadhaar_number = NULL,
                 aadhaar_number_enc = NULL,
                 apaar_id = NULL,
                 apaar_id_enc = NULL,
                 address = NULL,
                 city = NULL,
                 state = NULL,
                 pincode = NULL,
                 photo_url = NULL,
                 medical_notes = NULL,
                 custom_data = COALESCE(custom_data, '{}'::jsonb)
                     || jsonb_build_object('erased', true),
                 updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2`,
            [studentId, tenantId, REDACTED],
        );

        const { rowCount: guardiansErased } = await client.query(
            `UPDATE guardians SET
                 first_name = $3,
                 last_name = $3,
                 email = NULL,
                 phone = NULL,
                 alternate_phone = NULL,
                 address = NULL,
                 occupation = NULL,
                 annual_income = NULL
             WHERE student_id = $1 AND tenant_id = $2`,
            [studentId, tenantId, REDACTED],
        );

        // Audit the erasure on the same client — who erased which record, and
        // why — so the record commits with the erasure, never apart from it.
        await client.query(
            `INSERT INTO audit_logs (
                 tenant_id, user_id, action, entity_type, entity_id, description
             ) VALUES ($1, $2, 'DELETE', 'student', $3, $4)`,
            [
                tenantId,
                actorUserId,
                studentId,
                `Erased personal data for student ${admissionNumber}: ${reason}`,
            ],
        );

        return {
            erased: true,
            studentId,
            guardiansErased: guardiansErased ?? 0,
            alreadyErased,
        };
    });
}
