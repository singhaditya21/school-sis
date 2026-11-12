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

import { sqlFor, withTenant } from '@/lib/db';
import { deleteStoredObjectBestEffort } from '@/lib/storage/s3-config';

const REDACTED = '[erased]';

function extractTenantStorageKey(fileUrl: string | null | undefined, tenantId: string): string | null {
    if (!fileUrl) return null;
    const trimmed = fileUrl.trim();
    if (!trimmed) return null;

    const withoutQuery = trimmed.split('?')[0] ?? '';
    const apiFilesMarker = '/api/files/';
    const markerIdx = withoutQuery.indexOf(apiFilesMarker);
    const candidate = (
        markerIdx >= 0
            ? withoutQuery.slice(markerIdx + apiFilesMarker.length)
            : withoutQuery
    ).replace(/^\/+/, '');

    if (!candidate || candidate.includes('..') || !candidate.startsWith(`${tenantId}/`)) {
        return null;
    }
    return candidate;
}

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
    const storageKeysToDelete = new Set<string>();

    const result = await withTenant(tenantId, async (client) => {
        const q = sqlFor(client);
        const existing = await q<{
            userId: string | null;
            photoUrl: string | null;
            alreadyErased: boolean;
        }>`
            SELECT user_id AS "userId",
                   photo_url AS "photoUrl",
                   COALESCE((custom_data->>'erased')::boolean, false) AS "alreadyErased"
            FROM students WHERE id = ${studentId} AND tenant_id = ${tenantId} FOR UPDATE
        `;
        if (existing.length === 0) {
            throw new Error('Student not found in this tenant.');
        }
        const { userId: studentUserId, photoUrl, alreadyErased } = existing[0];
        const photoKey = extractTenantStorageKey(photoUrl, tenantId);
        if (photoKey) storageKeysToDelete.add(photoKey);

        // Strip every identifying field and completely wipe custom_data JSONB PII.
        await q`
            UPDATE students SET
                first_name = ${REDACTED},
                last_name = ${REDACTED},
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
                custom_data = jsonb_build_object('erased', true)
                    || jsonb_build_object('erasedAt', NOW()),
                updated_at = NOW()
            WHERE id = ${studentId} AND tenant_id = ${tenantId}
        `;

        // Scrub clinical & medical records
        await q`
            UPDATE health_records SET
                blood_group = NULL,
                height = NULL,
                weight = NULL,
                allergies = '[]'::jsonb,
                conditions = '[]'::jsonb,
                medications = '[]'::jsonb,
                emergency_contact = NULL,
                emergency_phone = NULL,
                emergency_phone_enc = NULL,
                doctor_name = NULL,
                doctor_phone = NULL,
                doctor_phone_enc = NULL,
                insurance_id = NULL,
                insurance_provider = NULL,
                notes = NULL,
                updated_at = NOW()
            WHERE tenant_id = ${tenantId} AND student_id = ${studentId}
        `.execute();

        await q`
            DELETE FROM nurse_visit_logs
            WHERE tenant_id = ${tenantId} AND student_id = ${studentId}
        `.execute();

        await q`
            DELETE FROM medication_schedules
            WHERE tenant_id = ${tenantId} AND student_id = ${studentId}
        `.execute();

        await q`
            DELETE FROM immunizations
            WHERE tenant_id = ${tenantId} AND student_id = ${studentId}
        `.execute();

        // Scrub visa / passport PII
        await q`
            UPDATE student_visas SET
                passport_number = NULL,
                passport_number_enc = NULL
            WHERE tenant_id = ${tenantId} AND student_id = ${studentId}
        `.execute();

        // Collect & delete student document metadata rows; storage objects are purged post-commit
        const docRows = await q<{ fileUrl: string | null }>`
            SELECT file_url AS "fileUrl"
            FROM student_documents
            WHERE tenant_id = ${tenantId} AND student_id = ${studentId}
        `;
        for (const doc of docRows) {
            const key = extractTenantStorageKey(doc.fileUrl, tenantId);
            if (key) storageKeysToDelete.add(key);
        }

        await q`
            DELETE FROM student_documents
            WHERE tenant_id = ${tenantId} AND student_id = ${studentId}
        `.execute();

        // Deactivate and scrub linked student user account if present
        if (studentUserId) {
            await q`
                UPDATE users SET
                    is_active = false,
                    session_version = session_version + 1,
                    first_name = 'Erased',
                    last_name = 'User',
                    email = NULL,
                    email_enc = NULL,
                    phone = NULL,
                    phone_enc = NULL,
                    avatar_url = NULL,
                    updated_at = NOW()
                WHERE id = ${studentUserId} AND tenant_id = ${tenantId}
            `.execute();
        }

        const updatedGuardianRows = await q<{ userId: string | null }>`
            UPDATE guardians SET
                first_name = ${REDACTED},
                last_name = ${REDACTED},
                email = NULL,
                email_enc = NULL,
                phone = NULL,
                phone_enc = NULL,
                alternate_phone = NULL,
                alternate_phone_enc = NULL,
                address = NULL,
                occupation = NULL,
                annual_income = NULL,
                updated_at = NOW()
            WHERE student_id = ${studentId} AND tenant_id = ${tenantId}
            RETURNING user_id AS "userId"
        `;

        const candidateGuardianUserIds = Array.from(
            new Set(
                updatedGuardianRows
                    .map((g) => g.userId)
                    .filter((id): id is string => Boolean(id)),
            ),
        );

        if (candidateGuardianUserIds.length > 0) {
            await q`
                UPDATE users u SET
                    is_active = false,
                    session_version = u.session_version + 1,
                    first_name = 'Erased',
                    last_name = 'User',
                    email = NULL,
                    email_enc = NULL,
                    phone = NULL,
                    phone_enc = NULL,
                    avatar_url = NULL,
                    updated_at = NOW()
                WHERE u.tenant_id = ${tenantId}
                  AND u.id = ANY(${candidateGuardianUserIds}::uuid[])
                  AND u.role = 'PARENT'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM guardians g2
                      JOIN students s2 ON s2.id = g2.student_id AND s2.tenant_id = g2.tenant_id
                      WHERE g2.tenant_id = ${tenantId}
                        AND g2.user_id = u.id
                        AND g2.student_id <> ${studentId}
                        AND COALESCE((s2.custom_data->>'erased')::boolean, false) = false
                  )
            `.execute();
        }

        // Audit the erasure on the same client without recording raw admission numbers or names.
        await q`
            INSERT INTO audit_logs (
                tenant_id, user_id, action, entity_type, entity_id, description
            ) VALUES (
                ${tenantId},
                ${actorUserId},
                'DELETE', 'student',
                ${studentId},
                ${`Erased personal data for student UUID ${studentId}: ${reason}`}
            )
        `;

        return {
            erased: true,
            studentId,
            guardiansErased: updatedGuardianRows.length,
            alreadyErased,
        };
    });

    if (storageKeysToDelete.size > 0) {
        await Promise.allSettled(
            Array.from(storageKeysToDelete).map((key) => deleteStoredObjectBestEffort(key)),
        );
    }

    return result;
}
