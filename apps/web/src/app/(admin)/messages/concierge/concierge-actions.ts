'use server';

import { headers } from 'next/headers';
import { sqlFor, withTenant } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { decryptFieldTolerant } from '@/lib/encryption';
import { maskPhoneNumber } from '@/lib/payments/payment-links';
import { whatsAppAvailability } from '@/lib/providers/whatsapp';
import {
    resolveConciergeReplyForTenant,
    type ConciergeReplyResult,
} from '@/lib/concierge/whatsapp-concierge';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ConciergeGuardianOption {
    studentId: string;
    guardianUserId: string | null;
    guardianName: string;
    relation: string;
    phoneMasked: string;
    studentName: string;
    classLabel: string;
}

export async function getConciergeStudioDataAction(): Promise<{
    schoolName: string;
    webhookUrl: string;
    providerState: {
        provider: string;
        available: boolean;
        reason?: string;
        webhookSecretConfigured: boolean;
        verifyTokenConfigured: boolean;
    };
    guardians: ConciergeGuardianOption[];
}> {
    const { tenantId } = await requireAuth('messaging:read');
    const hdrs = await headers();
    const host = hdrs.get('x-forwarded-host') || hdrs.get('host') || 'school-sis-web.vercel.app';
    const proto = hdrs.get('x-forwarded-proto') || 'https';
    const origin = (process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`).replace(/\/+$/, '');

    const availability = whatsAppAvailability();

    return withTenant(tenantId, async (client) => {
        const q = sqlFor(client);
        const tenantRow = await q<{ name: string }>`
            SELECT name FROM tenants WHERE id = ${tenantId} LIMIT 1
        `.maybeOne();

        const rows = await q<{
            studentId: string;
            guardianUserId: string | null;
            firstName: string;
            lastName: string;
            relation: string;
            phoneEnc: string | null;
            studentName: string;
            gradeName: string;
            sectionName: string;
        }>`
            SELECT
                s.id AS "studentId",
                gd.user_id AS "guardianUserId",
                gd.first_name AS "firstName",
                gd.last_name AS "lastName",
                gd.relation::text AS relation,
                gd.phone_enc AS "phoneEnc",
                s.first_name || ' ' || s.last_name AS "studentName",
                g.name AS "gradeName",
                sec.name AS "sectionName"
            FROM guardians gd
            JOIN students s ON s.id = gd.student_id AND s.tenant_id = gd.tenant_id
            JOIN grades g ON g.id = s.grade_id AND g.tenant_id = gd.tenant_id
            JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = gd.tenant_id
            WHERE gd.tenant_id = ${tenantId}
              AND s.status = 'ACTIVE'
            ORDER BY gd.user_id IS NOT NULL DESC, gd.is_primary DESC, s.first_name ASC
            LIMIT 25
        `;

        const seenKeys = new Set<string>();
        const guardians: ConciergeGuardianOption[] = [];

        for (const r of rows) {
            const dedupeKey = r.guardianUserId ? `user:${r.guardianUserId}` : `student:${r.studentId}`;
            if (seenKeys.has(dedupeKey)) continue;
            seenKeys.add(dedupeKey);

            const plainPhone = r.phoneEnc ? decryptFieldTolerant(r.phoneEnc) : null;
            guardians.push({
                studentId: r.studentId,
                guardianUserId: r.guardianUserId,
                guardianName: `${r.firstName} ${r.lastName}`.trim(),
                relation: r.relation,
                phoneMasked: maskPhoneNumber(plainPhone) ?? 'Verified Guardian',
                studentName: r.studentName,
                classLabel: `${r.gradeName}-${r.sectionName}`,
            });
        }

        return {
            schoolName: tenantRow?.name ?? 'ScholarMind Campus',
            webhookUrl: `${origin}/api/webhooks/whatsapp`,
            providerState: {
                provider: availability.provider,
                available: availability.available,
                reason: availability.reason,
                webhookSecretConfigured: Boolean(
                    process.env.WHATSAPP_WEBHOOK_SECRET || process.env.WHATSAPP_APP_SECRET,
                ),
                verifyTokenConfigured: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
            },
            guardians,
        };
    });
}

export async function simulateConciergeMessageAction(input: {
    studentId: string;
    guardianUserId?: string | null;
    rawText: string;
}): Promise<{ reply?: ConciergeReplyResult; error?: string }> {
    const { tenantId } = await requireAuth('messaging:read');

    if (!UUID_RE.test(input.studentId)) {
        return { error: 'Select a valid campus guardian to test.' };
    }

    const hdrs = await headers();
    const host = hdrs.get('x-forwarded-host') || hdrs.get('host') || 'school-sis-web.vercel.app';
    const proto = hdrs.get('x-forwarded-proto') || 'https';
    const origin = (process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`).replace(/\/+$/, '');

    const reply = await resolveConciergeReplyForTenant({
        tenantId,
        rawText: input.rawText.slice(0, 200),
        appOrigin: origin,
        guardianUserId:
            input.guardianUserId && UUID_RE.test(input.guardianUserId) ? input.guardianUserId : null,
        guardianStudentId: input.studentId,
    });

    if (!reply) {
        return { error: 'No active guardian or student record matched in this campus.' };
    }

    return { reply };
}
