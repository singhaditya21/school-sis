'use server';

/**
 * @module lib/actions/lcnc-tier3
 *
 * Salesforce Platform Tier-3 Server Actions:
 *   1. Installed Blueprint & Schema Bundle Registry (`listInstalledMetadataPackagesAction`)
 *   2. Dry-Run Schema Bundle Diff Previewer (`previewSchemaBundleImportAction`)
 *   3. FLS/OWD-Grounded Object Copilot & Insights (`askObjectCopilotAction`)
 *   4. Human-in-the-Loop 4-Eyes Record Review Proposal (`proposeObjectCopilotApprovalAction`)
 */

import { generateText } from 'ai';
import {
    createPersistedWorkflowApprovalRequest,
    type AuthorizationRole,
} from '@school-sis/api';
import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { isTenantStaffRole } from '@/lib/auth/page-access';
import { createAiModel } from '@/lib/ai/runtime';
import { resolveAiProviderChain } from '@/lib/ai/provider';
import { redactPiiForExternalLlm } from '@/lib/ai/telemetry';
import {
    assertSafeMetadataIdentifier,
    computeSchemaBundleSha256,
    validateScholarMindSchemaBundle,
} from '@/lib/metadata/platform';
import { loadObjectValidationRulesInternal } from '@/lib/metadata/lcnc-tier2-db';
import { getObjectMetadata, queryRecords } from '@/lib/actions/metadata-engine';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface InstalledMetadataPackageItem {
    id: string;
    packageKey: string;
    name: string;
    description: string | null;
    version: string;
    sourceType: string;
    bundleSha256: string;
    installedObjects: string[];
    artifactCounts: Record<string, number>;
    installedAt: string;
    updatedAt: string;
}

export interface SchemaBundleDiffPreview {
    bundleName: string;
    bundleDescription: string;
    sha256: string;
    newObjects: string[];
    existingObjectsToUpdate: string[];
    newFieldsCount: number;
    existingFieldsCount: number;
    layoutCount: number;
    validationRuleCount: number;
    sharingRuleCount: number;
    approvalProcessCount: number;
    savedViewCount: number;
    workflowCount: number;
}

export interface ObjectCopilotInsightsResult {
    success: boolean;
    engineMode?: 'grounded_llm' | 'deterministic_grounded';
    answer?: string;
    visibleRecordCount?: number;
    readableFieldCount?: number;
    hiddenFieldCount?: number;
    activeValidationRulesCount?: number;
    pendingApprovalsCount?: number;
    picklistDistributions?: {
        fieldApiName: string;
        fieldLabel: string;
        buckets: { option: string; count: number }[];
    }[];
    numericRollups?: {
        fieldApiName: string;
        fieldLabel: string;
        sum: number;
        avg: number;
        min: number;
        max: number;
    }[];
    error?: string;
}

/**
 * Lists all installed blueprints and `.scholarmind.json` bundles for the current tenant,
 * along with the tenant's active human-readable `code` slug for Experience Cloud URLs.
 */
export async function listInstalledMetadataPackagesAction(): Promise<{
    success: boolean;
    tenantCode: string | null;
    packages: InstalledMetadataPackageItem[];
    error?: string;
}> {
    try {
        const { tenantId } = await requireAuth('metadata:read');

        const [tenantRows, pkgRows] = await Promise.all([
            sql<{ code: string | null }>`
                SELECT code
                FROM tenants
                WHERE id = ${tenantId}
                LIMIT 1
            `,
            Promise.resolve(
                sql<{
                    id: string;
                    package_key: string;
                    name: string;
                    description: string | null;
                    version: string;
                    source_type: string;
                    bundle_sha256: string;
                    installed_objects: string[] | null;
                    artifact_counts: Record<string, number> | null;
                    installed_at: Date | string;
                    updated_at: Date | string;
                }>`
                    SELECT id, package_key, name, description, version, source_type,
                           bundle_sha256, installed_objects, artifact_counts,
                           installed_at, updated_at
                    FROM metadata_installed_packages
                    WHERE tenant_id = ${tenantId}
                    ORDER BY updated_at DESC
                    LIMIT 100
                `,
            ).catch(() => []),
        ]);

        return {
            success: true,
            tenantCode: tenantRows[0]?.code ?? null,
            packages: pkgRows.map(row => ({
                id: row.id,
                packageKey: row.package_key,
                name: row.name,
                description: row.description,
                version: row.version,
                sourceType: row.source_type,
                bundleSha256: row.bundle_sha256,
                installedObjects: Array.isArray(row.installed_objects)
                    ? row.installed_objects.map(String)
                    : [],
                artifactCounts:
                    row.artifact_counts && typeof row.artifact_counts === 'object'
                        ? row.artifact_counts
                        : {},
                installedAt:
                    row.installed_at instanceof Date
                        ? row.installed_at.toISOString()
                        : String(row.installed_at),
                updatedAt:
                    row.updated_at instanceof Date
                        ? row.updated_at.toISOString()
                        : String(row.updated_at),
            })),
        };
    } catch (error) {
        return {
            success: false,
            tenantCode: null,
            packages: [],
            error: error instanceof Error ? error.message : 'Failed to load installed packages.',
        };
    }
}

/**
 * Performs a non-mutating Dry-Run Diff Preview of a `.scholarmind.json` Schema Bundle
 * against the current tenant's existing metadata schema before deployment.
 */
export async function previewSchemaBundleImportAction(rawBundle: unknown): Promise<{
    success: boolean;
    preview?: SchemaBundleDiffPreview;
    error?: string;
}> {
    try {
        const { tenantId } = await requireAuth('metadata:read');
        const validated = validateScholarMindSchemaBundle(rawBundle);
        if (validated.ok === false) {
            return { success: false, error: validated.error };
        }

        const { bundle } = validated;
        const sha256 = computeSchemaBundleSha256(bundle);

        const [existingObjs, existingFields] = await Promise.all([
            sql<{ id: string; api_name: string }>`
                SELECT id, api_name
                FROM metadata_objects
                WHERE tenant_id = ${tenantId}
            `,
            sql<{ object_api_name: string; field_api_name: string }>`
                SELECT mo.api_name AS object_api_name, mf.api_name AS field_api_name
                FROM metadata_fields mf
                JOIN metadata_objects mo ON mo.id = mf.object_id
                WHERE mo.tenant_id = ${tenantId}
            `,
        ]);

        const objSet = new Set(existingObjs.map(o => o.api_name.toLowerCase()));
        const fieldSet = new Set(
            existingFields.map(
                f => `${f.object_api_name.toLowerCase()}::${f.field_api_name.toLowerCase()}`,
            ),
        );

        const newObjects: string[] = [];
        const existingObjectsToUpdate: string[] = [];
        let newFieldsCount = 0;
        let existingFieldsCount = 0;
        let layoutCount = 0;
        let validationRuleCount = 0;
        let sharingRuleCount = 0;
        let approvalProcessCount = 0;
        let savedViewCount = 0;

        for (const obj of bundle.objects) {
            const apiLower = obj.apiName.toLowerCase();
            if (objSet.has(apiLower)) {
                existingObjectsToUpdate.push(obj.apiName);
            } else {
                newObjects.push(obj.apiName);
            }

            for (const f of obj.fields) {
                const key = `${apiLower}::${f.apiName.toLowerCase()}`;
                if (fieldSet.has(key)) {
                    existingFieldsCount++;
                } else {
                    newFieldsCount++;
                }
            }

            layoutCount += obj.layouts.length;
            validationRuleCount += obj.validationRules?.length || 0;
            sharingRuleCount += obj.sharingRules?.length || 0;
            approvalProcessCount += obj.approvalProcesses?.length || 0;
            savedViewCount += obj.savedViews?.length || 0;
        }

        return {
            success: true,
            preview: {
                bundleName: bundle.bundleName,
                bundleDescription: bundle.bundleDescription,
                sha256,
                newObjects,
                existingObjectsToUpdate,
                newFieldsCount,
                existingFieldsCount,
                layoutCount,
                validationRuleCount,
                sharingRuleCount,
                approvalProcessCount,
                savedViewCount,
                workflowCount: bundle.workflows.length,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to preview schema bundle.',
        };
    }
}

/**
 * Answers a natural-language analytical or governance question on any System or Custom Object,
 * grounded strictly in the caller's OWD + Sharing Rule + Custom Role CRUD + Field-Level Security
 * visible records and aggregate statistics (zero individual PII sent to external LLMs).
 */
export async function askObjectCopilotAction(input: {
    objectApiName: string;
    question: string;
}): Promise<ObjectCopilotInsightsResult> {
    try {
        const { tenantId, session } = await requireAuth();
        if (!isTenantStaffRole(session.role)) {
            return {
                success: false,
                error: 'Forbidden: staff access is required to use Object Copilot.',
            };
        }

        const cleanObjectApi = String(input.objectApiName || '').trim().toLowerCase();
        assertSafeMetadataIdentifier(cleanObjectApi, 'object API name');
        const cleanQuestion = String(input.question || '').trim().slice(0, 400);
        if (!cleanQuestion) {
            return { success: false, error: 'Enter a question for Object Copilot.' };
        }

        const [meta, visibleRows, validationRules, pendingApprovalRows] = await Promise.all([
            getObjectMetadata(cleanObjectApi),
            queryRecords(cleanObjectApi, {}, 200, 0),
            loadObjectValidationRulesInternal(tenantId, cleanObjectApi),
            Promise.resolve(
                sql<{ cnt: number }>`
                    SELECT COUNT(*)::int AS cnt
                    FROM metadata_approval_instances
                    WHERE tenant_id = ${tenantId}
                      AND object_api_name = ${cleanObjectApi}
                      AND status = 'PENDING'
                `,
            ).catch(() => [{ cnt: 0 }]),
        ]);

        const picklistFields = meta.fields
            .filter(f => f.dataType === 'PICKLIST')
            .slice(0, 3);
        const picklistDistributions = picklistFields.map(field => {
            const counts = new Map<string, number>();
            for (const row of visibleRows) {
                const rawVal = row[field.apiName];
                const key =
                    rawVal === null || rawVal === undefined || String(rawVal).trim() === ''
                        ? '(Unset)'
                        : String(rawVal).trim();
                counts.set(key, (counts.get(key) || 0) + 1);
            }
            const buckets = Array.from(counts.entries())
                .map(([option, count]) => ({ option, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 8);
            return {
                fieldApiName: field.apiName,
                fieldLabel: field.label,
                buckets,
            };
        });

        const numericFields = meta.fields
            .filter(f => f.dataType === 'NUMBER' || f.dataType === 'CURRENCY')
            .slice(0, 3);
        const numericRollups = numericFields.map(field => {
            const nums: number[] = [];
            for (const row of visibleRows) {
                const parsed = Number(row[field.apiName]);
                if (Number.isFinite(parsed)) nums.push(parsed);
            }
            if (nums.length === 0) {
                return {
                    fieldApiName: field.apiName,
                    fieldLabel: field.label,
                    sum: 0,
                    avg: 0,
                    min: 0,
                    max: 0,
                };
            }
            const sum = Math.round(nums.reduce((acc, n) => acc + n, 0) * 100) / 100;
            const avg = Math.round((sum / nums.length) * 100) / 100;
            return {
                fieldApiName: field.apiName,
                fieldLabel: field.label,
                sum,
                avg,
                min: Math.min(...nums),
                max: Math.max(...nums),
            };
        });

        const activeValidationRulesCount = validationRules.filter(r => r.isActive).length;
        const pendingApprovalsCount = Number(pendingApprovalRows[0]?.cnt || 0);

        // Build deterministic grounded baseline summary
        const summaryParts: string[] = [
            `${meta.objectDef.name} (${cleanObjectApi}) currently has ${visibleRows.length} record(s) visible under your role's OWD, Sharing Rules, and Field-Level Security (${meta.fields.length} readable field(s)${meta.hiddenFieldCount > 0 ? `, ${meta.hiddenFieldCount} restricted by FLS` : ''}).`,
        ];

        if (picklistDistributions.length > 0 && picklistDistributions[0].buckets.length > 0) {
            const primary = picklistDistributions[0];
            const topStr = primary.buckets
                .slice(0, 4)
                .map(b => `${b.option}: ${b.count}`)
                .join(', ');
            summaryParts.push(`${primary.fieldLabel} breakdown — ${topStr}.`);
        }

        if (numericRollups.length > 0) {
            const nr = numericRollups[0];
            summaryParts.push(
                `${nr.fieldLabel} rollup — Total: ${nr.sum.toLocaleString()}, Average: ${nr.avg.toLocaleString()}, Range: ${nr.min.toLocaleString()} to ${nr.max.toLocaleString()}.`,
            );
        }

        summaryParts.push(
            `Governance posture — ${activeValidationRulesCount} active formula validation rule(s) and ${pendingApprovalsCount} pending multi-step approval instance(s).`,
        );

        let finalAnswer = summaryParts.join(' ');
        let engineMode: 'grounded_llm' | 'deterministic_grounded' = 'deterministic_grounded';

        const providerChain = resolveAiProviderChain();
        if (providerChain.configured && providerChain.chain) {
            const aggregateContext = redactPiiForExternalLlm(
                JSON.stringify({
                    objectName: meta.objectDef.name,
                    objectApiName: cleanObjectApi,
                    question: cleanQuestion,
                    visibleRecordCount: visibleRows.length,
                    readableFieldCount: meta.fields.length,
                    hiddenFieldCount: meta.hiddenFieldCount,
                    activeValidationRulesCount,
                    pendingApprovalsCount,
                    picklistDistributions,
                    numericRollups,
                }),
            );

            for (const providerCfg of providerChain.chain) {
                try {
                    const { text } = await generateText({
                        model: createAiModel(providerCfg),
                        temperature: 0,
                        maxOutputTokens: 260,
                        system: [
                            'You are the ScholarMind Object Home Grounded Copilot.',
                            'Answer the staff question in 2 to 4 concise sentences using ONLY the aggregate statistics provided.',
                            'Never invent record numbers, names, or fields. Mention governance/approval counts when relevant.',
                        ].join(' '),
                        prompt: aggregateContext,
                    });
                    if (text && text.trim().length > 15) {
                        finalAnswer = text.trim();
                        engineMode = 'grounded_llm';
                        break;
                    }
                } catch {
                    // Fall through to next provider or deterministic grounded summary
                }
            }
        }

        return {
            success: true,
            engineMode,
            answer: finalAnswer,
            visibleRecordCount: visibleRows.length,
            readableFieldCount: meta.fields.length,
            hiddenFieldCount: meta.hiddenFieldCount,
            activeValidationRulesCount,
            pendingApprovalsCount,
            picklistDistributions,
            numericRollups,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Object Copilot query failed.',
        };
    }
}

/**
 * Proposes a governed 4-eyes stage/decision review on a visible object record via
 * `createPersistedWorkflowApprovalRequest` (`policyId: 'agents.approval.review'`) without mutating the record directly.
 */
export async function proposeObjectCopilotApprovalAction(input: {
    objectApiName: string;
    recordId: string;
    proposedStage: string;
    reason: string;
}): Promise<{
    success: boolean;
    approvalId?: string;
    status?: string;
    summary?: string;
    error?: string;
}> {
    try {
        const { tenantId, userId, session } = await requireAuth('agents:approve');
        const cleanObjectApi = String(input.objectApiName || '').trim().toLowerCase();
        assertSafeMetadataIdentifier(cleanObjectApi, 'object API name');

        const cleanRecordId = String(input.recordId || '').trim();
        if (!UUID_RE.test(cleanRecordId)) {
            return { success: false, error: 'Valid record UUID is required.' };
        }
        const proposedStage = String(input.proposedStage || '').trim().slice(0, 100);
        const reason = String(input.reason || '').trim().slice(0, 400);
        if (!proposedStage || reason.length < 5) {
            return {
                success: false,
                error: 'Enter both a target stage and a justification (at least 5 characters).',
            };
        }

        const [meta, matchingRows] = await Promise.all([
            getObjectMetadata(cleanObjectApi),
            queryRecords(cleanObjectApi, { id: cleanRecordId }, 1, 0),
        ]);
        if (matchingRows.length === 0) {
            return {
                success: false,
                error: 'Record not found or hidden by Organization-Wide Defaults (OWD).',
            };
        }

        const approval = await createPersistedWorkflowApprovalRequest({
            policyId: 'agents.approval.review',
            tenantId,
            title: `Review ${meta.objectDef.name} (${cleanRecordId.slice(0, 8)}) -> ${proposedStage}`,
            description: `Proposed via Object Copilot on ${meta.objectDef.name}: transition record ${cleanRecordId.slice(0, 8)} to "${proposedStage}".`,
            priority: 'NORMAL',
            reason,
            resource: {
                type: 'metadata_record',
                id: cleanRecordId,
                tenantId,
                label: `${meta.objectDef.name} #${cleanRecordId.slice(0, 8)}`,
            },
            payload: {
                operation: 'METADATA_RECORD_STAGE_REVIEW',
                objectApiName: cleanObjectApi,
                recordId: cleanRecordId,
                proposedStage,
                source: 'OBJECT_COPILOT',
            },
            requestedBy: {
                userId,
                role: session.role as AuthorizationRole,
                tenantId,
            },
        });

        return {
            success: true,
            approvalId: approval.id,
            status: approval.status,
            summary: `Queued 4-eyes approval request #${approval.id.slice(0, 8)} (${approval.status}) under policy ${approval.policyId}.`,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to propose record review.',
        };
    }
}
