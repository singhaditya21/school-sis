'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { sqlFor, withTenant } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { hasPermission, type UserRole } from '@/lib/rbac/permissions';
import { isDemoSession, isDemoTenantId } from '@/lib/tenant/demo-guard';
import { encryptEmail, encryptPhone } from '@/lib/encryption';
import {
    ALL_TARGET_FIELD_KEYS,
    analyzeSpreadsheetAnomalies,
    autoMapLegacyColumns,
    buildPiiMaskedSampleForAi,
    inferColumnsFromSampleCells,
    normalizeLegacyRow,
    parseDelimitedSpreadsheet,
    type ColumnMapping,
    type LegacyErpPreset,
    type TargetFieldKey,
} from '@/lib/import/legacy-erp-parser';
import { createAiModel } from '@/lib/ai/runtime';
import { resolveAiProviderChain } from '@/lib/ai/provider';
import { redactPiiForExternalLlm } from '@/lib/ai/telemetry';
import { generateText } from 'ai';
import { logger } from '@/lib/observability/logger';

const MAX_IMPORT_ROWS = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PreviewRowStatus = 'READY' | 'SKIP_DUPLICATE' | 'ERROR';

export interface PreviewSampleRow {
    rowNumber: number;
    admissionNumber: string;
    studentName: string;
    gradeSection: string;
    guardianSummary: string;
    openingBalanceInr: number;
    status: PreviewRowStatus;
    notes: string;
}

export interface LegacyImportPreviewResult {
    ok: boolean;
    error?: string;
    headers?: string[];
    resolvedMapping?: ColumnMapping;
    totalRows?: number;
    readyCount?: number;
    duplicateCount?: number;
    errorCount?: number;
    totalOpeningBalanceInr?: number;
    siblingPhoneMatches?: number;
    newGradesToCreate?: string[];
    sampleRows?: PreviewSampleRow[];
}

export interface LegacyImportCommitResult {
    ok: boolean;
    error?: string;
    batchId?: string;
    studentsCreated?: number;
    guardiansCreated?: number;
    openingInvoicesCreated?: number;
    gradesCreated?: number;
    duplicatesSkipped?: number;
    totalOpeningBalanceInr?: number;
}

export interface LegacyImportBatchItem {
    batchId: string;
    sourceErp: string;
    createdAt: string;
    studentsCreated: number;
    guardiansCreated: number;
    openingInvoicesCreated: number;
    totalOpeningBalanceInr: number;
    rolledBack: boolean;
}

export async function previewLegacyImportAction(input: {
    csvText: string;
    mapping?: ColumnMapping;
    sourceErp?: LegacyErpPreset;
}): Promise<LegacyImportPreviewResult> {
    const { tenantId } = await requireAuth('students:write');

    const raw = (input.csvText || '').trim();
    if (!raw) {
        return { ok: false, error: 'Upload or paste a CSV / Excel export first.' };
    }
    if (Buffer.byteLength(raw, 'utf8') > 5 * 1024 * 1024) {
        return { ok: false, error: 'CSV payload exceeds 5 MB batch limit.' };
    }

    const parsed = parseDelimitedSpreadsheet(raw);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        return { ok: false, error: 'No data rows detected in the uploaded file.' };
    }
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
        return {
            ok: false,
            error: `Batch contains ${parsed.rows.length} rows; split files larger than ${MAX_IMPORT_ROWS} rows.`,
        };
    }

    const resolvedMapping: ColumnMapping = {
        ...autoMapLegacyColumns(parsed.headers),
        ...(input.mapping || {}),
    };

    const { existingAdmissions, existingGradeNames } = await withTenant(tenantId, async (client) => {
        const q = sqlFor(client);
        const studentRows = await q<{ adm: string }>`
            SELECT upper(admission_number) AS adm
            FROM students
            WHERE tenant_id = ${tenantId}
        `;
        const gradeRows = await q<{ nameLower: string }>`
            SELECT lower(name) AS "nameLower"
            FROM grades
            WHERE tenant_id = ${tenantId}
        `;
        return {
            existingAdmissions: new Set(studentRows.map((r) => r.adm)),
            existingGradeNames: new Set(gradeRows.map((r) => r.nameLower)),
        };
    });

    const seenInBatch = new Set<string>();
    const phoneCounts = new Map<string, number>();
    const missingGrades = new Set<string>();

    let readyCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    let totalOpeningBalanceInr = 0;
    const sampleRows: PreviewSampleRow[] = [];

    parsed.rows.forEach((rawRow, idx) => {
        const norm = normalizeLegacyRow(rawRow, resolvedMapping, idx + 2);
        let status: PreviewRowStatus = 'READY';
        let notes = 'Ready to import';

        if (norm.errors.length > 0) {
            status = 'ERROR';
            notes = norm.errors.join(' · ');
            errorCount++;
        } else if (
            existingAdmissions.has(norm.admissionNumber) ||
            seenInBatch.has(norm.admissionNumber)
        ) {
            status = 'SKIP_DUPLICATE';
            notes = existingAdmissions.has(norm.admissionNumber)
                ? 'Admission number already exists in workspace'
                : 'Duplicate admission number in this CSV';
            duplicateCount++;
        } else {
            seenInBatch.add(norm.admissionNumber);
            readyCount++;
            totalOpeningBalanceInr += norm.openingFeeBalance;

            if (!existingGradeNames.has(norm.gradeName.toLowerCase())) {
                missingGrades.add(norm.gradeName);
            }
            if (norm.guardianPhone) {
                phoneCounts.set(norm.guardianPhone, (phoneCounts.get(norm.guardianPhone) || 0) + 1);
            }
        }

        if (sampleRows.length < 50) {
            sampleRows.push({
                rowNumber: norm.rowNumber,
                admissionNumber: norm.admissionNumber || '—',
                studentName: `${norm.firstName} ${norm.lastName}`.trim() || '—',
                gradeSection: norm.gradeName ? `${norm.gradeName} · Sec ${norm.sectionName}` : '—',
                guardianSummary: norm.guardianFirstName
                    ? `${norm.guardianFirstName} ${norm.guardianLastName === '-' ? '' : norm.guardianLastName || ''}`.trim() +
                      (norm.guardianPhone ? ` (${norm.guardianPhone})` : '')
                    : norm.guardianPhone || '—',
                openingBalanceInr: norm.openingFeeBalance,
                status,
                notes,
            });
        }
    });

    const siblingPhoneMatches = [...phoneCounts.values()].filter((count) => count > 1).length;

    return {
        ok: true,
        headers: parsed.headers,
        resolvedMapping,
        totalRows: parsed.rows.length,
        readyCount,
        duplicateCount,
        errorCount,
        totalOpeningBalanceInr: Math.round(totalOpeningBalanceInr * 100) / 100,
        siblingPhoneMatches,
        newGradesToCreate: [...missingGrades],
        sampleRows,
    };
}

export async function commitLegacyImportAction(input: {
    csvText: string;
    mapping?: ColumnMapping;
    sourceErp?: LegacyErpPreset;
    defaultDueDate?: string;
}): Promise<LegacyImportCommitResult> {
    const { tenantId, userId, session } = await requireAuth('students:write');

    const raw = (input.csvText || '').trim();
    if (!raw) {
        return { ok: false, error: 'No CSV content provided.' };
    }
    if (Buffer.byteLength(raw, 'utf8') > 5 * 1024 * 1024) {
        return { ok: false, error: 'CSV payload exceeds 5 MB batch limit.' };
    }

    const parsed = parseDelimitedSpreadsheet(raw);
    if (parsed.rows.length === 0 || parsed.rows.length > MAX_IMPORT_ROWS) {
        return { ok: false, error: `Upload between 1 and ${MAX_IMPORT_ROWS} rows per batch.` };
    }

    const resolvedMapping: ColumnMapping = {
        ...autoMapLegacyColumns(parsed.headers),
        ...(input.mapping || {}),
    };

    const preNormalizedValidRows = parsed.rows
        .map((r, idx) => normalizeLegacyRow(r, resolvedMapping, idx + 2))
        .filter((r) => r.errors.length === 0);

    if (
        preNormalizedValidRows.some((r) => r.openingFeeBalance > 0) &&
        !hasPermission(session.role as UserRole, 'fees:write')
    ) {
        return {
            ok: false,
            error: 'Forbidden: importing opening fee balances requires fees:write permission.',
        };
    }

    if (
        isDemoSession(session as { isDemoSandbox?: boolean; tenantCode?: string | null }) ||
        (await isDemoTenantId(tenantId))
    ) {
        if (preNormalizedValidRows.length > 25) {
            return {
                ok: false,
                error: 'Demo sandbox ERP imports are capped at 25 valid rows per batch.',
            };
        }
        const rateLimitError = await consumeRateLimit(`${tenantId}:${userId}`, {
            scope: 'legacy-import-demo-commit',
            maxAttempts: 5,
            degradedMaxAttempts: 5,
            endpointClass: 'authenticated-internal',
            message: 'Demo sandbox import rate limit exceeded (max 5 commits per 15 minutes).',
        });
        if (rateLimitError) {
            return { ok: false, error: rateLimitError };
        }
    }

    const sourceErp = input.sourceErp || 'AUTO';
    const dueDate =
        input.defaultDueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.defaultDueDate)
            ? input.defaultDueDate
            : '2026-12-31';

    const batchId = randomUUID();
    const importedAt = new Date().toISOString();

    try {
        const result = await withTenant(tenantId, async (client) => {
            const q = sqlFor(client);

            // 1. Load existing admission numbers first and normalize READY rows before any writes
            const existingStudentRows = await q<{ adm: string }>`
                SELECT upper(admission_number) AS adm
                FROM students
                WHERE tenant_id = ${tenantId}
            `;
            const existingAdmissions = new Set(existingStudentRows.map((r) => r.adm));

            const readyRows = [];
            let duplicatesSkipped = 0;
            for (let i = 0; i < parsed.rows.length; i++) {
                const norm = normalizeLegacyRow(parsed.rows[i], resolvedMapping, i + 2);
                if (norm.errors.length > 0) continue;
                if (existingAdmissions.has(norm.admissionNumber)) {
                    duplicatesSkipped++;
                    continue;
                }
                existingAdmissions.add(norm.admissionNumber);
                readyRows.push(norm);
            }

            if (readyRows.length === 0) {
                return {
                    ok: false as const,
                    error:
                        duplicatesSkipped > 0
                            ? `All ${duplicatesSkipped} valid rows already exist in this school workspace.`
                            : 'No valid rows passed validation. Check column mapping and fix errors first.',
                };
            }

            // 2. Ensure an active academic year exists
            let yearRow = await q<{ id: string }>`
                SELECT id
                FROM academic_years
                WHERE tenant_id = ${tenantId}
                ORDER BY is_current DESC, start_date DESC
                LIMIT 1
            `.maybeOne();

            if (!yearRow) {
                yearRow = await q<{ id: string }>`
                    INSERT INTO academic_years (tenant_id, name, start_date, end_date, is_current)
                    VALUES (${tenantId}, '2026-27', '2026-04-01', '2027-03-31', true)
                    RETURNING id
                `.one();
            }
            const academicYearId = yearRow.id;

            // 3. Load existing grades and sections
            const gradeRows = await q<{ id: string; name: string; displayOrder: number }>`
                SELECT id, name, display_order AS "displayOrder"
                FROM grades
                WHERE tenant_id = ${tenantId}
            `;
            const gradeByLower = new Map<string, string>();
            let maxGradeOrder = 0;
            for (const g of gradeRows) {
                gradeByLower.set(g.name.toLowerCase(), g.id);
                if (g.displayOrder > maxGradeOrder) maxGradeOrder = g.displayOrder;
            }

            const sectionRows = await q<{ id: string; gradeId: string; name: string }>`
                SELECT id, grade_id AS "gradeId", name
                FROM sections
                WHERE tenant_id = ${tenantId}
            `;
            const sectionByKey = new Map<string, string>();
            for (const s of sectionRows) {
                sectionByKey.set(`${s.gradeId}:${s.name.toUpperCase()}`, s.id);
            }

            // 4. Provision legacy opening-balance fee plan if needed
            let openingFeePlanId: string | null = null;
            if (readyRows.some((r) => r.openingFeeBalance > 0)) {
                const existingPlan = await q<{ id: string }>`
                    SELECT id
                    FROM fee_plans
                    WHERE tenant_id = ${tenantId}
                      AND name = 'Legacy ERP Opening Balance'
                    LIMIT 1
                `.maybeOne();

                if (existingPlan) {
                    openingFeePlanId = existingPlan.id;
                } else {
                    const createdPlan = await q<{ id: string }>`
                        INSERT INTO fee_plans (tenant_id, academic_year_id, name, description, is_active)
                        VALUES (
                            ${tenantId},
                            ${academicYearId},
                            ${'Legacy ERP Opening Balance'},
                            ${'Carryforward opening fee arrears migrated via ERP Import Wizard'},
                            ${true}
                        )
                        RETURNING id
                    `.one();
                    openingFeePlanId = createdPlan.id;

                    await q`
                        INSERT INTO fee_components (fee_plan_id, name, amount, frequency, is_optional)
                        VALUES (${openingFeePlanId}, 'Carryforward Arrears', '0.00', 'ONE_TIME', false)
                    `.execute();
                }
            }

            let studentsCreated = 0;
            let guardiansCreated = 0;
            let openingInvoicesCreated = 0;
            let gradesCreated = 0;
            let totalOpeningBalanceInr = 0;

            const batchCustomData = JSON.stringify({
                importBatchId: batchId,
                sourceErp,
                importedAt,
            });
            const batchPrefix = batchId.replace(/-/g, '').slice(0, 8).toUpperCase();

            for (let rowIdx = 0; rowIdx < readyRows.length; rowIdx++) {
                const row = readyRows[rowIdx];
                let gradeId = gradeByLower.get(row.gradeName.toLowerCase());
                if (!gradeId) {
                    maxGradeOrder++;
                    const numMatch = row.gradeName.match(/\d+/);
                    const numericValue = numMatch ? Number.parseInt(numMatch[0], 10) : null;
                    const insertedGrade = await q<{ id: string }>`
                        INSERT INTO grades (tenant_id, name, numeric_value, display_order)
                        VALUES (${tenantId}, ${row.gradeName}, ${numericValue}, ${maxGradeOrder})
                        RETURNING id
                    `.one();
                    gradeId = insertedGrade.id;
                    gradeByLower.set(row.gradeName.toLowerCase(), gradeId);
                    gradesCreated++;
                }

                const secKey = `${gradeId}:${row.sectionName.toUpperCase()}`;
                let sectionId = sectionByKey.get(secKey);
                if (!sectionId) {
                    const insertedSec = await q<{ id: string }>`
                        INSERT INTO sections (tenant_id, grade_id, academic_year_id, name, capacity)
                        VALUES (${tenantId}, ${gradeId}, ${academicYearId}, ${row.sectionName.toUpperCase()}, 40)
                        RETURNING id
                    `.one();
                    sectionId = insertedSec.id;
                    sectionByKey.set(secKey, sectionId);
                }

                const studentId = randomUUID();
                await q`
                    INSERT INTO students (
                        id, tenant_id, admission_number, first_name, last_name, date_of_birth,
                        gender, blood_group, grade_id, section_id, roll_number, admission_date,
                        city, state, pincode, status, custom_data
                    ) VALUES (
                        ${studentId}::uuid,
                        ${tenantId}::uuid,
                        ${row.admissionNumber},
                        ${row.firstName},
                        ${row.lastName},
                        ${row.dateOfBirth}::date,
                        ${row.gender}::gender,
                        ${row.bloodGroup}::blood_group,
                        ${gradeId}::uuid,
                        ${sectionId}::uuid,
                        ${row.rollNumber},
                        ${importedAt.slice(0, 10)}::date,
                        ${row.city},
                        ${row.state},
                        ${row.pincode},
                        ${'ACTIVE'}::student_status,
                        ${batchCustomData}::jsonb
                    )
                `.execute();
                studentsCreated++;

                if (row.guardianFirstName || row.guardianPhone || row.guardianEmail) {
                    await q`
                        INSERT INTO guardians (
                            id, tenant_id, student_id, relation, first_name, last_name,
                            phone_enc, email_enc, is_emergency_contact, is_primary
                        ) VALUES (
                            ${randomUUID()}::uuid,
                            ${tenantId}::uuid,
                            ${studentId}::uuid,
                            ${row.guardianRelation}::guardian_relation,
                            ${row.guardianFirstName || 'Parent'},
                            ${row.guardianLastName || row.lastName},
                            ${row.guardianPhone ? encryptPhone(row.guardianPhone) : null},
                            ${row.guardianEmail ? encryptEmail(row.guardianEmail) : null},
                            ${true},
                            ${true}
                        )
                    `.execute();
                    guardiansCreated++;
                }

                if (row.openingFeeBalance > 0 && openingFeePlanId) {
                    const amountFixed = row.openingFeeBalance.toFixed(2);
                    const invNumber = `INV-MIG-${batchPrefix}-${String(rowIdx + 1).padStart(4, '0')}`;
                    const lineItems = JSON.stringify([
                        {
                            name: row.feeDescription || 'Legacy ERP Opening Balance',
                            amount: amountFixed,
                            frequency: 'ONE_TIME',
                            isOptional: false,
                        },
                    ]);

                    await q`
                        INSERT INTO invoices (
                            id, tenant_id, student_id, fee_plan_id, invoice_number,
                            total_amount, paid_amount, due_date, status, description,
                            line_items, custom_data
                        ) VALUES (
                            ${randomUUID()}::uuid,
                            ${tenantId}::uuid,
                            ${studentId}::uuid,
                            ${openingFeePlanId}::uuid,
                            ${invNumber},
                            ${amountFixed}::numeric,
                            ${'0.00'}::numeric,
                            ${dueDate}::date,
                            ${'PENDING'}::invoice_status,
                            ${row.feeDescription || 'Opening Fee Arrears (Legacy ERP Import)'},
                            ${lineItems},
                            ${batchCustomData}::jsonb
                        )
                    `.execute();
                    openingInvoicesCreated++;
                    totalOpeningBalanceInr += row.openingFeeBalance;
                }
            }

            const auditSummary = JSON.stringify({
                batchId,
                sourceErp,
                studentsCreated,
                guardiansCreated,
                openingInvoicesCreated,
                gradesCreated,
                duplicatesSkipped,
                totalOpeningBalanceInr: Math.round(totalOpeningBalanceInr * 100) / 100,
                rolledBack: false,
            });

            await q`
                INSERT INTO audit_logs (
                    id, tenant_id, user_id, action, entity_type, entity_id, description, after_state
                ) VALUES (
                    ${randomUUID()}::uuid,
                    ${tenantId}::uuid,
                    ${userId}::uuid,
                    ${'CREATE'}::audit_action,
                    ${'legacy_import_batch'},
                    ${batchId}::uuid,
                    ${`Migrated ${studentsCreated} students (${openingInvoicesCreated} opening invoices) via ${sourceErp}`},
                    ${auditSummary}::jsonb
                )
            `.execute();

            return {
                ok: true as const,
                batchId,
                studentsCreated,
                guardiansCreated,
                openingInvoicesCreated,
                gradesCreated,
                duplicatesSkipped,
                totalOpeningBalanceInr: Math.round(totalOpeningBalanceInr * 100) / 100,
            };
        });

        revalidatePath('/students');
        revalidatePath('/invoices');
        revalidatePath('/fees');
        revalidatePath('/dashboard');
        revalidatePath('/settings/import');

        return result;
    } catch (error) {
        logger.error('import.legacy_commit_failed', 'Legacy ERP batch import failed', {
            tenantId,
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return {
            ok: false,
            error: 'Import failed and was safely rolled back. Verify CSV values and try again.',
        };
    }
}

export async function listLegacyImportBatchesAction(): Promise<LegacyImportBatchItem[]> {
    const { tenantId } = await requireAuth('students:read');

    return withTenant(tenantId, async (client) => {
        const q = sqlFor(client);
        const rows = await q<{
            entityId: string | null;
            action: string;
            afterState: Record<string, unknown> | null;
            createdAt: Date | string;
        }>`
            SELECT
                entity_id AS "entityId",
                action,
                after_state AS "afterState",
                created_at AS "createdAt"
            FROM audit_logs
            WHERE tenant_id = ${tenantId}
              AND entity_type = 'legacy_import_batch'
            ORDER BY created_at DESC
            LIMIT 25
        `;

        const rolledBackSet = new Set<string>();
        for (const r of rows) {
            if (r.action === 'DELETE' && r.entityId) {
                rolledBackSet.add(r.entityId);
            }
        }

        const items: LegacyImportBatchItem[] = [];
        for (const r of rows) {
            if (r.action !== 'CREATE' || !r.entityId) continue;
            const state = r.afterState || {};
            items.push({
                batchId: r.entityId,
                sourceErp: typeof state.sourceErp === 'string' ? state.sourceErp : 'CSV',
                createdAt: new Date(r.createdAt).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                }),
                studentsCreated: Number(state.studentsCreated || 0),
                guardiansCreated: Number(state.guardiansCreated || 0),
                openingInvoicesCreated: Number(state.openingInvoicesCreated || 0),
                totalOpeningBalanceInr: Number(state.totalOpeningBalanceInr || 0),
                rolledBack: rolledBackSet.has(r.entityId),
            });
        }
        return items;
    });
}

export async function rollbackLegacyImportBatchAction(batchId: string): Promise<{
    ok: boolean;
    removedStudents?: number;
    removedInvoices?: number;
    error?: string;
}> {
    const { tenantId, userId, session } = await requireAuth('students:write');

    if (!UUID_RE.test(batchId)) {
        return { ok: false, error: 'Invalid import batch identifier.' };
    }

    try {
        const result = await withTenant(tenantId, async (client) => {
            const q = sqlFor(client);

            const batchStudents = await q<{ id: string }>`
                SELECT id
                FROM students
                WHERE tenant_id = ${tenantId}
                  AND custom_data->>'importBatchId' = ${batchId}
            `;
            const batchInvoices = await q<{ id: string }>`
                SELECT id
                FROM invoices
                WHERE tenant_id = ${tenantId}
                  AND custom_data->>'importBatchId' = ${batchId}
            `;

            const batchStudentIds = batchStudents.map((r) => r.id);
            const batchInvoiceIds = batchInvoices.map((r) => r.id);

            if (batchStudentIds.length === 0 && batchInvoiceIds.length === 0) {
                return {
                    ok: false as const,
                    error: 'Import batch not found or already rolled back.',
                };
            }

            if (
                batchInvoiceIds.length > 0 &&
                !hasPermission(session.role as UserRole, 'fees:write')
            ) {
                return {
                    ok: false as const,
                    error: 'Forbidden: rolling back an import batch containing invoices requires fees:write permission.',
                };
            }

            // Guard: refuse rollback if live payments have already been recorded on batch invoices
            const paidCountRow = await q<{ count: number }>`
                SELECT count(*)::int AS count
                FROM payments p
                JOIN invoices i ON i.id = p.invoice_id AND i.tenant_id = p.tenant_id
                WHERE p.tenant_id = ${tenantId}
                  AND i.custom_data->>'importBatchId' = ${batchId}
            `.one();

            if ((paidCountRow?.count ?? 0) > 0) {
                return {
                    ok: false as const,
                    error: 'Cannot roll back a batch after payments have been collected against its opening invoices.',
                };
            }

            if (batchStudentIds.length > 0) {
                const postImportDeps = await q<{
                    extraInvoices: number;
                    payments: number;
                    concessions: number;
                    attendance: number;
                    results: number;
                    certificates: number;
                    documents: number;
                }>`
                    SELECT
                        (SELECT count(*)::int FROM invoices WHERE tenant_id = ${tenantId} AND student_id = ANY(${batchStudentIds}::uuid[]) AND COALESCE(custom_data->>'importBatchId', '') <> ${batchId}) AS "extraInvoices",
                        (SELECT count(*)::int FROM payments WHERE tenant_id = ${tenantId} AND student_id = ANY(${batchStudentIds}::uuid[])) AS payments,
                        (SELECT count(*)::int FROM concessions WHERE tenant_id = ${tenantId} AND student_id = ANY(${batchStudentIds}::uuid[])) AS concessions,
                        (SELECT count(*)::int FROM attendance_records WHERE tenant_id = ${tenantId} AND student_id = ANY(${batchStudentIds}::uuid[])) AS attendance,
                        (SELECT count(*)::int FROM student_results WHERE tenant_id = ${tenantId} AND student_id = ANY(${batchStudentIds}::uuid[])) AS results,
                        (SELECT count(*)::int FROM issued_certificates WHERE tenant_id = ${tenantId} AND student_id = ANY(${batchStudentIds}::uuid[])) AS certificates,
                        (SELECT count(*)::int FROM student_documents WHERE tenant_id = ${tenantId} AND student_id = ANY(${batchStudentIds}::uuid[])) AS documents
                `.one();

                const totalDependentRecords =
                    (postImportDeps?.extraInvoices ?? 0) +
                    (postImportDeps?.payments ?? 0) +
                    (postImportDeps?.concessions ?? 0) +
                    (postImportDeps?.attendance ?? 0) +
                    (postImportDeps?.results ?? 0) +
                    (postImportDeps?.certificates ?? 0) +
                    (postImportDeps?.documents ?? 0);

                if (totalDependentRecords > 0) {
                    return {
                        ok: false as const,
                        error: 'Cannot roll back this import batch because post-import academic, document, or financial records already exist for one or more imported students.',
                    };
                }
            }

            const deletedInvoices = await q<{ id: string }>`
                DELETE FROM invoices
                WHERE tenant_id = ${tenantId}
                  AND custom_data->>'importBatchId' = ${batchId}
                RETURNING id
            `;

            await q`
                DELETE FROM guardians
                WHERE tenant_id = ${tenantId}
                  AND student_id IN (
                      SELECT id FROM students
                      WHERE tenant_id = ${tenantId}
                        AND custom_data->>'importBatchId' = ${batchId}
                  )
            `.execute();

            const deletedStudents = await q<{ id: string }>`
                DELETE FROM students
                WHERE tenant_id = ${tenantId}
                  AND custom_data->>'importBatchId' = ${batchId}
                RETURNING id
            `;

            await q`
                INSERT INTO audit_logs (
                    id, tenant_id, user_id, action, entity_type, entity_id, description, after_state
                ) VALUES (
                    ${randomUUID()}::uuid,
                    ${tenantId}::uuid,
                    ${userId}::uuid,
                    ${'DELETE'}::audit_action,
                    ${'legacy_import_batch'},
                    ${batchId}::uuid,
                    ${`Rolled back import batch ${batchId.slice(0, 8)} (${deletedStudents.length} students removed)`},
                    ${JSON.stringify({
                        batchId,
                        removedStudents: deletedStudents.length,
                        removedInvoices: deletedInvoices.length,
                    })}::jsonb
                )
            `.execute();

            return {
                ok: true as const,
                removedStudents: deletedStudents.length,
                removedInvoices: deletedInvoices.length,
            };
        });

        revalidatePath('/students');
        revalidatePath('/invoices');
        revalidatePath('/fees');
        revalidatePath('/settings/import');

        return result;
    } catch (error) {
        logger.error('import.legacy_rollback_failed', 'Legacy ERP rollback failed', {
            tenantId,
            metadata: { batchId, error: error instanceof Error ? error.message : String(error) },
        });
        return { ok: false, error: 'Unable to roll back import batch.' };
    }
}

export interface AiLegacyMappingResult {
    ok: boolean;
    error?: string;
    mapping?: ColumnMapping;
    summary?: string;
    warnings?: string[];
    unmappedHeaders?: string[];
    engine?: string;
}

export async function aiAssistLegacyColumnMappingAction(input: {
    csvText: string;
    sourceErp?: LegacyErpPreset;
}): Promise<AiLegacyMappingResult> {
    const { tenantId, userId } = await requireAuth('students:write');

    const rateLimitError = await consumeRateLimit(`${tenantId}:${userId}`, {
        scope: 'legacy-import-ai-map',
        maxAttempts: 15,
        degradedMaxAttempts: 5,
        endpointClass: 'ai',
        message: 'Too many AI mapping requests. Please wait a minute before trying again.',
    });
    if (rateLimitError) {
        return { ok: false, error: rateLimitError };
    }

    const raw = (input.csvText || '').trim();
    if (!raw) {
        return { ok: false, error: 'Upload or paste spreadsheet rows first.' };
    }
    if (Buffer.byteLength(raw, 'utf8') > 5 * 1024 * 1024) {
        return { ok: false, error: 'CSV payload exceeds 5 MB batch limit.' };
    }

    const parsed = parseDelimitedSpreadsheet(raw);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        return { ok: false, error: 'No spreadsheet headers or data rows detected.' };
    }

    let mergedMapping: ColumnMapping = inferColumnsFromSampleCells(parsed.headers, parsed.rows);
    let aiNotes: string[] = [];
    let engineLabel = 'deterministic_schema_inspector';

    const providerChain = resolveAiProviderChain();
    if (providerChain.configured && providerChain.chain) {
        const maskedSamples = buildPiiMaskedSampleForAi(parsed.headers, parsed.rows, 3);
        const validHeaderSet = new Set(parsed.headers);
        const validTargetSet = new Set<string>(ALL_TARGET_FIELD_KEYS);

        const promptPayload = redactPiiForExternalLlm(
            JSON.stringify({
                sourceErpHint: input.sourceErp || 'AUTO',
                headers: parsed.headers,
                maskedSampleRows: maskedSamples,
                allowedTargetFields: ALL_TARGET_FIELD_KEYS,
            }),
        );

        for (const providerCfg of providerChain.chain) {
            try {
                const { text } = await generateText({
                    model: createAiModel(providerCfg),
                    temperature: 0,
                    maxOutputTokens: 600,
                    system: [
                        'You map school ERP CSV column headers into ScholarMind TargetFieldKey names.',
                        'Return ONLY valid JSON with shape: {"mapping": {"<TargetFieldKey>": "<ExactCSVHeader>"}, "notes": ["short plain-English migration note"]}.',
                        'Only use keys from allowedTargetFields and exact header strings from headers. Never invent headers or student data.',
                    ].join(' '),
                    prompt: promptPayload,
                });

                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsedJson = JSON.parse(jsonMatch[0]) as {
                        mapping?: Record<string, unknown>;
                        notes?: unknown[];
                    };
                    if (parsedJson.mapping && typeof parsedJson.mapping === 'object') {
                        const validatedAiMap: ColumnMapping = {};
                        for (const [k, v] of Object.entries(parsedJson.mapping)) {
                            if (
                                validTargetSet.has(k) &&
                                typeof v === 'string' &&
                                validHeaderSet.has(v)
                            ) {
                                validatedAiMap[k as TargetFieldKey] = v;
                            }
                        }
                        mergedMapping = {
                            ...validatedAiMap,
                            ...mergedMapping,
                        };
                    }
                    if (Array.isArray(parsedJson.notes)) {
                        aiNotes = parsedJson.notes
                            .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
                            .map((n) => n.trim().slice(0, 220))
                            .slice(0, 3);
                    }
                    engineLabel = `governed_ai:${providerCfg.source}`;
                    break;
                }
            } catch (err) {
                logger.warn('import.ai_mapper_provider_fallback', 'AI column mapper fell back to next provider', {
                    tenantId,
                    metadata: {
                        provider: providerCfg.source,
                        error: err instanceof Error ? err.message : String(err),
                    },
                });
            }
        }
    }

    const anomalyReport = analyzeSpreadsheetAnomalies(parsed.headers, parsed.rows, mergedMapping);
    const combinedWarnings = [...anomalyReport.warnings];
    for (const note of aiNotes) {
        if (!combinedWarnings.includes(note)) {
            combinedWarnings.push(note);
        }
    }

    return {
        ok: true,
        mapping: mergedMapping,
        summary: anomalyReport.summary,
        warnings: combinedWarnings,
        unmappedHeaders: anomalyReport.unmappedHeaders,
        engine: engineLabel,
    };
}
