import { createHmac } from 'node:crypto';
import { runWithTenantContext, sql, sqlFor, withTenant } from '@/lib/db';
import { revalidateTag } from 'next/cache';
import {
    assertSafeMetadataIdentifier,
    detectMetadataDuplicates,
    eavValueColumnForType,
    isVirtualMetadataField,
    mapInboundWebhookPayloadToRecord,
    validateMetadataRecordPayload,
    type MetadataDataType,
    type MetadataValidationRules,
    type RuntimeMetadataField,
} from '@/lib/metadata/platform';
import {
    pickKnownMetadataFields,
    projectMetadataEavRows,
    resolveMetadataStorageMode,
    type MetadataEavJoinRow,
} from '@school-sis/api/src/metadata/runtime';
import { logger } from '@/lib/observability/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Derives the tenant-bound inbound webhook token from `INBOUND_WEBHOOK_SECRET`
 * so a token provisioned for Tenant A can never authenticate writes into Tenant B.
 */
export function deriveTenantInboundWebhookToken(secret: string, tenantId: string): string {
    return createHmac('sha256', secret)
        .update(`scholarmind:inbound-webhook:v1:${tenantId.toLowerCase()}`)
        .digest('hex');
}

type InboundObjectRow = {
    id: string;
    tenantId: string | null;
    name: string;
    apiName: string;
    tableName: string;
    isCustom: boolean;
};

type InboundFieldRow = RuntimeMetadataField & {
    id: string;
    objectId: string;
    isCustom: boolean;
    defaultValue: string | null;
    status: string;
    version: number;
};

/**
 * Non-Server-Action inbound lead webhook ingestion helper.
 * Must NEVER be exported from a `'use server'` file; callers (`POST /api/webhooks/inbound`
 * or `simulateInboundWebhookForCurrentTenant`) authenticate the tenant first.
 */
export async function ingestInboundWebhookLead(params: {
    tenantId: string;
    objectApiName: string;
    externalPayload: Record<string, unknown>;
    fieldMappings?: Record<string, string>;
    defaultValues?: Record<string, unknown>;
    sourceName?: string;
}): Promise<{
    success: boolean;
    recordId?: string;
    mappedFields?: string[];
    error?: string;
}> {
    try {
        const {
            tenantId,
            objectApiName,
            externalPayload,
            fieldMappings = {},
            defaultValues = {},
            sourceName = 'EXTERNAL_WEBHOOK',
        } = params;

        if (!UUID_RE.test(tenantId)) {
            return { success: false, error: 'Invalid tenant ID.' };
        }
        assertSafeMetadataIdentifier(objectApiName, 'target object API name');

        return await runWithTenantContext(tenantId, async () => {
            const objRows = await sql<InboundObjectRow>`
                SELECT id,
                       tenant_id AS "tenantId",
                       name,
                       api_name AS "apiName",
                       table_name AS "tableName",
                       COALESCE(is_custom, false) AS "isCustom"
                FROM metadata_objects
                WHERE api_name = ${objectApiName}
                  AND status = 'PUBLISHED'
                  AND (
                    tenant_id = ${tenantId}
                    OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
                  )
                ORDER BY CASE WHEN tenant_id = ${tenantId} THEN 0 ELSE 1 END, created_at DESC
                LIMIT 1
            `;
            if (objRows.length === 0) {
                return { success: false, error: 'Target custom object not found.' };
            }
            const objectDef = objRows[0];
            if (resolveMetadataStorageMode(objectDef) !== 'EAV') {
                return {
                    success: false,
                    error: 'Inbound webhook ingestion targets custom EAV objects.',
                };
            }

            const rawFields = await sql<{
                id: string;
                objectId: string;
                label: string;
                apiName: string;
                dataType: MetadataDataType;
                isCustom: boolean;
                isRequired: boolean;
                defaultValue: string | null;
                picklistOptions: string[];
                validationRules: MetadataValidationRules;
                status: string;
                version: number;
            }>`
                SELECT id,
                       object_id AS "objectId",
                       label,
                       api_name AS "apiName",
                       data_type AS "dataType",
                       COALESCE(is_custom, true) AS "isCustom",
                       COALESCE(is_required, false) AS "isRequired",
                       default_value AS "defaultValue",
                       COALESCE(picklist_options, '[]'::jsonb) AS "picklistOptions",
                       COALESCE(validation_rules, '{}'::jsonb) AS "validationRules",
                       status,
                       COALESCE(version, 1) AS "version"
                FROM metadata_fields
                WHERE object_id = ${objectDef.id}
                  AND status = 'ACTIVE'
                ORDER BY created_at ASC
            `;

            const persistedFields: InboundFieldRow[] = rawFields.filter(
                (f) => !isVirtualMetadataField(f),
            );
            const mappedCandidate = mapInboundWebhookPayloadToRecord(
                externalPayload,
                fieldMappings,
                defaultValues,
            );
            const knownPayload = pickKnownMetadataFields(persistedFields, mappedCandidate);
            const validated = validateMetadataRecordPayload(persistedFields, knownPayload, {
                requireAll: false,
            });
            if (validated.ok === false) {
                return { success: false, error: validated.errors.join(' ') };
            }

            const blockingFields = persistedFields.filter(
                (f) => f.validationRules?.duplicateRuleBehavior === 'BLOCK',
            );
            if (blockingFields.length > 0) {
                const eavRows = await sql<MetadataEavJoinRow>`
                    SELECT r.id AS record_id,
                           r.created_at,
                           r.updated_at,
                           f.api_name AS field_api_name,
                           f.data_type AS field_data_type,
                           v.value_string,
                           v.value_number,
                           v.value_boolean,
                           v.value_date
                    FROM (
                        SELECT id, created_at, updated_at
                        FROM metadata_records
                        WHERE object_id = ${objectDef.id}
                          AND tenant_id = ${tenantId}
                        ORDER BY created_at DESC
                        LIMIT 500
                    ) r
                    LEFT JOIN metadata_values v ON v.record_id = r.id
                    LEFT JOIN metadata_fields f ON f.id = v.field_id AND f.status = 'ACTIVE'
                `;
                const existingRecords = projectMetadataEavRows(eavRows);
                const dupCheck = detectMetadataDuplicates(
                    persistedFields,
                    validated.data,
                    existingRecords,
                );
                if (dupCheck.blocked && dupCheck.matches.length > 0) {
                    const firstBlock =
                        dupCheck.matches.find((m) => m.behavior === 'BLOCK') ?? dupCheck.matches[0];
                    return {
                        success: false,
                        error: `Duplicate submission blocked by rule on ${firstBlock.fieldLabel}.`,
                    };
                }
            }

            const fieldByApiName = new Map(persistedFields.map((f) => [f.apiName, f]));
            const recordId = await withTenant(tenantId, async (client) => {
                const q = sqlFor(client);
                const recRows = await q<{ id: string }>`
                    INSERT INTO metadata_records (id, tenant_id, object_id, created_at, updated_at)
                    VALUES (gen_random_uuid(), ${tenantId}, ${objectDef.id}, NOW(), NOW())
                    RETURNING id
                `;
                const newId = recRows[0].id;
                for (const [key, val] of Object.entries(validated.data)) {
                    if (val === null || val === undefined) continue;
                    const field = fieldByApiName.get(key);
                    if (!field) continue;
                    const col = eavValueColumnForType(field.dataType);
                    if (col === 'value_number') {
                        await q`
                            INSERT INTO metadata_values (id, record_id, field_id, value_number)
                            VALUES (gen_random_uuid(), ${newId}, ${field.id}, ${Number(val)})
                        `.execute();
                    } else if (col === 'value_boolean') {
                        await q`
                            INSERT INTO metadata_values (id, record_id, field_id, value_boolean)
                            VALUES (gen_random_uuid(), ${newId}, ${field.id}, ${Boolean(val)})
                        `.execute();
                    } else if (col === 'value_date') {
                        await q`
                            INSERT INTO metadata_values (id, record_id, field_id, value_date)
                            VALUES (gen_random_uuid(), ${newId}, ${field.id}, ${String(val)})
                        `.execute();
                    } else {
                        await q`
                            INSERT INTO metadata_values (id, record_id, field_id, value_string)
                            VALUES (gen_random_uuid(), ${newId}, ${field.id}, ${String(val)})
                        `.execute();
                    }
                }

                await q`
                    INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, after_state)
                    VALUES (
                        ${tenantId},
                        'CREATE',
                        ${objectApiName},
                        ${newId},
                        ${JSON.stringify({
                            auditEvent: 'INBOUND_WEBHOOK_INGESTED',
                            sourceName: String(sourceName).slice(0, 80),
                            mappedFields: Object.keys(validated.data),
                            ingestedAt: new Date().toISOString(),
                        })}::jsonb
                    )
                `.execute();

                return newId;
            });

            revalidateTag('metadata', 'max');
            return {
                success: true,
                recordId,
                mappedFields: Object.keys(validated.data),
            };
        });
    } catch (error) {
        logger.error('webhooks.inbound.ingest_failed', 'Failed to ingest inbound webhook lead', {
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return {
            success: false,
            error: 'Failed to ingest inbound webhook.',
        };
    }
}
