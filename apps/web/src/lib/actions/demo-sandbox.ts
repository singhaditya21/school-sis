'use server';

import crypto from 'crypto';
import { hash } from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { getIronSession } from 'iron-session';
import {
    RLS_BYPASS_JUSTIFICATIONS,
    runWithRlsBypass,
    sql,
    sqlFor,
    withTenant,
} from '@/lib/db';
import {
    AI_PRO_DEFAULT_MODULES,
    DEMO_SANDBOX_COMPANY_NAME,
    DEMO_SANDBOX_TENANT_CODE,
} from '@/lib/auth/platform-owner';
import { establishSession } from '@/lib/auth/identity';
import { sessionOptions, type SessionData } from '@/lib/auth/session';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import {
    decryptFieldTolerant,
    encryptEmail,
    encryptEmailCandidates,
    encryptPhone,
} from '@/lib/encryption';
import { recordManualPayment } from '@/lib/payments/ledger';
import { logger } from '@/lib/observability/logger';

export type DemoPersonaKey = 'FINANCE_LEAD' | 'REGISTRAR' | 'TEACHER' | 'PARENT';

interface PersonaConfig {
    key: DemoPersonaKey;
    role: string;
    email: string;
    firstName: string;
    lastName: string;
    redirectTo: string;
}

const DEMO_PERSONAS: Record<DemoPersonaKey, PersonaConfig> = {
    FINANCE_LEAD: {
        key: 'FINANCE_LEAD',
        role: 'FINANCE_LEAD',
        email: 'demo.finance@scholarmind.app',
        firstName: 'Raghav',
        lastName: 'Mehta',
        redirectTo: '/dashboard',
    },
    REGISTRAR: {
        key: 'REGISTRAR',
        role: 'REGISTRAR',
        email: 'demo.registrar@scholarmind.app',
        firstName: 'Neha',
        lastName: 'Kulkarni',
        redirectTo: '/students',
    },
    TEACHER: {
        key: 'TEACHER',
        role: 'TEACHER',
        email: 'demo.teacher@scholarmind.app',
        firstName: 'Kavita',
        lastName: 'Deshmukh',
        redirectTo: '/teacher',
    },
    PARENT: {
        key: 'PARENT',
        role: 'PARENT',
        email: 'demo.parent@scholarmind.app',
        firstName: 'Vikram',
        lastName: 'Sharma',
        redirectTo: '/overview',
    },
};

async function enforceDemoRateLimit(): Promise<string | null> {
    let clientIp: string | null = null;
    try {
        const hdrs = await headers();
        const forwarded =
            hdrs.get('x-vercel-forwarded-for') ||
            hdrs.get('x-real-ip') ||
            hdrs.get('x-forwarded-for');
        clientIp = forwarded?.split(',')[0]?.trim() || null;
    } catch {
        clientIp = null;
    }

    if (!clientIp) return null;

    return consumeRateLimit(clientIp, {
        scope: 'demo_sandbox_ip',
        maxAttempts: 25,
        degradedMaxAttempts: 8,
        endpointClass: 'public-write',
        message: 'Too many demo session launches from this network. Please wait a minute and try again.',
    });
}

async function ensureDemoTenantAndUsers(): Promise<{
    companyId: string;
    tenantId: string;
    tenantDomain: string;
    usersByRole: Record<DemoPersonaKey, { id: string; email: string; displayName: string }>;
}> {
    return runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.TENANT_PROVISIONING, async () => {
        const domainUrl = 'demo-campus.scholarmind.app';
        const existingTenant = await sql<{ id: string; companyId: string | null; domain: string | null }>`
            SELECT id, company_id AS "companyId", domain
            FROM tenants
            WHERE upper(code) = ${DEMO_SANDBOX_TENANT_CODE}
            LIMIT 1
        `;

        let companyId = existingTenant[0]?.companyId || '';
        let tenantId = existingTenant[0]?.id || '';

        if (!tenantId) {
            const companyRows = await sql<{ id: string }>`
                INSERT INTO companies (name, subscription_tier, billing_status, active_modules, is_active)
                VALUES (
                    ${DEMO_SANDBOX_COMPANY_NAME},
                    ${'AI_PRO'},
                    ${'ACTIVE'},
                    ${[...AI_PRO_DEFAULT_MODULES]}::text[],
                    ${true}
                )
                RETURNING id
            `;
            companyId = companyRows[0].id;

            const tenantRows = await sql<{ id: string }>`
                INSERT INTO tenants (company_id, name, code, domain, email, city, state, affiliation_board, is_active)
                VALUES (
                    ${companyId},
                    ${DEMO_SANDBOX_COMPANY_NAME},
                    ${DEMO_SANDBOX_TENANT_CODE},
                    ${domainUrl},
                    ${'sandbox@scholarmind.app'},
                    ${'New Delhi'},
                    ${'Delhi'},
                    ${'CBSE'},
                    ${true}
                )
                RETURNING id
            `;
            tenantId = tenantRows[0].id;
        } else if (!companyId) {
            const companyRows = await sql<{ id: string }>`
                INSERT INTO companies (name, subscription_tier, billing_status, active_modules, is_active)
                VALUES (
                    ${DEMO_SANDBOX_COMPANY_NAME},
                    ${'AI_PRO'},
                    ${'ACTIVE'},
                    ${[...AI_PRO_DEFAULT_MODULES]}::text[],
                    ${true}
                )
                RETURNING id
            `;
            companyId = companyRows[0].id;
            await sql`
                UPDATE tenants
                SET company_id = ${companyId}, is_active = ${true}, updated_at = NOW()
                WHERE id = ${tenantId}
            `;
        }

        const lockedPasswordHash = await hash(crypto.randomBytes(24).toString('hex'), 10);
        const usersByRole = {} as Record<DemoPersonaKey, { id: string; email: string; displayName: string }>;

        for (const persona of Object.values(DEMO_PERSONAS)) {
            const existingUsers = await sql<{
                id: string;
                email: string | null;
                firstName: string;
                lastName: string;
            }>`
                SELECT
                    id,
                    COALESCE(email_enc, email) AS email,
                    first_name AS "firstName",
                    last_name AS "lastName"
                FROM users
                WHERE tenant_id = ${tenantId}
                  AND (email_enc = ANY(${encryptEmailCandidates(persona.email)}::text[]) OR lower(email) = lower(${persona.email}))
                LIMIT 1
            `;

            if (existingUsers[0]) {
                const u = existingUsers[0];
                usersByRole[persona.key] = {
                    id: u.id,
                    email: u.email ? decryptFieldTolerant(u.email) : persona.email,
                    displayName: `${u.firstName} ${u.lastName}`,
                };
                continue;
            }

            const inserted = await sql<{ id: string }>`
                INSERT INTO users (tenant_id, email_enc, password_hash, first_name, last_name, role, is_active)
                VALUES (
                    ${tenantId},
                    ${encryptEmail(persona.email)},
                    ${lockedPasswordHash},
                    ${persona.firstName},
                    ${persona.lastName},
                    ${persona.role},
                    ${true}
                )
                RETURNING id
            `;

            usersByRole[persona.key] = {
                id: inserted[0].id,
                email: persona.email,
                displayName: `${persona.firstName} ${persona.lastName}`,
            };
        }

        return {
            companyId,
            tenantId,
            tenantDomain: existingTenant[0]?.domain || domainUrl,
            usersByRole,
        };
    });
}

async function ensureDemoSchoolDataSeeded(
    tenantId: string,
    usersByRole: Record<DemoPersonaKey, { id: string; email: string; displayName: string }>,
): Promise<void> {
    let paidInvoiceToSettle: string | null = null;

    await withTenant(tenantId, async (client) => {
        const q = sqlFor(client);
        const countRow = await q<{ count: number }>`
            SELECT count(*)::int AS count FROM students WHERE tenant_id = ${tenantId}
        `.one();

        if ((countRow?.count ?? 0) > 0) {
            return;
        }

        const yearRow = await q<{ id: string }>`
            INSERT INTO academic_years (tenant_id, name, start_date, end_date, is_current)
            VALUES (${tenantId}, '2026-27', '2026-04-01', '2027-03-31', true)
            RETURNING id
        `.one();
        const yearId = yearRow.id;

        await q`
            INSERT INTO terms (tenant_id, academic_year_id, name, type, start_date, end_date)
            VALUES
                (${tenantId}, ${yearId}, 'Term 1', 'TERM_1', '2026-04-01', '2026-09-30'),
                (${tenantId}, ${yearId}, 'Term 2', 'TERM_2', '2026-10-01', '2027-03-31')
        `.execute();

        const grade6 = await q<{ id: string }>`
            INSERT INTO grades (tenant_id, name, numeric_value, display_order)
            VALUES (${tenantId}, 'Grade 6', 6, 1)
            RETURNING id
        `.one();
        const grade8 = await q<{ id: string }>`
            INSERT INTO grades (tenant_id, name, numeric_value, display_order)
            VALUES (${tenantId}, 'Grade 8', 8, 2)
            RETURNING id
        `.one();
        const grade10 = await q<{ id: string }>`
            INSERT INTO grades (tenant_id, name, numeric_value, display_order)
            VALUES (${tenantId}, 'Grade 10', 10, 3)
            RETURNING id
        `.one();

        const sec6A = await q<{ id: string }>`
            INSERT INTO sections (tenant_id, grade_id, academic_year_id, name, capacity)
            VALUES (${tenantId}, ${grade6.id}, ${yearId}, 'A', 40)
            RETURNING id
        `.one();
        const sec8A = await q<{ id: string }>`
            INSERT INTO sections (tenant_id, grade_id, academic_year_id, name, capacity)
            VALUES (${tenantId}, ${grade8.id}, ${yearId}, 'A', 40)
            RETURNING id
        `.one();
        const sec10A = await q<{ id: string }>`
            INSERT INTO sections (tenant_id, grade_id, academic_year_id, name, capacity)
            VALUES (${tenantId}, ${grade10.id}, ${yearId}, 'A', 40)
            RETURNING id
        `.one();

        await q`
            INSERT INTO subjects (tenant_id, name, code, is_elective)
            VALUES
                (${tenantId}, 'Mathematics', 'MATH', false),
                (${tenantId}, 'Science', 'SCI', false),
                (${tenantId}, 'English', 'ENG', false),
                (${tenantId}, 'Social Studies', 'SST', false)
        `.execute();

        await q`
            INSERT INTO periods (tenant_id, name, start_time, end_time, display_order, is_break)
            VALUES
                (${tenantId}, 'Period 1', '08:30', '09:15', 1, 0),
                (${tenantId}, 'Period 2', '09:15', '10:00', 2, 0),
                (${tenantId}, 'Recess', '10:00', '10:20', 3, 1),
                (${tenantId}, 'Period 3', '10:20', '11:05', 4, 0)
        `.execute();

        const aarav = await q<{ id: string }>`
            INSERT INTO students (
                tenant_id, admission_number, first_name, last_name, date_of_birth, gender,
                blood_group, grade_id, section_id, roll_number, admission_date, city, state, pincode, status
            ) VALUES (
                ${tenantId}, 'ADM-DEMO-101', 'Aarav', 'Sharma', '2014-05-14', 'MALE',
                'B+', ${grade6.id}, ${sec6A.id}, 1, '2026-04-01', 'New Delhi', 'Delhi', '110016', 'ACTIVE'
            )
            RETURNING id
        `.one();

        const diya = await q<{ id: string }>`
            INSERT INTO students (
                tenant_id, admission_number, first_name, last_name, date_of_birth, gender,
                blood_group, grade_id, section_id, roll_number, admission_date, city, state, pincode, status
            ) VALUES (
                ${tenantId}, 'ADM-DEMO-102', 'Diya', 'Sharma', '2012-08-22', 'FEMALE',
                'O+', ${grade8.id}, ${sec8A.id}, 2, '2026-04-01', 'New Delhi', 'Delhi', '110016', 'ACTIVE'
            )
            RETURNING id
        `.one();

        const kabir = await q<{ id: string }>`
            INSERT INTO students (
                tenant_id, admission_number, first_name, last_name, date_of_birth, gender,
                blood_group, grade_id, section_id, roll_number, admission_date, city, state, pincode, status
            ) VALUES (
                ${tenantId}, 'ADM-DEMO-103', 'Kabir', 'Nair', '2010-11-09', 'MALE',
                'A+', ${grade10.id}, ${sec10A.id}, 3, '2026-04-01', 'Gurugram', 'Haryana', '122002', 'ACTIVE'
            )
            RETURNING id
        `.one();

        const ananya = await q<{ id: string }>`
            INSERT INTO students (
                tenant_id, admission_number, first_name, last_name, date_of_birth, gender,
                blood_group, grade_id, section_id, roll_number, admission_date, city, state, pincode, status
            ) VALUES (
                ${tenantId}, 'ADM-DEMO-104', 'Ananya', 'Iyer', '2010-02-19', 'FEMALE',
                'AB+', ${grade10.id}, ${sec10A.id}, 4, '2026-04-01', 'Noida', 'Uttar Pradesh', '201301', 'ACTIVE'
            )
            RETURNING id
        `.one();

        const parentUserId = usersByRole.PARENT.id;
        await q`
            INSERT INTO guardians (
                tenant_id, user_id, student_id, relation, first_name, last_name,
                email_enc, phone_enc, is_emergency_contact, is_primary
            ) VALUES
                (
                    ${tenantId}, ${parentUserId}, ${aarav.id}, 'FATHER', 'Vikram', 'Sharma',
                    ${encryptEmail('demo.parent@scholarmind.app')}, ${encryptPhone('+919810012345')}, true, true
                ),
                (
                    ${tenantId}, ${parentUserId}, ${diya.id}, 'FATHER', 'Vikram', 'Sharma',
                    ${encryptEmail('demo.parent@scholarmind.app')}, ${encryptPhone('+919810012345')}, true, true
                ),
                (
                    ${tenantId}, ${null}, ${kabir.id}, 'MOTHER', 'Meenakshi', 'Nair',
                    ${encryptEmail('meenakshi.nair.demo@example.org')}, ${encryptPhone('+919820054321')}, true, true
                ),
                (
                    ${tenantId}, ${null}, ${ananya.id}, 'FATHER', 'Subramanian', 'Iyer',
                    ${encryptEmail('subramanian.iyer.demo@example.org')}, ${encryptPhone('+919840098765')}, true, true
                )
        `.execute();

        const feePlan = await q<{ id: string }>`
            INSERT INTO fee_plans (tenant_id, academic_year_id, name, description, is_active)
            VALUES (
                ${tenantId},
                ${yearId},
                'Quarterly Tuition & Smart Classroom 2026-27',
                'Standard CBSE composite tuition and digital lab fee schedule',
                true
            )
            RETURNING id
        `.one();

        await q`
            INSERT INTO fee_components (fee_plan_id, name, amount, frequency, is_optional)
            VALUES
                (${feePlan.id}, 'Composite Tuition Fee', '18500.00', 'QUARTERLY', false),
                (${feePlan.id}, 'Smart Classroom & STEM Lab', '4000.00', 'QUARTERLY', false)
        `.execute();

        const lineItemsJson = JSON.stringify([
            { name: 'Composite Tuition Fee', amount: '18500.00', frequency: 'QUARTERLY', isOptional: false },
            { name: 'Smart Classroom & STEM Lab', amount: '4000.00', frequency: 'QUARTERLY', isOptional: false },
        ]);

        const invAarav = await q<{ id: string }>`
            INSERT INTO invoices (
                tenant_id, student_id, fee_plan_id, invoice_number, total_amount, paid_amount,
                due_date, status, description, line_items
            ) VALUES (
                ${tenantId}, ${aarav.id}, ${feePlan.id}, 'INV-DEMO-2026-001', '22500.00', '0.00',
                '2026-04-15', 'PENDING', 'Q1 Tuition & Smart Lab Fee (2026-27)', ${lineItemsJson}::jsonb
            )
            RETURNING id
        `.one();
        paidInvoiceToSettle = invAarav.id;

        await q`
            INSERT INTO invoices (
                tenant_id, student_id, fee_plan_id, invoice_number, total_amount, paid_amount,
                due_date, status, description, line_items
            ) VALUES
                (
                    ${tenantId}, ${diya.id}, ${feePlan.id}, 'INV-DEMO-2026-002', '22500.00', '0.00',
                    '2026-12-15', 'PENDING', 'Q3 Tuition & Smart Lab Fee (2026-27)', ${lineItemsJson}::jsonb
                ),
                (
                    ${tenantId}, ${kabir.id}, ${feePlan.id}, 'INV-DEMO-2026-003', '22500.00', '7500.00',
                    '2026-08-10', 'PARTIAL', 'Q2 Tuition & Smart Lab Fee (Overdue Balance)', ${lineItemsJson}::jsonb
                ),
                (
                    ${tenantId}, ${ananya.id}, ${feePlan.id}, 'INV-DEMO-2026-004', '22500.00', '0.00',
                    '2026-07-05', 'PENDING', 'Q2 Tuition & Smart Lab Fee (Overdue)', ${lineItemsJson}::jsonb
                )
        `.execute();
    });

    if (paidInvoiceToSettle) {
        await recordManualPayment({
            tenantId,
            invoiceId: paidInvoiceToSettle,
            amount: 22500,
            method: 'UPI',
            actorUserId: usersByRole.FINANCE_LEAD.id,
            reference: 'UPI-DEMO-UTR-8849201',
            metadata: { remarks: 'Paid via Parent UPI Intent (Sandbox Seed)' },
        }).catch(() => undefined);
    }
}

export async function launchDemoSandboxAction(personaKey: DemoPersonaKey): Promise<{
    success?: boolean;
    redirectTo?: string;
    error?: string;
}> {
    const persona = DEMO_PERSONAS[personaKey];
    if (!persona) {
        return { error: 'Select a valid demo role to launch.' };
    }

    try {
        const rateError = await enforceDemoRateLimit();
        if (rateError) {
            return { error: rateError };
        }

        const { companyId, tenantId, tenantDomain, usersByRole } = await ensureDemoTenantAndUsers();
        await ensureDemoSchoolDataSeeded(tenantId, usersByRole);

        const targetUser = usersByRole[personaKey];
        const cookieStore = await cookies();
        const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

        establishSession(session, {
            userId: targetUser.id,
            tenantId,
            tenantCode: DEMO_SANDBOX_TENANT_CODE,
            tenantDomain,
            role: persona.role,
            email: targetUser.email,
            provider: 'system',
            displayName: `${targetUser.displayName} (Demo)`,
            companyId,
            subscriptionTier: 'AI_PRO',
            activeModules: [...AI_PRO_DEFAULT_MODULES],
            mfaEnabled: false,
            mfaVerified: false,
        });
        await session.save();

        return {
            success: true,
            redirectTo: persona.redirectTo,
        };
    } catch (error) {
        logger.error('demo.launch_failed', 'Failed to launch interactive demo sandbox', {
            source: 'demo-sandbox',
            metadata: {
                personaKey,
                error: error instanceof Error ? error.message : String(error),
            },
        });
        return { error: 'Unable to launch demo campus right now. Please try again in a moment.' };
    }
}
