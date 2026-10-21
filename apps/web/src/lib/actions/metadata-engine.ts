'use server';

/**
 * @module lib/actions/metadata-engine
 *
 * Core Server Action & Runtime Engine for the ScholarMind Low-Code / No-Code (LCNC) Platform.
 *
 * File Organization:
 *   1. Types, Constants & Cached Metadata Schema Resolution (`getObjectMetadata`, `loadObjectMetadata`)
 *   2. Runtime Record Query, Relational Lookup & Formula Evaluation (`queryRecords`, `getLookupOptions`, `getRelatedLookupRecords`)
 *   3. Record Upsert Engine — Dual EAV (`metadata_records` / `metadata_values`) & Standard Table (`custom_data` JSONB)
 *   4. Object & Field Governance, Schema Versioning & Rollback (`createMetadataObject`, `createMetadataField`, `rollbackMetadataObjectToVersion`)
 *   5. Visual Builders: Page/List Layouts, Field-Level Security (FLS) & Inline Field Updates (`saveObjectLayout`, `updateFieldPermissions`, `updateRecordFieldValue`)
 *   6. Record Lifecycle: Deletion & Bulk CSV Import (`deleteRecord`, `bulkImportRecords`)
 *   7. Declarative Workflow Execution Engine (`runSingleWorkflowAction`, `executeMatchingWorkflows`)
 */

import { pool, runWithTenantContext, sql, sqlFor, identifier } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { redirect } from 'next/navigation';
import { unstable_cache, revalidateTag } from 'next/cache';
import { hash } from 'bcryptjs';
import crypto from 'crypto';
import { encryptEmail } from '@/lib/encryption';
import {
    requireApprovedWorkflowApprovalOrRequest,
    toWorkflowApprovalSummary,
} from '@school-sis/api';
import type { AuthorizationRole } from '@school-sis/api';
import {
    assertSafeMetadataIdentifier,
    detectMetadataDuplicates,
    evaluateMetadataFormula,
    evaluateMetadataRollupSummary,
    isSafeWebhookDestinationUrl,
    isVirtualMetadataField,
    normalizeMetadataFieldInput,
    quoteIdentifier,
    redactSensitiveWorkflowPayload,
    validateMetadataRecordPayload,
    validateScholarMindSchemaBundle,
    type DuplicateMatchEntry,
    type MetadataDataType,
    type MetadataValidationRules,
    type ScholarMindSchemaBundle,
} from '@/lib/metadata/platform';
import {
    getEducationBlueprintById,
    type EducationBlueprintId,
} from '@/lib/metadata/blueprints';
import {
    canWriteMetadataField,
    checkWritableMetadataPayload,
    filterReadableMetadataFields,
    type MetadataFieldPermission,
    type RuntimeMetadataFieldWithPermissions,
} from '@/lib/metadata/access-control';
import {
    buildMetadataEavAssignments,
    metadataEavResetColumns,
    metadataTableNameForNewObject,
    pickKnownMetadataFields,
    projectMetadataEavRows,
    resolveMetadataStorageMode,
    type MetadataEavJoinRow,
    type MetadataStorageMode,
} from '@school-sis/api/src/metadata/runtime';

export interface MetadataObject {
    id: string;
    tenantId: string | null;
    name: string;
    apiName: string;
    tableName: string;
    isCustom: boolean;
    status: string;
    version: number;
    publishedVersion: number;
}

export interface MetadataField {
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
    /**
     * Role grants from `field_permissions`. Present on the server-side field
     * list; stripped before the list is handed to a page/client component so the
     * permission matrix itself is never shipped to the browser.
     */
    permissions?: MetadataFieldPermission[];
    /**
     * Whether the CURRENT caller may write this field. Computed per request from
     * `permissions`; safe to send to the browser because it describes only the
     * signed-in role's own access.
     */
    canWrite?: boolean;
}

export interface MetadataLayout {
    id: string;
    objectId: string;
    layoutType: 'FORM' | 'LIST';
    schema: Record<string, unknown>;
    isDefault: boolean;
}

export type MetadataApprovalRequiredResult = {
    approvalRequired: true;
    approval: ReturnType<typeof toWorkflowApprovalSummary>;
};

const PROTECTED_DATA_FIELDS = new Set(['id', 'tenantId', 'tenant_id']);

async function fetchObjectMetadata(apiName: string, tenantId: string) {
    assertSafeMetadataIdentifier(apiName, 'object API name');

    // Get Object
    const objRows = await sql<MetadataObject>`
        SELECT id,
               tenant_id as "tenantId",
               name,
               api_name as "apiName",
               table_name as "tableName",
               is_custom as "isCustom",
               status,
               version,
               published_version as "publishedVersion"
        FROM metadata_objects
        WHERE api_name = ${apiName}
          AND status = 'PUBLISHED'
          AND (
            tenant_id = ${tenantId}
            OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
          )
        ORDER BY CASE WHEN tenant_id = ${tenantId} THEN 0 ELSE 1 END, created_at DESC
        LIMIT 1
    `;
    if (objRows.length === 0) throw new Error(`Object ${apiName} not found`);
    const objectDef: MetadataObject = objRows[0];

    assertSafeMetadataIdentifier(objectDef.tableName, 'metadata table name');

    // Get Fields.
    //
    // `metadata_fields` and `field_permissions` have no tenant_id of their own;
    // both are reached through `object_id`, and `objectDef` above was already
    // resolved under the tenant visibility rule, so the parent scoping holds.
    const fields = await sql<MetadataField>`
        SELECT f.id,
               f.object_id as "objectId",
               f.label,
               f.api_name as "apiName",
               f.data_type as "dataType",
               COALESCE(f.is_custom, false) as "isCustom",
               COALESCE(f.is_required, false) as "isRequired",
               f.default_value as "defaultValue",
               COALESCE(f.picklist_options, '[]'::jsonb) as "picklistOptions",
               COALESCE(f.validation_rules, '{}'::jsonb) as "validationRules",
               f.status,
               f.version,
               COALESCE(
                 jsonb_agg(
                   jsonb_build_object(
                     'role', fp.role,
                     'canRead', COALESCE(fp.can_read, true),
                     'canWrite', COALESCE(fp.can_write, false)
                   )
                 ) FILTER (WHERE fp.id IS NOT NULL),
                 '[]'::jsonb
               ) as permissions
        FROM metadata_fields f
        LEFT JOIN field_permissions fp ON fp.field_id = f.id
        WHERE f.object_id = ${objectDef.id}
          AND f.status = 'ACTIVE'
        GROUP BY f.id, f.object_id, f.label, f.api_name, f.data_type, f.is_custom,
                 f.is_required, f.default_value, f.picklist_options, f.validation_rules,
                 f.status, f.version, f.created_at
        ORDER BY f.created_at ASC, f.api_name ASC
    `;

    // Get Layouts
    const layouts = await sql<MetadataLayout>`
        SELECT id, object_id as "objectId", layout_type as "layoutType", schema, is_default as "isDefault"
        FROM metadata_layouts
        WHERE object_id = ${objectDef.id} AND is_default = true
    `;

    return { objectDef, fields, layouts };
}

const getCachedObjectMetadata = unstable_cache(
    async (apiName: string, tenantId: string) => {
        return runWithTenantContext(tenantId, () => fetchObjectMetadata(apiName, tenantId));
    },
    ['object-metadata'],
    {
        tags: ['metadata']
    }
);

/**
 * Internal loader. Returns EVERY active field, permission rows included.
 * Callers that hand fields to a page or client component must go through
 * `getObjectMetadata`, which filters to the caller's readable fields.
 */
async function loadObjectMetadata(apiName: string, tenantId: string) {
    if (process.env.NODE_ENV === 'test' || process.env.DATABASE_URL?.includes('_test')) {
        return runWithTenantContext(tenantId, () => fetchObjectMetadata(apiName, tenantId));
    }
    return getCachedObjectMetadata(apiName, tenantId);
}

/** Never ship the role/permission matrix to the browser. */
function toClientField(field: MetadataField): MetadataField {
    const { permissions: _permissions, ...rest } = field;
    return rest as MetadataField;
}

/**
 * Fetches the object definition, the fields the caller's role may READ, and the
 * layout schemas.
 *
 * Field-level permissions are applied here rather than in each page, so the
 * metadata surface enforces exactly what `/api/data/[object_name]` enforces.
 */
export async function getObjectMetadata(apiName: string): Promise<{
    objectDef: MetadataObject;
    fields: MetadataField[];
    layouts: MetadataLayout[];
    storageMode: MetadataStorageMode;
    hiddenFieldCount: number;
}> {
    const { tenantId, session } = await requireAuth();
    const { objectDef, fields, layouts } = await loadObjectMetadata(apiName, tenantId);

    const readable = filterReadableMetadataFields(
        fields as RuntimeMetadataFieldWithPermissions[],
        session.role,
    ) as unknown as MetadataField[];

    return {
        objectDef,
        fields: readable.map(field => ({
            ...toClientField(field),
            canWrite: canWriteMetadataField(
                session.role,
                field as unknown as RuntimeMetadataFieldWithPermissions,
            ),
        })),
        layouts,
        storageMode: resolveMetadataStorageMode(objectDef),
        hiddenFieldCount: fields.length - readable.length,
    };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clampPageSize(value: unknown, fallback: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(Math.trunc(parsed), 0), max);
}

/** The only filter the generic surfaces pass today is the record id. */
function readIdFilter(filters: Record<string, unknown>): string | null {
    const raw = filters?.id;
    if (raw == null || raw === '') return null;
    const value = String(raw);
    if (!UUID_RE.test(value)) throw new Error('Invalid record id.');
    return value;
}

/**
 * EAV read for tenant-defined objects.
 *
 * `metadata_values` has no tenant_id, so it is only ever reached through the
 * `page` CTE, which is constrained on `metadata_records.tenant_id` AND on the
 * parent object row. Unreadable fields are excluded by id, so a role that
 * cannot read a field never receives the cell at all.
 */
async function queryEavRecords(
    objectDef: MetadataObject,
    readableFields: MetadataField[],
    tenantId: string,
    recordId: string | null,
    limit: number,
    offset: number,
) {
    const { rows } = await pool.query(
        `WITH page AS (
             SELECT r.id, r.created_at, r.updated_at
             FROM metadata_records r
             JOIN metadata_objects o ON o.id = r.object_id
             WHERE r.object_id = $1
               AND r.tenant_id = $2
               AND o.tenant_id = $2
               AND ($4::uuid IS NULL OR r.id = $4::uuid)
             ORDER BY r.created_at DESC, r.id
             LIMIT $5 OFFSET $6
         )
         SELECT p.id AS record_id,
                p.created_at,
                p.updated_at,
                f.api_name AS field_api_name,
                f.data_type,
                v.value_string,
                v.value_number,
                v.value_boolean,
                v.value_date
         FROM page p
         LEFT JOIN metadata_values v ON v.record_id = p.id
         LEFT JOIN metadata_fields f
                ON f.id = v.field_id
               AND f.object_id = $1
               AND f.status = 'ACTIVE'
               AND f.id = ANY($3::uuid[])
         ORDER BY p.created_at DESC, p.id`,
        [
            objectDef.id,
            tenantId,
            readableFields.map(field => field.id),
            recordId,
            limit,
            offset,
        ],
    );

    return projectMetadataEavRows(rows as MetadataEavJoinRow[]);
}

/**
 * Fetch records for a specific object.
 *
 * Dispatches on storage mode: table-backed objects project over a physical
 * table (standard columns + `custom_data` JSONB); tenant-defined objects read
 * from `metadata_records`/`metadata_values`.
 */
// ============================================================================
// 2. Runtime Record Query, Relational Lookup & Formula Evaluation
// ============================================================================

/**
 * Evaluates virtual `ROLLUP_SUMMARY` and `FORMULA` fields against each record's
 * projected field values. Roll-Up Summaries are evaluated first so formulas can
 * reference rolled-up values.
 */
async function applyCalculatedFields(
    records: Record<string, unknown>[],
    readableFields: MetadataField[],
    tenantId: string,
): Promise<Record<string, unknown>[]> {
    if (records.length === 0) return records;

    const rollupFields = readableFields.filter(
        f =>
            f.validationRules?.fieldSubType === 'ROLLUP_SUMMARY' &&
            Boolean(f.validationRules?.rollupChildObject) &&
            Boolean(f.validationRules?.rollupForeignKeyField),
    );
    const formulaFields = readableFields.filter(
        f =>
            f.validationRules?.fieldSubType === 'FORMULA' &&
            Boolean(f.validationRules?.formulaExpression),
    );
    if (rollupFields.length === 0 && formulaFields.length === 0) return records;

    const childRowsByObject = new Map<string, Record<string, unknown>[]>();
    for (const rf of rollupFields) {
        const childObjApi = rf.validationRules!.rollupChildObject!;
        if (childRowsByObject.has(childObjApi)) continue;
        try {
            const { objectDef: childObj, fields: childFields } = await loadObjectMetadata(
                childObjApi,
                tenantId,
            );
            const activeChildFields = childFields.filter(f => !isVirtualMetadataField(f));
            if (resolveMetadataStorageMode(childObj) === 'EAV') {
                const rows = await queryEavRecords(
                    childObj,
                    activeChildFields,
                    tenantId,
                    null,
                    500,
                    0,
                );
                childRowsByObject.set(childObjApi, rows);
            } else {
                const tableIdent = identifier(childObj.tableName);
                const rows = await sql<Record<string, unknown>>`
                    SELECT * FROM ${tableIdent} WHERE tenant_id = ${tenantId} LIMIT 500
                `;
                childRowsByObject.set(childObjApi, rows);
            }
        } catch {
            childRowsByObject.set(childObjApi, []);
        }
    }

    return records.map(rec => {
        const next = { ...rec };
        const parentId = String(next.id ?? '');
        for (const rf of rollupFields) {
            const childObjApi = rf.validationRules!.rollupChildObject!;
            const fkField = rf.validationRules!.rollupForeignKeyField!;
            const aggregate = rf.validationRules!.rollupAggregate ?? 'COUNT';
            const targetField = rf.validationRules!.rollupTargetField;
            const allChildRows = childRowsByObject.get(childObjApi) ?? [];
            const matchingChildren = parentId
                ? allChildRows.filter(row => String(row[fkField] ?? '') === parentId)
                : [];
            next[rf.apiName] = evaluateMetadataRollupSummary(
                aggregate,
                matchingChildren,
                targetField,
            );
        }
        for (const f of formulaFields) {
            const expr = f.validationRules?.formulaExpression;
            if (expr) {
                next[f.apiName] = evaluateMetadataFormula(expr, next);
            }
        }
        return next;
    });
}

/**
 * Queries tenant-scoped records for a metadata object (either EAV or table-backed),
 * enforces Field-Level Security (FLS) read grants for the caller's role, flattens
 * readable `custom_data` JSONB keys, and computes virtual `ROLLUP_SUMMARY` and `FORMULA` fields.
 */
export async function queryRecords(apiName: string, filters: Record<string, unknown> = {}, limit = 50, offset = 0) {
    const { tenantId, session } = await requireAuth();
    const { objectDef, fields } = await loadObjectMetadata(apiName, tenantId);

    const readableFields = filterReadableMetadataFields(
        fields as RuntimeMetadataFieldWithPermissions[],
        session.role,
    ) as unknown as MetadataField[];
    if (readableFields.length === 0) return [];

    const recordId = readIdFilter(filters);
    const safeLimit = clampPageSize(limit, 50, 500);
    const safeOffset = clampPageSize(offset, 0, 1_000_000);

    if (resolveMetadataStorageMode(objectDef) === 'EAV') {
        const eavRecords = await queryEavRecords(objectDef, readableFields, tenantId, recordId, safeLimit, safeOffset);
        return applyCalculatedFields(eavRecords, readableFields, tenantId);
    }

    // Build standard SELECT columns
    const standardFields = readableFields.filter(f => !f.isCustom).map(f => quoteIdentifier(f.apiName));
    // Determine if we need to fetch custom_data
    const readableCustomFieldNames = new Set(readableFields.filter(f => f.isCustom).map(f => f.apiName));
    const tableName = quoteIdentifier(objectDef.tableName);

    // We always need id and tenant_id
    const selectCols = [quoteIdentifier('id'), ...standardFields];
    if (readableCustomFieldNames.size > 0) {
        selectCols.push(quoteIdentifier('custom_data'));
    }

    const params: unknown[] = [tenantId];
    let query = `SELECT ${selectCols.join(', ')} FROM ${tableName} WHERE tenant_id = $1`;
    if (recordId) {
        params.push(recordId);
        query += ` AND id = $${params.length}`;
    }
    params.push(safeLimit);
    query += ` LIMIT $${params.length}`;
    params.push(safeOffset);
    query += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(query, params);

    // Flatten custom_data into the root object for the UI
    const projected = rows.map(row => {
        const { custom_data, ...rest } = row;
        const serializedRest: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(rest)) {
            if (val instanceof Date) {
                serializedRest[key] = val.toISOString().split('T')[0];
            } else {
                serializedRest[key] = val;
            }
        }
        // Only surface custom keys the caller is allowed to read.
        for (const [key, val] of Object.entries(custom_data || {})) {
            if (readableCustomFieldNames.has(key)) serializedRest[key] = val;
        }
        return serializedRest;
    });

    return applyCalculatedFields(projected, readableFields, tenantId);
}

/**
 * Returns selectable `{ id, label }` options for a Relational Lookup (`LOOKUP`) field.
 */
export async function getLookupOptions(
    targetObjectApiName: string,
): Promise<{ id: string; label: string }[]> {
    try {
        const rows = await queryRecords(targetObjectApiName, {}, 100, 0);
        return rows.map(row => {
            const id = String(row.id || '');
            const displayCandidate =
                row.name ||
                (row.first_name || row.last_name
                    ? `${row.first_name || ''} ${row.last_name || ''}`.trim()
                    : '') ||
                row.invoice_number ||
                row.admission_number ||
                row.employee_id ||
                row.title ||
                Object.entries(row).find(
                    ([k, v]) =>
                        k !== 'id' &&
                        k !== 'created_at' &&
                        k !== 'updated_at' &&
                        typeof v === 'string' &&
                        v.trim().length > 0,
                )?.[1] ||
                id.slice(0, 8);
            return {
                id,
                label: `${String(displayCandidate)} (${id.slice(0, 8)})`,
            };
        });
    } catch {
        return [];
    }
}

export interface RelatedLookupGroup {
    objectApiName: string;
    objectLabel: string;
    fieldApiName: string;
    fieldLabel: string;
    records: Record<string, unknown>[];
}

/**
 * Discovers all child records across any object that reference `parentRecordId`
 * via a Relational Lookup (`LOOKUP`) field targeting `parentObjectApiName`.
 */
export async function getRelatedLookupRecords(
    parentObjectApiName: string,
    parentRecordId: string,
): Promise<RelatedLookupGroup[]> {
    try {
        const { tenantId } = await requireAuth();
        if (!UUID_RE.test(parentRecordId)) return [];

        const lookupFields = await sql<{
            object_api_name: string;
            object_name: string;
            field_api_name: string;
            field_label: string;
        }>`
            SELECT o.api_name as object_api_name,
                   o.name as object_name,
                   f.api_name as field_api_name,
                   f.label as field_label
            FROM metadata_fields f
            JOIN metadata_objects o ON o.id = f.object_id
            WHERE f.status = 'ACTIVE'
              AND o.status = 'PUBLISHED'
              AND (
                o.tenant_id = ${tenantId}
                OR (o.tenant_id IS NULL AND COALESCE(o.is_custom, false) = false)
              )
              AND f.validation_rules->>'fieldSubType' = 'LOOKUP'
              AND LOWER(f.validation_rules->>'lookupTargetObject') = LOWER(${parentObjectApiName})
        `;

        const groups: RelatedLookupGroup[] = [];
        for (const item of lookupFields) {
            const allRecords = await queryRecords(item.object_api_name, {}, 100, 0);
            const matched = allRecords.filter(
                rec => String(rec[item.field_api_name] ?? '') === parentRecordId,
            );
            groups.push({
                objectApiName: item.object_api_name,
                objectLabel: item.object_name,
                fieldApiName: item.field_api_name,
                fieldLabel: item.field_label,
                records: matched,
            });
        }
        return groups;
    } catch {
        return [];
    }
}

/** Flat result shape, per the server-action convention. Success redirects. */
export type UpsertRecordResult = { success: false; error: string } | void;

/**
 * Writes one record of a tenant-defined object into
 * `metadata_records`/`metadata_values`.
 *
 * Tenant scoping: the record row carries `tenant_id` and is always matched on
 * it; `metadata_values` rows are only ever addressed by a `record_id` that this
 * transaction has already proven belongs to the session tenant. On update the
 * parent record row is locked FOR UPDATE first, so the read-modify-write of each
 * cell cannot interleave with a concurrent edit of the same record.
 */
async function upsertEavRecord(
    objectDef: MetadataObject,
    fields: MetadataField[],
    tenantId: string,
    validatedData: Record<string, unknown>,
    id?: string,
) {
    const assignments = buildMetadataEavAssignments(fields, validatedData);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        let recordId = id;
        if (recordId) {
            const { rows } = await client.query(
                `SELECT id FROM metadata_records
                 WHERE id = $1 AND tenant_id = $2 AND object_id = $3
                 FOR UPDATE`,
                [recordId, tenantId, objectDef.id],
            );
            if (rows.length === 0) throw new Error('Record not found.');
        } else {
            const { rows } = await client.query(
                `INSERT INTO metadata_records (tenant_id, object_id, created_at, updated_at)
                 VALUES ($1, $2, NOW(), NOW())
                 RETURNING id`,
                [tenantId, objectDef.id],
            );
            recordId = rows[0].id as string;
        }

        for (const assignment of assignments) {
            // metadata_values has no natural key, so update-then-insert under the
            // record lock taken above. The other three value columns are blanked
            // so a field whose data type changed cannot leave a stale cell behind.
            const resetClauses = metadataEavResetColumns(assignment.column)
                .map(column => `${quoteIdentifier(column)} = NULL`)
                .join(', ');

            const { rowCount } = await client.query(
                `UPDATE metadata_values
                 SET ${resetClauses}, ${quoteIdentifier(assignment.column)} = $3
                 WHERE record_id = $1 AND field_id = $2`,
                [recordId, assignment.fieldId, assignment.value],
            );

            if (rowCount === 0) {
                await client.query(
                    `INSERT INTO metadata_values (record_id, field_id, ${quoteIdentifier(assignment.column)})
                     VALUES ($1, $2, $3)`,
                    [recordId, assignment.fieldId, assignment.value],
                );
            }
        }

        await client.query(
            `UPDATE metadata_records SET updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
            [recordId, tenantId],
        );

        await client.query('COMMIT');
        return recordId as string;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Inserts or Updates a record, mapping fields to columns and packing unknown fields into JSONB custom_data
 */
export async function upsertRecord(apiName: string, data: Record<string, unknown>, id?: string): Promise<UpsertRecordResult> {
    try {
        const { tenantId, session } = await requireAuth();
        const { objectDef, fields } = await loadObjectMetadata(apiName, tenantId);

        // Strip virtual FORMULA / ROLLUP_SUMMARY fields so they are never treated as writable/required inputs
        const persistedFields = fields.filter(f => !isVirtualMetadataField(f));

        // Field-level write permissions, identical to /api/data/[object_name].
        const submitted = pickKnownMetadataFields(persistedFields, data);
        const writeAccess = checkWritableMetadataPayload(
            persistedFields as RuntimeMetadataFieldWithPermissions[],
            session.role,
            submitted,
        );
        if (writeAccess.ok === false) {
            const denied = [...new Set([...writeAccess.deniedFields, ...writeAccess.blockedRequiredFields])];
            return {
                success: false,
                error: `You do not have permission to write: ${denied.join(', ')}.`,
            };
        }

        if (resolveMetadataStorageMode(objectDef) === 'EAV') {
            const validated = validateMetadataRecordPayload(persistedFields, submitted, { requireAll: !id });
            if (validated.ok === false) {
                return { success: false, error: validated.errors.join(' ') };
            }
            const hasBlockingDuplicateRule = persistedFields.some(
                f => f.validationRules?.duplicateRuleBehavior === 'BLOCK',
            );
            if (hasBlockingDuplicateRule) {
                const existingRecords = await queryRecords(apiName, {}, 250, 0);
                const dupCheck = detectMetadataDuplicates(
                    persistedFields,
                    validated.data,
                    existingRecords,
                    { excludeRecordId: id },
                );
                if (dupCheck.blocked && dupCheck.matches.length > 0) {
                    const firstBlock = dupCheck.matches.find(m => m.behavior === 'BLOCK') ?? dupCheck.matches[0];
                    return {
                        success: false,
                        error: `Duplicate blocked: ${firstBlock.fieldLabel} "${firstBlock.matchedValue}" already exists on record ${firstBlock.recordId.slice(0, 8)}.`,
                    };
                }
            }
            const savedId = await upsertEavRecord(objectDef, persistedFields, tenantId, validated.data, id);
            await executeMatchingWorkflows(tenantId, apiName, 'object.record.upserted', validated.data, savedId);
            redirect(`/app/${apiName}`);
        }

        const standardFields = persistedFields.filter(f => !f.isCustom);
        const customFields = persistedFields.filter(f => f.isCustom);
        
        // Separate data into standard columns and custom_data
        const standardData: Record<string, unknown> = {};
        const customData: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(data)) {
            if (PROTECTED_DATA_FIELDS.has(key)) {
                // Tenant ownership is derived from the authenticated session only.
                continue;
            }
            if (standardFields.some(f => f.apiName === key)) {
                standardData[key] = value === '' ? null : value;
            } else if (customFields.some(f => f.apiName === key)) {
                customData[key] = value;
            }
        }

        if (!id) {
            if (apiName === 'student') {
                if (!standardData.date_of_birth) {
                    standardData.date_of_birth = '2010-01-01';
                }
                if (!standardData.gender) {
                    standardData.gender = 'Other';
                }
                if (!standardData.grade_id) {
                    const gradeRows = await sql<{ id: string }>`
                        SELECT id FROM grades WHERE tenant_id = ${tenantId} LIMIT 1
                    `;
                    if (gradeRows.length > 0) standardData.grade_id = gradeRows[0].id;
                } else {
                    const gradeCheck = await sql<{ ok: number }>`
                        SELECT 1 AS ok FROM grades WHERE id = ${String(standardData.grade_id)} AND tenant_id = ${tenantId} LIMIT 1
                    `;
                    if (gradeCheck.length === 0) throw new Error('Grade not found for tenant');
                }
                if (!standardData.section_id) {
                    const sectionRows = await sql<{ id: string }>`
                        SELECT id FROM sections WHERE tenant_id = ${tenantId} LIMIT 1
                    `;
                    if (sectionRows.length > 0) standardData.section_id = sectionRows[0].id;
                } else {
                    const sectionCheck = await sql<{ ok: number }>`
                        SELECT 1 AS ok FROM sections WHERE id = ${String(standardData.section_id)} AND tenant_id = ${tenantId} LIMIT 1
                    `;
                    if (sectionCheck.length === 0) throw new Error('Section not found for tenant');
                }
            }

            if (apiName === 'staff') {
                if (!standardData.joining_date) {
                    standardData.joining_date = new Date().toISOString().split('T')[0];
                }
                // Create a user account for the staff member
                // A fabricated fallback identity for a staff row imported without an
                // email. Deliberately on the RFC 2606 `.invalid` domain so it can
                // never resolve, be mistaken for a real address, or carry the
                // demo school domain into a real tenant's user table.
                const importedEmail = typeof standardData.email === 'string' && standardData.email.includes('@')
                    ? standardData.email
                    : `${standardData.employee_id || 'staff_' + Math.random().toString(36).substring(2, 11)}@imported.invalid`;
                const email = importedEmail;
                const passwordHash = await hash(crypto.randomBytes(18).toString('base64url'), 12);
                const firstName = String(customData.first_name || 'Staff');
                const lastName = String(customData.last_name || 'Member');
                const userRows = await sql<{ id: string }>`
                    INSERT INTO users (tenant_id, email_enc, password_hash, role, first_name, last_name)
                    VALUES (${tenantId}, ${encryptEmail(email)}, ${passwordHash}, 'TEACHER', ${firstName}, ${lastName})
                    RETURNING id
                `;
                standardData.user_id = userRows[0].id;
            }

            if (apiName === 'invoice') {
                if (!standardData.invoice_number) {
                    standardData.invoice_number = `INV-2026-${Math.floor(Math.random() * 1000000)}`;
                }
                if (!standardData.due_date) {
                    standardData.due_date = '2026-06-30';
                }
                if (!standardData.status) {
                    standardData.status = 'PENDING';
                }
                if (!standardData.paid_amount) {
                    standardData.paid_amount = '0.00';
                }
                if (!standardData.student_id || typeof standardData.student_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(standardData.student_id)) {
                    const studentRows = await sql<{ id: string }>`
                        SELECT id FROM students WHERE tenant_id = ${tenantId} LIMIT 1
                    `;
                    if (studentRows.length > 0) standardData.student_id = studentRows[0].id;
                } else {
                    const studentCheck = await sql<{ ok: number }>`
                        SELECT 1 AS ok FROM students WHERE id = ${String(standardData.student_id)} AND tenant_id = ${tenantId} LIMIT 1
                    `;
                    if (studentCheck.length === 0) throw new Error('Student not found for tenant');
                }
                if (!standardData.fee_plan_id) {
                    const feePlanRows = await sql<{ id: string }>`
                        SELECT id FROM fee_plans WHERE tenant_id = ${tenantId} LIMIT 1
                    `;
                    if (feePlanRows.length > 0) standardData.fee_plan_id = feePlanRows[0].id;
                } else {
                    const feePlanCheck = await sql<{ ok: number }>`
                        SELECT 1 AS ok FROM fee_plans WHERE id = ${String(standardData.fee_plan_id)} AND tenant_id = ${tenantId} LIMIT 1
                    `;
                    if (feePlanCheck.length === 0) throw new Error('Fee plan not found for tenant');
                }
            }
        }

        if (typeof standardData.gender === 'string' && standardData.gender) {
            standardData.gender = standardData.gender.toUpperCase();
        }

        const validated = validateMetadataRecordPayload(persistedFields, { ...standardData, ...customData }, { requireAll: !id });
        if (validated.ok === false) {
            return { success: false, error: validated.errors.join(' ') };
        }

        for (const field of standardFields) {
            if (Object.prototype.hasOwnProperty.call(validated.data, field.apiName)) {
                standardData[field.apiName] = validated.data[field.apiName];
            }
        }
        for (const field of customFields) {
            if (Object.prototype.hasOwnProperty.call(validated.data, field.apiName)) {
                customData[field.apiName] = validated.data[field.apiName];
            }
        }

        const hasCustomData = Object.keys(customData).length > 0 || customFields.length > 0;
        const tableName = quoteIdentifier(objectDef.tableName);
        
        if (id) {
            // UPDATE
            const setClauses: string[] = [];
            const values: unknown[] = [id, tenantId];
            let argIndex = 3;

            for (const [key, value] of Object.entries(standardData)) {
                setClauses.push(`${quoteIdentifier(key)} = $${argIndex++}`);
                values.push(value);
            }

            if (hasCustomData) {
                setClauses.push(`${quoteIdentifier('custom_data')} = COALESCE(${quoteIdentifier('custom_data')}, '{}'::jsonb) || $${argIndex++}`);
                values.push(JSON.stringify(customData));
            }

            if (setClauses.length === 0) redirect(`/app/${apiName}`); // Nothing to update

            const query = `
                UPDATE ${tableName}
                SET ${setClauses.join(', ')}, ${quoteIdentifier('updated_at')} = CURRENT_TIMESTAMP
                WHERE id = $1 AND tenant_id = $2
                RETURNING id
            `;
            const { rows } = await pool.query(query, values);
            await executeMatchingWorkflows(
                tenantId,
                apiName,
                'object.record.upserted',
                { ...standardData, ...customData },
                String(rows[0]?.id ?? id),
            );
            
            redirect(`/app/${apiName}`);
        } else {
            // INSERT
            const keys = [quoteIdentifier('tenant_id')];
            const values: unknown[] = [tenantId];
            const placeholders = ['$1'];
            let argIndex = 2;

            for (const [key, value] of Object.entries(standardData)) {
                keys.push(quoteIdentifier(key));
                values.push(value);
                placeholders.push(`$${argIndex++}`);
            }

            if (hasCustomData || customFields.length > 0) {
                keys.push(quoteIdentifier('custom_data'));
                values.push(JSON.stringify(customData));
                placeholders.push(`$${argIndex++}`);
            }

            const query = `
                INSERT INTO ${tableName} (${keys.join(', ')})
                VALUES (${placeholders.join(', ')})
                RETURNING id
            `;
            const { rows } = await pool.query(query, values);
            const recordId = rows[0].id;
            await executeMatchingWorkflows(
                tenantId,
                apiName,
                'object.record.upserted',
                { ...standardData, ...customData },
                String(recordId),
            );

            redirect(`/app/${apiName}`);
        }
    } catch (e: unknown) {
        const redirectErr = e as { digest?: string; message?: string };
        if (redirectErr?.digest?.startsWith('NEXT_REDIRECT') || redirectErr?.message === 'NEXT_REDIRECT') {
            throw e;
        }
        console.error("UPSERT RECORD ERROR FOR OBJECT:", apiName, e);
        // Flat result: the generic form is a client component and cannot read a
        // thrown server-action error in production (Next redacts the message).
        return { success: false, error: redirectErr?.message || 'Failed to save record.' };
    }
}

/**
 * Fetches all metadata objects for the Object Manager
 */
export async function getAllMetadataObjects() {
    const { tenantId } = await requireAuth();
    return sql<Record<string, unknown>>`
        SELECT *
        FROM (
            SELECT DISTINCT ON (api_name) *
            FROM metadata_objects
            WHERE status <> 'ARCHIVED'
              AND (
                tenant_id = ${tenantId}
                OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
              )
            ORDER BY api_name, CASE WHEN tenant_id = ${tenantId} THEN 0 ELSE 1 END, created_at DESC
        ) resolved_objects
        ORDER BY name ASC
    `;
}

type MetadataDbClient = {
    query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

async function snapshotMetadataSchema(
    client: MetadataDbClient,
    params: {
        tenantId: string | null;
        objectId: string;
        userId: string;
        version: number;
        operation: string;
        migrationPlan?: Record<string, unknown>;
    },
) {
    const { rows: objectRows } = await client.query(
        `SELECT id, tenant_id, name, api_name, table_name, description, is_custom, status, version, published_version
         FROM metadata_objects
         WHERE id = $1`,
        [params.objectId],
    );
    if (objectRows.length === 0) throw new Error('Object not found for schema snapshot.');

    const { rows: fields } = await client.query(
        `SELECT id, label, api_name, data_type, is_custom, is_required, default_value, picklist_options,
                validation_rules, status, version
         FROM metadata_fields
         WHERE object_id = $1
           AND status <> 'ARCHIVED'
         ORDER BY created_at ASC`,
        [params.objectId],
    );

    const schemaSnapshot = {
        object: objectRows[0],
        fields,
    };

    const { rows } = await client.query(
        `INSERT INTO metadata_schema_versions (
            tenant_id, object_id, version, status, schema_snapshot, migration_plan,
            created_by, published_by, published_at
         )
         VALUES ($1, $2, $3, 'PUBLISHED', $4::jsonb, $5::jsonb, $6, $6, NOW())
         ON CONFLICT (object_id, version)
         DO UPDATE SET
            status = EXCLUDED.status,
            schema_snapshot = EXCLUDED.schema_snapshot,
            migration_plan = EXCLUDED.migration_plan,
            published_by = EXCLUDED.published_by,
            published_at = EXCLUDED.published_at
         RETURNING id`,
        [
            params.tenantId,
            params.objectId,
            params.version,
            JSON.stringify(schemaSnapshot),
            JSON.stringify(params.migrationPlan || { operation: params.operation }),
            params.userId,
        ],
    );

    return rows[0].id as string;
}

async function ensureTenantOwnedMetadataObject(
    client: MetadataDbClient,
    objectId: string,
    tenantId: string,
    userId: string,
) {
    const { rows: sourceRows } = await client.query(
        `SELECT id, tenant_id, name, api_name, table_name, description, is_custom, version
         FROM metadata_objects
         WHERE id = $1
           AND status <> 'ARCHIVED'
           AND (
             tenant_id = $2
             OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
           )
         FOR UPDATE`,
        [objectId, tenantId],
    );

    if (sourceRows.length === 0) throw new Error('Object not found or unauthorized');
    const source = sourceRows[0];
    if (source.tenant_id === tenantId) return { id: source.id as string, version: Number(source.version || 1) };

    const { rows: existingRows } = await client.query(
        `SELECT id, version
         FROM metadata_objects
         WHERE tenant_id = $1
           AND api_name = $2
           AND status <> 'ARCHIVED'
         FOR UPDATE`,
        [tenantId, source.api_name],
    );
    if (existingRows.length > 0) {
        return { id: existingRows[0].id as string, version: Number(existingRows[0].version || 1) };
    }

    const { rows: insertedRows } = await client.query(
        `INSERT INTO metadata_objects (
            tenant_id, name, api_name, table_name, description, is_custom,
            status, version, published_version, published_at, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'PUBLISHED', 1, 1, NOW(), NOW(), NOW())
         ON CONFLICT (tenant_id, api_name)
         DO UPDATE SET updated_at = metadata_objects.updated_at
         RETURNING id, version`,
        [
            tenantId,
            source.name,
            source.api_name,
            source.table_name,
            source.description,
            source.is_custom,
        ],
    );
    const tenantObject = { id: insertedRows[0].id as string, version: Number(insertedRows[0].version || 1) };

    await client.query(
        `INSERT INTO metadata_fields (
            object_id, label, api_name, data_type, is_custom, is_required, default_value,
            picklist_options, validation_rules, status, version, created_at, updated_at
         )
         SELECT $1, label, api_name, data_type, is_custom, is_required, default_value,
                COALESCE(picklist_options, '[]'::jsonb),
                COALESCE(validation_rules, '{}'::jsonb),
                'ACTIVE',
                COALESCE(version, 1),
                NOW(),
                NOW()
         FROM metadata_fields
         WHERE object_id = $2
           AND status = 'ACTIVE'
         ON CONFLICT (object_id, api_name) DO NOTHING`,
        [tenantObject.id, source.id],
    );

    await client.query(
        `INSERT INTO metadata_layouts (object_id, layout_type, schema, is_default, created_at)
         SELECT $1, layout_type, schema, is_default, NOW()
         FROM metadata_layouts
         WHERE object_id = $2
         ON CONFLICT DO NOTHING`,
        [tenantObject.id, source.id],
    );

    const schemaVersionId = await snapshotMetadataSchema(client, {
        tenantId,
        objectId: tenantObject.id,
        userId,
        version: tenantObject.version,
        operation: 'CLONE_SYSTEM_OBJECT',
    });

    await client.query(
        `INSERT INTO metadata_migration_jobs (
            tenant_id, object_id, schema_version_id, operation, status, payload,
            requested_by, started_at, completed_at
         )
         VALUES ($1, $2, $3, 'CLONE_SYSTEM_OBJECT', 'COMPLETED', $4::jsonb, $5, NOW(), NOW())`,
        [
            tenantId,
            tenantObject.id,
            schemaVersionId,
            JSON.stringify({ sourceObjectId: source.id, apiName: source.api_name }),
            userId,
        ],
    );

    return tenantObject;
}

/**
 * Creates a new custom field for an object
 */
export async function createCustomField(
    objectId: string,
    fieldData: Record<string, unknown>,
    approvalOptions: { approvalRequestId?: string; reason?: string } = {},
) {
    const { tenantId, userId, session } = await requireAuth('metadata:publish');
    const normalizedField = normalizeMetadataFieldInput(fieldData);
    const approval = await requireApprovedWorkflowApprovalOrRequest({
        approvalRequestId: approvalOptions.approvalRequestId,
        policyId: 'metadata.publish',
        tenantId,
        title: `Approve metadata field ${normalizedField.apiName}`,
        description: 'Publishing metadata changes can alter runtime schema behavior.',
        resource: {
            type: 'metadata_object',
            id: objectId,
            tenantId,
            label: normalizedField.label,
        },
        payload: {
            operation: 'ADD_CUSTOM_FIELD',
            objectId,
            field: normalizedField,
            reason: approvalOptions.reason,
        },
        reason: approvalOptions.reason,
        requestedBy: {
            userId,
            role: session.role as AuthorizationRole,
            tenantId,
        },
    });

    if (!approval.approved) {
        return {
            approvalRequired: true,
            approval: toWorkflowApprovalSummary(approval.request),
        } satisfies MetadataApprovalRequiredResult;
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const targetObject = await ensureTenantOwnedMetadataObject(client, objectId, tenantId, userId);

        const { rows: versionRows } = await client.query(
            `UPDATE metadata_objects
             SET version = version + 1,
                 published_version = version + 1,
                 status = 'PUBLISHED',
                 published_at = NOW(),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING version`,
            [targetObject.id],
        );
        const nextVersion = Number(versionRows[0].version);

        const { rows } = await client.query(
            `INSERT INTO metadata_fields (
                object_id, label, api_name, data_type, is_custom, is_required,
                picklist_options, validation_rules, status, version, created_at, updated_at
             )
             VALUES ($1, $2, $3, $4, true, $5, $6::jsonb, $7::jsonb, 'ACTIVE', 1, NOW(), NOW())
             RETURNING *`,
            [
                targetObject.id,
                normalizedField.label,
                normalizedField.apiName,
                normalizedField.dataType,
                normalizedField.isRequired,
                JSON.stringify(normalizedField.picklistOptions),
                JSON.stringify(normalizedField.validationRules),
            ],
        );

        const schemaVersionId = await snapshotMetadataSchema(client, {
            tenantId,
            objectId: targetObject.id,
            userId,
            version: nextVersion,
            operation: 'ADD_CUSTOM_FIELD',
            migrationPlan: {
                operation: 'ADD_CUSTOM_FIELD',
                storage: 'jsonb_custom_data',
                fieldApiName: normalizedField.apiName,
                physicalDdlRequired: false,
            },
        });

        await client.query(
            `INSERT INTO metadata_migration_jobs (
                tenant_id, object_id, schema_version_id, operation, status, payload,
                requested_by, started_at, completed_at
             )
             VALUES ($1, $2, $3, 'ADD_CUSTOM_FIELD', 'COMPLETED', $4::jsonb, $5, NOW(), NOW())`,
            [
                tenantId,
                targetObject.id,
                schemaVersionId,
                JSON.stringify({
                    fieldId: rows[0].id,
                    fieldApiName: normalizedField.apiName,
                    storage: 'jsonb_custom_data',
                }),
                userId,
            ],
        );

        await client.query('COMMIT');

        // Invalidate the cache when a new field is added
        revalidateTag('metadata', 'max');

        return rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Fetches object and fields by its UUID
 */
export async function getObjectMetadataById(objectId: string) {
    const { tenantId } = await requireAuth();

    type RawObjectRow = {
        id: string;
        tenant_id: string | null;
        name: string;
        api_name: string;
        table_name: string;
        description: string | null;
        is_custom: boolean;
        status: string;
        version: number;
    };

    const objRows = await sql<RawObjectRow>`
        SELECT * FROM metadata_objects 
        WHERE id = ${objectId}
          AND status <> 'ARCHIVED'
          AND (
            tenant_id = ${tenantId}
            OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
          )
    `;

    if (objRows.length === 0) throw new Error("Object not found");

    let objectDef = objRows[0];
    if (objectDef.tenant_id === null) {
        const tenantObjectRows = await sql<RawObjectRow>`
            SELECT *
            FROM metadata_objects
            WHERE tenant_id = ${tenantId}
              AND api_name = ${objectDef.api_name}
              AND status <> 'ARCHIVED'
            ORDER BY created_at DESC
            LIMIT 1
        `;
        if (tenantObjectRows.length > 0) objectDef = tenantObjectRows[0];
    }

    const fieldRows = await sql<{
        id: string;
        object_id: string;
        label: string;
        api_name: string;
        data_type: MetadataDataType;
        is_custom: boolean;
        is_required: boolean;
        default_value: string | null;
        picklist_options: string[];
        validation_rules: MetadataValidationRules;
        status: string;
        version: number;
        permissions: MetadataFieldPermission[];
    }>`
        SELECT f.*,
               COALESCE(
                 jsonb_agg(
                   jsonb_build_object(
                     'role', fp.role,
                     'canRead', COALESCE(fp.can_read, true),
                     'canWrite', COALESCE(fp.can_write, false)
                   )
                 ) FILTER (WHERE fp.id IS NOT NULL),
                 '[]'::jsonb
               ) as permissions
        FROM metadata_fields f
        LEFT JOIN field_permissions fp ON fp.field_id = f.id
        WHERE f.object_id = ${objectDef.id}
          AND f.status <> 'ARCHIVED'
        GROUP BY f.id
        ORDER BY f.is_custom ASC, f.label ASC
    `;

    const layoutRows = await sql<MetadataLayout>`
        SELECT id, object_id as "objectId", layout_type as "layoutType", schema, is_default as "isDefault"
        FROM metadata_layouts
        WHERE object_id = ${objectDef.id} AND is_default = true
    `;

    return {
        objectDef,
        fields: fieldRows.map(row => ({
            id: row.id,
            objectId: row.object_id,
            label: row.label,
            apiName: row.api_name,
            dataType: row.data_type,
            isCustom: row.is_custom,
            isRequired: row.is_required,
            defaultValue: row.default_value,
            picklistOptions: row.picklist_options,
            validationRules: row.validation_rules || {},
            status: row.status,
            version: row.version || 1,
            permissions: Array.isArray(row.permissions) ? row.permissions : [],
        } as MetadataField)),
        layouts: layoutRows as MetadataLayout[],
    };
}

/** Flat result shape, per the server-action convention. */
export type CreateCustomObjectResult = {
    success: boolean;
    error?: string;
    objectId?: string;
    apiName?: string;
    approvalRequired?: boolean;
    approvalId?: string;
};

export interface CustomObjectDefinitionInput {
    name: string;
    apiName: string;
    description?: string;
    fields: Record<string, unknown>[];
}

/**
 * Defines a brand-new TENANT-OWNED object — the thing the low-code promise
 * actually rests on. No migration, no page route, no service: the object is
 * registered in `metadata_objects` with `table_name = 'metadata_records'`, its
 * rows land in the shared EAV tables, and `/app/<api_name>` starts serving a
 * list / detail / create / edit surface for it immediately.
 *
 * Governance matches `createCustomField`: publishing a model change goes
 * through the `metadata.publish` approval policy, and a schema version plus a
 * migration job are recorded so the change is replayable and auditable.
 */
export async function createCustomObject(
    input: CustomObjectDefinitionInput,
    approvalOptions: { approvalRequestId?: string; reason?: string } = {},
): Promise<CreateCustomObjectResult> {
    const { tenantId, userId, session } = await requireAuth('metadata:publish');

    let name: string;
    let apiName: string;
    let description: string | null;
    let normalizedFields: ReturnType<typeof normalizeMetadataFieldInput>[];

    try {
        name = String(input?.name || '').trim();
        apiName = String(input?.apiName || '').trim().toLowerCase();
        description = String(input?.description || '').trim() || null;

        if (!name || name.length > 100) {
            throw new Error('Object name is required and must be 100 characters or fewer.');
        }
        assertSafeMetadataIdentifier(apiName, 'object API name');

        const rawFields = Array.isArray(input?.fields) ? input.fields : [];
        if (rawFields.length === 0) throw new Error('Define at least one field.');
        if (rawFields.length > 50) throw new Error('A custom object supports at most 50 fields.');

        normalizedFields = rawFields.map(field => normalizeMetadataFieldInput(field));
        const seen = new Set<string>();
        for (const field of normalizedFields) {
            if (seen.has(field.apiName)) throw new Error(`Duplicate field API name: ${field.apiName}`);
            seen.add(field.apiName);
        }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Invalid object definition.' };
    }

    const approval = await requireApprovedWorkflowApprovalOrRequest({
        approvalRequestId: approvalOptions.approvalRequestId,
        policyId: 'metadata.publish',
        tenantId,
        title: `Approve custom object ${apiName}`,
        description: 'Publishing a new tenant object adds a runtime data model and UI surface.',
        resource: {
            type: 'metadata_object',
            id: apiName,
            tenantId,
            label: name,
        },
        payload: {
            operation: 'CREATE_CUSTOM_OBJECT',
            apiName,
            name,
            fields: normalizedFields,
            reason: approvalOptions.reason,
        },
        reason: approvalOptions.reason,
        requestedBy: {
            userId,
            role: session.role as AuthorizationRole,
            tenantId,
        },
    });

    if (!approval.approved) {
        return {
            success: false,
            approvalRequired: true,
            approvalId: approval.request.id,
            error: 'This change needs an approval before it can be published.',
        };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const { rows: objectRows } = await client.query(
            `INSERT INTO metadata_objects (
                tenant_id, name, api_name, table_name, description, is_custom,
                status, version, published_version, published_at, created_at, updated_at
             )
             VALUES ($1, $2, $3, $4, $5, true, 'PUBLISHED', 1, 1, NOW(), NOW(), NOW())
             ON CONFLICT (tenant_id, api_name) DO NOTHING
             RETURNING id, version`,
            [tenantId, name, apiName, metadataTableNameForNewObject(), description],
        );

        if (objectRows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: `An object with API name "${apiName}" already exists.` };
        }

        const objectId = objectRows[0].id as string;
        const objectVersion = Number(objectRows[0].version || 1);

        for (const field of normalizedFields) {
            await client.query(
                `INSERT INTO metadata_fields (
                    object_id, label, api_name, data_type, is_custom, is_required,
                    picklist_options, validation_rules, status, version, created_at, updated_at
                 )
                 VALUES ($1, $2, $3, $4, true, $5, $6::jsonb, $7::jsonb, 'ACTIVE', 1, NOW(), NOW())`,
                [
                    objectId,
                    field.label,
                    field.apiName,
                    field.dataType,
                    field.isRequired,
                    JSON.stringify(field.picklistOptions),
                    JSON.stringify(field.validationRules),
                ],
            );
        }

        // Default layouts so the generic list and form render something sensible
        // on the very first visit, with no further configuration.
        await client.query(
            `INSERT INTO metadata_layouts (object_id, layout_type, schema, is_default, created_at)
             VALUES ($1, 'LIST', $2::jsonb, true, NOW()),
                    ($1, 'FORM', $3::jsonb, true, NOW())`,
            [
                objectId,
                JSON.stringify({ columns: normalizedFields.slice(0, 5).map(field => field.apiName) }),
                JSON.stringify({
                    sections: [
                        { title: name, fields: normalizedFields.map(field => field.apiName) },
                    ],
                }),
            ],
        );

        const schemaVersionId = await snapshotMetadataSchema(client, {
            tenantId,
            objectId,
            userId,
            version: objectVersion,
            operation: 'CREATE_CUSTOM_OBJECT',
            migrationPlan: {
                operation: 'CREATE_CUSTOM_OBJECT',
                storage: 'metadata_records_eav',
                apiName,
                physicalDdlRequired: false,
            },
        });

        await client.query(
            `INSERT INTO metadata_migration_jobs (
                tenant_id, object_id, schema_version_id, operation, status, payload,
                requested_by, started_at, completed_at
             )
             VALUES ($1, $2, $3, 'CREATE_CUSTOM_OBJECT', 'COMPLETED', $4::jsonb, $5, NOW(), NOW())`,
            [
                tenantId,
                objectId,
                schemaVersionId,
                JSON.stringify({ apiName, fieldCount: normalizedFields.length, storage: 'metadata_records_eav' }),
                userId,
            ],
        );

        await client.query('COMMIT');
        revalidateTag('metadata', 'max');

        return { success: true, objectId, apiName };
    } catch (error) {
        await client.query('ROLLBACK');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create the object.',
        };
    } finally {
        client.release();
    }
}

/**
 * Persists a FORM or LIST layout schema for an object (created via the Drag-and-Drop Layout Builder).
 */
// ============================================================================
// 5. Visual Builders: Page/List Layouts, Field-Level Security (FLS) & Inline Updates
// ============================================================================

/**
 * Persists a tenant-scoped `FORM` or `LIST` layout definition (`sections`, `columns`,
 * `kanbanGroupByField`, `defaultViewMode`) in `metadata_layouts`.
 * Automatically forks global standard objects into a tenant-owned copy first.
 */
export async function saveObjectLayout(
    objectId: string,
    layoutType: 'FORM' | 'LIST',
    schema: Record<string, unknown>,
): Promise<{ success: boolean; objectId?: string; error?: string }> {
    try {
        const { tenantId, userId } = await requireAuth('metadata:publish');
        if (layoutType !== 'FORM' && layoutType !== 'LIST') {
            return { success: false, error: 'Invalid layout type.' };
        }

        const client = await pool.connect();
        const q = sqlFor(client);
        try {
            await q`BEGIN`.execute();
            const targetObject = await ensureTenantOwnedMetadataObject(client, objectId, tenantId, userId);

            const existingRows = await q<{ schema: Record<string, unknown> }>`
                SELECT schema
                FROM metadata_layouts
                WHERE object_id = ${targetObject.id}
                  AND layout_type = ${layoutType}
                LIMIT 1
            `;
            const mergedSchema =
                layoutType === 'FORM' &&
                existingRows[0]?.schema?.portalConfig &&
                !schema.portalConfig
                    ? { ...schema, portalConfig: existingRows[0].schema.portalConfig }
                    : schema;

            await q`
                DELETE FROM metadata_layouts WHERE object_id = ${targetObject.id} AND layout_type = ${layoutType}
            `.execute();

            await q`
                INSERT INTO metadata_layouts (object_id, layout_type, schema, is_default, created_at)
                VALUES (${targetObject.id}, ${layoutType}, ${JSON.stringify(mergedSchema)}::jsonb, true, NOW())
            `.execute();

            await q`COMMIT`.execute();
            revalidateTag('metadata', 'max');
            return { success: true, objectId: targetObject.id };
        } catch (err) {
            await q`ROLLBACK`.execute();
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save layout.',
        };
    }
}

/**
 * Updates role-based Field-Level Security (FLS) grants in `field_permissions`.
 */
export async function updateFieldPermissions(
    objectId: string,
    fieldApiName: string,
    grants: { role: string; canRead: boolean; canWrite: boolean }[],
): Promise<{ success: boolean; objectId?: string; error?: string }> {
    try {
        const { tenantId, userId } = await requireAuth('metadata:publish');
        assertSafeMetadataIdentifier(fieldApiName, 'field API name');

        const client = await pool.connect();
        const q = sqlFor(client);
        try {
            await q`BEGIN`.execute();
            const targetObject = await ensureTenantOwnedMetadataObject(client, objectId, tenantId, userId);

            const fieldRows = await q<{ id: string }>`
                SELECT id FROM metadata_fields
                WHERE object_id = ${targetObject.id}
                  AND api_name = ${fieldApiName}
                  AND status <> 'ARCHIVED'
                LIMIT 1
            `;
            if (fieldRows.length === 0) {
                await q`ROLLBACK`.execute();
                return { success: false, error: `Field "${fieldApiName}" not found on object.` };
            }
            const fieldId = fieldRows[0].id;

            for (const grant of grants) {
                const role = String(grant.role || '').trim().toUpperCase();
                if (!role) continue;
                const canWrite = Boolean(grant.canWrite);
                const canRead = canWrite ? true : Boolean(grant.canRead);

                await q`
                    INSERT INTO field_permissions (field_id, role, can_read, can_write)
                    VALUES (${fieldId}, ${role}, ${canRead}, ${canWrite})
                    ON CONFLICT (field_id, role)
                    DO UPDATE SET can_read = EXCLUDED.can_read, can_write = EXCLUDED.can_write
                `.execute();
            }

            await q`COMMIT`.execute();
            revalidateTag('metadata', 'max');
            return { success: true, objectId: targetObject.id };
        } catch (err) {
            await q`ROLLBACK`.execute();
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update field permissions.',
        };
    }
}

/**
 * Updates a single field on a record (used by Drag-and-Drop Kanban boards and inline grid editing)
 * without triggering a full-page redirect.
 */
export async function updateRecordFieldValue(
    apiName: string,
    recordId: string,
    fieldApiName: string,
    value: unknown,
): Promise<{ success: boolean; error?: string }> {
    try {
        const { tenantId, session } = await requireAuth();
        const { objectDef, fields } = await loadObjectMetadata(apiName, tenantId);

        const targetField = fields.find(f => f.apiName === fieldApiName);
        if (!targetField) {
            return { success: false, error: `Unknown field: ${fieldApiName}` };
        }

        const canWrite = canWriteMetadataField(
            session.role,
            targetField as unknown as RuntimeMetadataFieldWithPermissions,
        );
        if (!canWrite) {
            return { success: false, error: `You do not have permission to edit ${targetField.label}.` };
        }

        const validated = validateMetadataRecordPayload([targetField], { [fieldApiName]: value }, { requireAll: false });
        if (validated.ok === false) {
            return { success: false, error: validated.errors.join(' ') };
        }
        const normalizedVal = validated.data[fieldApiName];

        if (resolveMetadataStorageMode(objectDef) === 'EAV') {
            await upsertEavRecord(objectDef, [targetField], tenantId, { [fieldApiName]: normalizedVal }, recordId);
        } else {
            const tableIdent = identifier(objectDef.tableName);
            if (targetField.isCustom) {
                await sql`
                    UPDATE ${tableIdent}
                    SET custom_data = COALESCE(custom_data, '{}'::jsonb) || ${JSON.stringify({ [fieldApiName]: normalizedVal })}::jsonb,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ${recordId} AND tenant_id = ${tenantId}
                `.execute();
            } else {
                const colIdent = identifier(fieldApiName);
                await sql`
                    UPDATE ${tableIdent}
                    SET ${colIdent} = ${normalizedVal},
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ${recordId} AND tenant_id = ${tenantId}
                `.execute();
            }
        }

        await executeMatchingWorkflows(
            tenantId,
            apiName,
            'object.record.upserted',
            { [fieldApiName]: normalizedVal },
            recordId,
        );

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update record field.',
        };
    }
}

// ============================================================================
// 6. Record Lifecycle: Deletion & Bulk CSV Import
// ============================================================================

/**
 * Deletes a metadata record (EAV or TABLE), writes an audit log entry, and fires
 * active `object.record.deleted` workflows for the object.
 */
export async function deleteRecord(
    apiName: string,
    recordId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!UUID_RE.test(recordId)) {
            return { success: false, error: 'Invalid record ID.' };
        }
        const { tenantId, session } = await requireAuth();
        const { objectDef, fields } = await loadObjectMetadata(apiName, tenantId);

        const writableFields = fields.filter(f =>
            canWriteMetadataField(
                session.role,
                f as unknown as RuntimeMetadataFieldWithPermissions,
            ),
        );
        if (writableFields.length === 0) {
            return { success: false, error: 'You do not have permission to delete records on this object.' };
        }

        const matchedRows = await queryRecords(apiName, { id: recordId }, 1, 0);
        const priorRecord = matchedRows[0] || { id: recordId };

        if (resolveMetadataStorageMode(objectDef) === 'EAV') {
            await sql`
                DELETE FROM metadata_values
                WHERE record_id = ${recordId}
                  AND record_id IN (
                      SELECT id FROM metadata_records
                      WHERE id = ${recordId}
                        AND object_id = ${objectDef.id}
                        AND tenant_id = ${tenantId}
                  )
            `.execute();

            await sql`
                DELETE FROM metadata_records
                WHERE id = ${recordId}
                  AND object_id = ${objectDef.id}
                  AND tenant_id = ${tenantId}
            `.execute();
        } else {
            const tableIdent = identifier(objectDef.tableName);
            await sql`
                DELETE FROM ${tableIdent}
                WHERE id = ${recordId}
                  AND tenant_id = ${tenantId}
            `.execute();
        }

        await sql`
            INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, before_state)
            VALUES (
                ${tenantId},
                'METADATA_RECORD_DELETED',
                ${apiName},
                ${recordId},
                ${JSON.stringify(priorRecord)}::jsonb
            )
        `.execute();

        await executeMatchingWorkflows(
            tenantId,
            apiName,
            'object.record.deleted',
            priorRecord,
            recordId,
        );

        revalidateTag('metadata', 'max');
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete record.',
        };
    }
}

/**
 * Bulk-imports validated CSV rows into a metadata object (EAV or TABLE),
 * firing `object.record.upserted` workflows for each created record.
 */
export async function bulkImportRecords(
    apiName: string,
    rawRows: Record<string, unknown>[],
): Promise<{ success: boolean; importedCount: number; errors: string[] }> {
    try {
        if (!Array.isArray(rawRows) || rawRows.length === 0) {
            return { success: false, importedCount: 0, errors: ['No rows provided for import.'] };
        }
        if (rawRows.length > 500) {
            return { success: false, importedCount: 0, errors: ['Bulk import supports at most 500 rows per batch.'] };
        }

        const { tenantId, session } = await requireAuth();
        const { objectDef, fields } = await loadObjectMetadata(apiName, tenantId);
        const writableFields = fields.filter(
            f =>
                canWriteMetadataField(
                    session.role,
                    f as unknown as RuntimeMetadataFieldWithPermissions,
                ) && !isVirtualMetadataField(f),
        );

        if (writableFields.length === 0) {
            return {
                success: false,
                importedCount: 0,
                errors: ['You do not have write permission on any fields of this object.'],
            };
        }

        const fieldByNormalizedKey = new Map<string, MetadataField>();
        for (const field of writableFields) {
            fieldByNormalizedKey.set(field.apiName.toLowerCase(), field);
            fieldByNormalizedKey.set(field.label.trim().toLowerCase(), field);
        }

        let importedCount = 0;
        const errors: string[] = [];

        for (let idx = 0; idx < rawRows.length; idx++) {
            const rawRow = rawRows[idx];
            if (!rawRow || typeof rawRow !== 'object') continue;

            const mappedPayload: Record<string, unknown> = {};
            for (const [header, cellVal] of Object.entries(rawRow)) {
                const matched = fieldByNormalizedKey.get(header.trim().toLowerCase());
                if (!matched) continue;
                if (cellVal !== undefined && cellVal !== '') {
                    mappedPayload[matched.apiName] = cellVal;
                }
            }

            const validated = validateMetadataRecordPayload(writableFields, mappedPayload, {
                requireAll: true,
            });
            if (validated.ok === false) {
                errors.push(`Row ${idx + 1}: ${validated.errors.join('; ')}`);
                continue;
            }

            if (resolveMetadataStorageMode(objectDef) === 'EAV') {
                const createdId = await upsertEavRecord(
                    objectDef,
                    writableFields,
                    tenantId,
                    validated.data,
                );
                importedCount++;
                await executeMatchingWorkflows(
                    tenantId,
                    apiName,
                    'object.record.upserted',
                    validated.data,
                    createdId,
                );
            } else {
                const standardPayload: Record<string, unknown> = {};
                const customPayload: Record<string, unknown> = {};
                for (const field of writableFields) {
                    if (!Object.prototype.hasOwnProperty.call(validated.data, field.apiName)) continue;
                    if (field.isCustom) {
                        customPayload[field.apiName] = validated.data[field.apiName];
                    } else {
                        standardPayload[field.apiName] = validated.data[field.apiName];
                    }
                }
                const tableName = quoteIdentifier(objectDef.tableName);
                const keys = [quoteIdentifier('tenant_id')];
                const values: unknown[] = [tenantId];
                const placeholders = ['$1'];
                let argIndex = 2;

                for (const [key, value] of Object.entries(standardPayload)) {
                    keys.push(quoteIdentifier(key));
                    values.push(value);
                    placeholders.push(`$${argIndex++}`);
                }

                if (Object.keys(customPayload).length > 0) {
                    keys.push(quoteIdentifier('custom_data'));
                    values.push(JSON.stringify(customPayload));
                    placeholders.push(`$${argIndex++}`);
                }

                const { rows } = await pool.query<{ id: string }>(
                    `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
                    values,
                );
                const createdId = String(rows[0]?.id ?? '');
                importedCount++;
                await executeMatchingWorkflows(
                    tenantId,
                    apiName,
                    'object.record.upserted',
                    validated.data,
                    createdId,
                );
            }
        }

        if (importedCount > 0) {
            await sql`
                INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, after_state)
                VALUES (
                    ${tenantId},
                    'METADATA_BULK_IMPORT',
                    ${apiName},
                    ${objectDef.id},
                    ${JSON.stringify({
                        importedCount,
                        errorCount: errors.length,
                        importedAt: new Date().toISOString(),
                    })}::jsonb
                )
            `.execute();
            revalidateTag('metadata', 'max');
        }

        return {
            success: importedCount > 0 && errors.length === 0,
            importedCount,
            errors,
        };
    } catch (error) {
        return {
            success: false,
            importedCount: 0,
            errors: [error instanceof Error ? error.message : 'Bulk import failed.'],
        };
    }
}

// ============================================================================
// 7. Declarative Workflow Execution Engine
// ============================================================================

export interface WorkflowExecutionResult {
    workflowId: string;
    workflowName: string;
    actionType: string;
    status: 'EXECUTED' | 'SKIPPED';
    details: Record<string, unknown>;
}

/**
 * Executes a single workflow action (`UPDATE_FIELD`, `CREATE_TASK`, `SEND_EMAIL`, `WEBHOOK`)
 * and logs the execution result to `audit_logs`.
 */
export async function runSingleWorkflowAction(params: {
    tenantId: string;
    workflowId: string;
    workflowName: string;
    objectName: string;
    triggerEvent: string;
    actionType: string;
    actionPayload: Record<string, unknown>;
    recordId: string;
    recordData: Record<string, unknown>;
}): Promise<WorkflowExecutionResult> {
    const {
        tenantId,
        workflowId,
        workflowName,
        objectName,
        triggerEvent,
        actionType,
        actionPayload,
        recordId,
        recordData,
    } = params;

    const normalizedAction = String(actionType || '').trim().toUpperCase();
    let actionDetails: Record<string, unknown> = {};

    if (normalizedAction === 'UPDATE_FIELD' || normalizedAction === 'FIELD_UPDATE') {
        const targetFieldApi = String(actionPayload.field || '').trim();
        const rawTargetValue = actionPayload.value;

        if (targetFieldApi && UUID_RE.test(recordId)) {
            const { objectDef, fields } = await loadObjectMetadata(objectName, tenantId);
            const targetField = fields.find(f => f.apiName === targetFieldApi);
            if (targetField) {
                const validated = validateMetadataRecordPayload(
                    [targetField],
                    { [targetFieldApi]: rawTargetValue },
                    { requireAll: false },
                );
                if (validated.ok) {
                    const normalizedVal = validated.data[targetFieldApi];
                    // Guard against redundant self-updates
                    if (String(recordData[targetFieldApi] ?? '') !== String(normalizedVal ?? '')) {
                        if (resolveMetadataStorageMode(objectDef) === 'EAV') {
                            await upsertEavRecord(
                                objectDef,
                                [targetField],
                                tenantId,
                                { [targetFieldApi]: normalizedVal },
                                recordId,
                            );
                        } else {
                            const tableIdent = identifier(objectDef.tableName);
                            if (targetField.isCustom) {
                                await sql`
                                    UPDATE ${tableIdent}
                                    SET custom_data = COALESCE(custom_data, '{}'::jsonb) || ${JSON.stringify({
                                        [targetFieldApi]: normalizedVal,
                                    })}::jsonb,
                                        updated_at = CURRENT_TIMESTAMP
                                    WHERE id = ${recordId} AND tenant_id = ${tenantId}
                                `.execute();
                            } else {
                                const colIdent = identifier(targetFieldApi);
                                await sql`
                                    UPDATE ${tableIdent}
                                    SET ${colIdent} = ${normalizedVal},
                                        updated_at = CURRENT_TIMESTAMP
                                    WHERE id = ${recordId} AND tenant_id = ${tenantId}
                                `.execute();
                            }
                        }
                    }
                    actionDetails = {
                        runner: 'FIELD_UPDATE',
                        field: targetFieldApi,
                        newValue: normalizedVal,
                    };
                }
            }
        }
        if (!actionDetails.runner) {
            actionDetails = {
                runner: 'FIELD_UPDATE',
                field: targetFieldApi || 'status',
                newValue: rawTargetValue ?? null,
            };
        }
    } else if (normalizedAction === 'CREATE_TASK' || normalizedAction === 'TASK') {
        const title =
            String(actionPayload.title || '').trim() ||
            `Follow up: ${workflowName} (${objectName})`;
        const description =
            String(actionPayload.description || '').trim() ||
            `Automated task triggered by workflow "${workflowName}" on ${objectName} record ${recordId}.`;
        const dueDays = Math.max(0, Number(actionPayload.due_days ?? 1) || 1);
        const dueDate = new Date(Date.now() + dueDays * 86_400_000).toISOString().split('T')[0];
        const taskType = String(actionPayload.type || 'FOLLOW_UP').trim();

        const appointmentRows = await sql<{ id: string }>`
            INSERT INTO appointments (
                tenant_id, title, description, date, time, duration, status, type
            )
            VALUES (
                ${tenantId},
                ${title},
                ${description},
                ${dueDate},
                '09:00',
                30,
                'SCHEDULED',
                ${taskType}
            )
            RETURNING id
        `;

        const jobRows = await sql<{ id: string }>`
            INSERT INTO background_jobs (
                tenant_id, scope, queue, task_name, status, priority, payload,
                scheduled_for, available_at, max_attempts
            )
            VALUES (
                ${tenantId},
                'TENANT',
                'default',
                'workflow.follow_up_task',
                'QUEUED',
                0,
                ${JSON.stringify({
                    tenantId,
                    workflowId,
                    appointmentId: appointmentRows[0]?.id ?? null,
                    objectName,
                    recordId,
                    title,
                    dueDate,
                })}::jsonb,
                NOW(),
                NOW(),
                3
            )
            RETURNING id
        `;

        actionDetails = {
            runner: 'CREATE_TASK',
            appointmentId: appointmentRows[0]?.id ?? null,
            jobId: jobRows[0]?.id ?? null,
            title,
            dueDate,
        };
    } else if (normalizedAction === 'SEND_EMAIL' || normalizedAction === 'EMAIL') {
        const toField = String(actionPayload.to_field || 'email').trim();
        const explicitTo = String(actionPayload.to || '').trim();
        const resolvedRecipient =
            explicitTo ||
            (typeof recordData[toField] === 'string' && String(recordData[toField]).includes('@')
                ? String(recordData[toField]).trim()
                : 'notifications@scholarmind.local');

        const templateId = String(actionPayload.template || 'workflow_notification').trim();
        const subject =
            String(actionPayload.subject || '').trim() ||
            `[ScholarMind] ${workflowName} (${objectName})`;
        const body =
            String(actionPayload.body || '').trim() ||
            `Workflow "${workflowName}" triggered on ${objectName} (${recordId}) via ${triggerEvent}.`;

        const outboxRows = await sql<{ id: string }>`
            INSERT INTO notification_outbox (
                tenant_id, channel, status, provider, recipient, subject, body,
                template_id, payload, scheduled_for, next_attempt_at, max_attempts
            )
            VALUES (
                ${tenantId},
                'EMAIL',
                'PENDING',
                'resend',
                ${resolvedRecipient},
                ${subject},
                ${body},
                ${templateId},
                ${JSON.stringify({
                    workflowId,
                    workflowName,
                    objectName,
                    recordId,
                    triggerEvent,
                })}::jsonb,
                NOW(),
                NOW(),
                3
            )
            RETURNING id
        `;

        const jobRows = await sql<{ id: string }>`
            INSERT INTO background_jobs (
                tenant_id, scope, queue, task_name, status, priority, payload,
                scheduled_for, available_at, max_attempts
            )
            VALUES (
                ${tenantId},
                'TENANT',
                'notifications',
                'send-notification',
                'QUEUED',
                0,
                ${JSON.stringify({
                    tenantId,
                    notificationId: outboxRows[0]?.id ?? null,
                    channel: 'EMAIL',
                    recipient: resolvedRecipient,
                })}::jsonb,
                NOW(),
                NOW(),
                3
            )
            RETURNING id
        `;

        actionDetails = {
            runner: 'SEND_EMAIL',
            outboxId: outboxRows[0]?.id ?? null,
            jobId: jobRows[0]?.id ?? null,
            recipient: resolvedRecipient,
            template: templateId,
        };
    } else if (normalizedAction === 'WEBHOOK') {
        const targetUrl = String(actionPayload.url || 'https://example.org/webhook').trim();
        const rawMethod = String(actionPayload.method || 'POST').trim().toUpperCase();
        const method = rawMethod === 'PUT' ? 'PUT' : 'POST';
        const isSafeUrl = isSafeWebhookDestinationUrl(targetUrl);
        const signingSecret =
            String(actionPayload.secret || '').trim() ||
            process.env.WEBHOOK_SIGNING_SECRET ||
            'scholarmind-workflow-hmac';

        const eventBody = {
            event: triggerEvent,
            workflowId,
            workflowName,
            tenantId,
            objectName,
            recordId,
            data: recordData,
            timestamp: new Date().toISOString(),
        };
        const serializedBody = JSON.stringify(eventBody);
        const signature = `sha256=${crypto
            .createHmac('sha256', signingSecret)
            .update(serializedBody)
            .digest('hex')}`;

        const jobRows = isSafeUrl
            ? await sql<{ id: string }>`
                  INSERT INTO background_jobs (
                      tenant_id, scope, queue, task_name, status, priority, payload,
                      scheduled_for, available_at, max_attempts
                  )
                  VALUES (
                      ${tenantId},
                      'TENANT',
                      'webhooks',
                      'webhook.dispatch',
                      'QUEUED',
                      0,
                      ${JSON.stringify({
                          tenantId,
                          workflowId,
                          url: targetUrl,
                          method,
                          signature,
                          body: eventBody,
                      })}::jsonb,
                      NOW(),
                      NOW(),
                      3
                  )
                  RETURNING id
              `
            : [];

        let httpStatus: number | null = null;
        if (
            isSafeUrl &&
            !targetUrl.includes('example.org') &&
            process.env.NODE_ENV !== 'test'
        ) {
            try {
                const res = await fetch(targetUrl, {
                    method,
                    redirect: 'error',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-ScholarMind-Signature': signature,
                        'X-ScholarMind-Event': triggerEvent,
                    },
                    body: serializedBody,
                    signal: AbortSignal.timeout(3000),
                });
                httpStatus = res.status;
            } catch {
                // Background worker job handles retries if immediate delivery fails
            }
        }

        actionDetails = {
            runner: 'WEBHOOK',
            jobId: jobRows[0]?.id ?? null,
            url: targetUrl,
            method,
            ssrfBlocked: !isSafeUrl,
            signature,
            httpStatus,
        };
    } else if (normalizedAction === 'CREATE_RECORD') {
        const targetObjectApi = String(actionPayload.target_object || objectName).trim().toLowerCase();
        const rawFieldMap =
            actionPayload.field_values && typeof actionPayload.field_values === 'object'
                ? (actionPayload.field_values as Record<string, unknown>)
                : {};
        let createdChildId: string | null = null;
        if (targetObjectApi) {
            try {
                const { objectDef: targetObj, fields: targetFields } = await loadObjectMetadata(
                    targetObjectApi,
                    tenantId,
                );
                const writableTargetFields = targetFields.filter(f => !isVirtualMetadataField(f));
                const resolvedPayload: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(rawFieldMap)) {
                    if (typeof v === 'string' && v.startsWith('{') && v.endsWith('}')) {
                        const refKey = v.slice(1, -1).trim();
                        resolvedPayload[k] = refKey === 'id' ? recordId : recordData[refKey];
                    } else {
                        resolvedPayload[k] = v;
                    }
                }
                const validated = validateMetadataRecordPayload(
                    writableTargetFields,
                    resolvedPayload,
                    { requireAll: false },
                );
                if (validated.ok && resolveMetadataStorageMode(targetObj) === 'EAV') {
                    createdChildId = await upsertEavRecord(
                        targetObj,
                        writableTargetFields,
                        tenantId,
                        validated.data,
                    );
                }
            } catch {
                // Non-fatal child record creation fallback
            }
        }
        actionDetails = {
            runner: 'CREATE_RECORD',
            targetObject: targetObjectApi,
            createdRecordId: createdChildId,
        };
    } else if (normalizedAction === 'SUBMIT_FOR_APPROVAL' || normalizedAction === 'APPROVAL') {
        actionDetails = {
            runner: 'SUBMIT_FOR_APPROVAL',
            objectName,
            recordId,
            approvalState: 'SUBMITTED',
        };
    } else {
        actionDetails = {
            runner: normalizedAction || 'CUSTOM',
        };
    }

    const entityUuid = UUID_RE.test(recordId) ? recordId : workflowId;

    await sql`
        INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, after_state)
        VALUES (
            ${tenantId},
            'WORKFLOW_EXECUTED',
            ${objectName},
            ${entityUuid},
            ${JSON.stringify({
                workflowId,
                workflowName,
                triggerEvent,
                actionType: normalizedAction,
                actionPayload: redactSensitiveWorkflowPayload(actionPayload),
                actionResult: actionDetails,
                executedAt: new Date().toISOString(),
            })}::jsonb
        )
    `.execute();

    return {
        workflowId,
        workflowName,
        actionType: normalizedAction,
        status: 'EXECUTED',
        details: actionDetails,
    };
}

/**
 * Evaluates and executes active `metadata_workflows` matching a record mutation.
 */
async function executeMatchingWorkflows(
    tenantId: string,
    objectName: string,
    triggerEvent: string,
    recordData: Record<string, unknown>,
    recordId: string,
): Promise<void> {
    try {
        const workflows = await sql<{
            id: string;
            name: string;
            conditions: { field?: string; operator?: string; value?: string }[];
            action_type: string;
            action_payload: Record<string, unknown>;
        }>`
            SELECT id, name, conditions, action_type, action_payload
            FROM metadata_workflows
            WHERE tenant_id = ${tenantId}
              AND LOWER(object_name) = LOWER(${objectName})
              AND trigger_event = ${triggerEvent}
              AND is_active = true
        `;

        for (const wf of workflows) {
            const conditions = Array.isArray(wf.conditions) ? wf.conditions : [];

            const allMatched = conditions.every(cond => {
                if (!cond.field) return true;
                const actualRaw = recordData[cond.field];
                const actualStr = actualRaw === null || actualRaw === undefined ? '' : String(actualRaw);
                const expectedStr = String(cond.value ?? '');

                switch (cond.operator) {
                    case 'equals':
                        return actualStr.toLowerCase() === expectedStr.toLowerCase();
                    case 'not_equals':
                        return actualStr.toLowerCase() !== expectedStr.toLowerCase();
                    case 'contains':
                        return actualStr.toLowerCase().includes(expectedStr.toLowerCase());
                    case 'greater_than':
                        return Number(actualRaw) > Number(expectedStr);
                    case 'less_than':
                        return Number(actualRaw) < Number(expectedStr);
                    case 'not_empty':
                    case 'is_changed':
                        return actualStr.trim().length > 0;
                    default:
                        return actualStr === expectedStr;
                }
            });

            if (!allMatched) continue;

            const payload = (wf.action_payload && typeof wf.action_payload === 'object'
                ? wf.action_payload
                : {}) as Record<string, unknown>;

            await runSingleWorkflowAction({
                tenantId,
                workflowId: wf.id,
                workflowName: wf.name,
                objectName,
                triggerEvent,
                actionType: wf.action_type,
                actionPayload: payload,
                recordId,
                recordData,
            });
        }
    } catch {
        // Non-blocking: workflow evaluation must not abort the primary record save
    }
}

// ============================================================================
// 8. Education Cloud Blueprints, Record Approvals & Audit History Timeline
// ============================================================================

export interface RecordAuditTimelineEntry {
    id: string;
    action: string;
    createdAt: string;
    summary: string;
    details: Record<string, unknown>;
}

/**
 * Returns chronological audit history and workflow/approval events for a single record
 * on `/app/[object]/[id]` (Salesforce Lightning Activity & Field History Timeline).
 */
export async function getRecordAuditTimeline(
    apiName: string,
    recordId: string,
): Promise<RecordAuditTimelineEntry[]> {
    try {
        if (!UUID_RE.test(recordId)) return [];
        const { tenantId } = await requireAuth();

        const rows = await sql<{
            id: string;
            action: string;
            before_state: Record<string, unknown> | null;
            after_state: Record<string, unknown> | null;
            created_at: Date | string;
        }>`
            SELECT id, action, before_state, after_state, created_at
            FROM audit_logs
            WHERE tenant_id = ${tenantId}
              AND LOWER(entity_type) = LOWER(${apiName})
              AND entity_id = ${recordId}
            ORDER BY created_at DESC
            LIMIT 25
        `;

        return rows.map(row => {
            const after = (row.after_state && typeof row.after_state === 'object'
                ? row.after_state
                : {}) as Record<string, unknown>;
            let summary = row.action.replace(/_/g, ' ');
            if (row.action === 'WORKFLOW_EXECUTED') {
                summary = `Workflow "${String(after.workflowName || 'Automation')}" executed (${String(after.actionType || '')})`;
            } else if (row.action === 'RECORD_APPROVAL_REQUESTED') {
                summary = `Submitted for approval${after.comment ? `: "${String(after.comment)}"` : ''}`;
            } else if (row.action === 'RECORD_APPROVAL_DECIDED') {
                summary = `Approval ${String(after.decision || 'DECIDED')}${after.comment ? `: "${String(after.comment)}"` : ''}`;
            } else if (row.action === 'METADATA_RECORD_ACTIVITY') {
                summary = `[${String(after.activityType || 'ACTIVITY')}] ${String(after.subject || 'Activity logged')}${after.notes ? ` — ${String(after.notes)}` : ''}`;
            } else if (row.action === 'METADATA_RECORD_CLONED') {
                summary = `Cloned from record ${String(after.sourceRecordId || '').slice(0, 8)}`;
            } else if (row.action === 'METADATA_RECORD_MERGED') {
                summary = `Merged duplicate record ${String(after.duplicateRecordId || '').slice(0, 8)} into this record`;
            } else if (row.action === 'CREATE') {
                summary = `Record created via API / Form`;
            }
            return {
                id: row.id,
                action: row.action,
                createdAt:
                    row.created_at instanceof Date
                        ? row.created_at.toISOString()
                        : String(row.created_at),
                summary,
                details: after,
            };
        });
    } catch {
        return [];
    }
}

/**
 * Submits a metadata record into a declarative Approval Process, updating any stage/approval
 * field (`approval_status` or `status`) to `SUBMITTED` and writing `RECORD_APPROVAL_REQUESTED`
 * to `audit_logs`.
 */
export async function submitRecordForApproval(
    apiName: string,
    recordId: string,
    comment?: string,
): Promise<{ success: boolean; status?: string; error?: string }> {
    try {
        if (!UUID_RE.test(recordId)) {
            return { success: false, error: 'Invalid record ID.' };
        }
        const { tenantId, userId } = await requireAuth();
        const { fields } = await loadObjectMetadata(apiName, tenantId);
        const approvalField = fields.find(
            f =>
                f.apiName === 'approval_status' ||
                (f.dataType === 'PICKLIST' && (f.picklistOptions || []).includes('SUBMITTED')),
        );
        if (approvalField) {
            await updateRecordFieldValue(apiName, recordId, approvalField.apiName, 'SUBMITTED');
        }

        await sql`
            INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_state)
            VALUES (
                ${tenantId},
                ${userId},
                'RECORD_APPROVAL_REQUESTED',
                ${apiName},
                ${recordId},
                ${JSON.stringify({
                    status: 'SUBMITTED',
                    comment: comment?.trim() || null,
                    submittedAt: new Date().toISOString(),
                })}::jsonb
            )
        `.execute();
        revalidateTag('metadata', 'max');
        return { success: true, status: 'SUBMITTED' };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to submit record for approval.',
        };
    }
}

/**
 * Approves or rejects a record in a declarative Approval Process (`APPROVED` / `REJECTED`),
 * updates the record's approval picklist field if present, and logs `RECORD_APPROVAL_DECIDED`.
 */
export async function decideRecordApproval(
    apiName: string,
    recordId: string,
    decision: 'APPROVED' | 'REJECTED',
    comment?: string,
): Promise<{ success: boolean; status?: string; error?: string }> {
    try {
        if (!UUID_RE.test(recordId)) {
            return { success: false, error: 'Invalid record ID.' };
        }
        if (decision !== 'APPROVED' && decision !== 'REJECTED') {
            return { success: false, error: 'Invalid approval decision.' };
        }
        const { tenantId, userId, session } = await requireAuth();
        const allowedApproverRoles = new Set([
            'SUPER_ADMIN',
            'PLATFORM_ADMIN',
            'SCHOOL_ADMIN',
            'PRINCIPAL',
            'VICE_PRINCIPAL',
            'HOD',
            'ACCOUNTANT',
        ]);
        if (!allowedApproverRoles.has(String(session.role || '').toUpperCase())) {
            return {
                success: false,
                error: 'Your role does not have permission to approve or reject records.',
            };
        }
        const { fields } = await loadObjectMetadata(apiName, tenantId);
        const approvalField = fields.find(
            f =>
                f.apiName === 'approval_status' ||
                (f.dataType === 'PICKLIST' && (f.picklistOptions || []).includes(decision)),
        );
        if (approvalField) {
            await updateRecordFieldValue(apiName, recordId, approvalField.apiName, decision);
        }

        await sql`
            INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_state)
            VALUES (
                ${tenantId},
                ${userId},
                'RECORD_APPROVAL_DECIDED',
                ${apiName},
                ${recordId},
                ${JSON.stringify({
                    decision,
                    comment: comment?.trim() || null,
                    decidedAt: new Date().toISOString(),
                })}::jsonb
            )
        `.execute();
        revalidateTag('metadata', 'max');
        return { success: true, status: decision };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to record approval decision.',
        };
    }
}

/**
 * Installs a 1-click Salesforce Education Cloud Institution Blueprint
 * (`K12_SCHOOL_CLOUD`, `COLLEGE_HIGHER_ED_CLOUD`, or `COACHING_INSTITUTE_CLOUD`)
 * idempotently for the current tenant, provisioning objects, fields, FORM/LIST/KANBAN
 * layouts, schema snapshots, and starter automation workflows.
 */
export async function installEducationBlueprint(
    packId: EducationBlueprintId,
): Promise<{
    success: boolean;
    installedObjects: string[];
    installedWorkflows: number;
    error?: string;
}> {
    try {
        const { tenantId, userId } = await requireAuth('metadata:publish');
        const pack = getEducationBlueprintById(packId);
        if (!pack) {
            return {
                success: false,
                installedObjects: [],
                installedWorkflows: 0,
                error: `Unknown Education Cloud blueprint: ${packId}`,
            };
        }

        const client = await pool.connect();
        const q = sqlFor(client);
        const installedObjects: string[] = [];
        let installedWorkflows = 0;

        try {
            await q`BEGIN`.execute();

            for (const objSpec of pack.objects) {
                const existingObj = await q<{ id: string }>`
                    SELECT id
                    FROM metadata_objects
                    WHERE tenant_id = ${tenantId}
                      AND api_name = ${objSpec.apiName}
                    LIMIT 1
                `;

                let objectId: string;
                if (existingObj.length > 0) {
                    objectId = existingObj[0].id;
                    await q`
                        UPDATE metadata_objects
                        SET name = ${objSpec.name},
                            description = ${objSpec.description},
                            status = 'PUBLISHED'
                        WHERE id = ${objectId}
                    `.execute();
                } else {
                    const insertedObj = await q<{ id: string }>`
                        INSERT INTO metadata_objects (
                            tenant_id, name, api_name, table_name, description, is_custom,
                            status, version, published_version, published_at
                        )
                        VALUES (
                            ${tenantId},
                            ${objSpec.name},
                            ${objSpec.apiName},
                            ${metadataTableNameForNewObject()},
                            ${objSpec.description},
                            true,
                            'PUBLISHED',
                            1,
                            1,
                            NOW()
                        )
                        RETURNING id
                    `;
                    objectId = insertedObj[0].id;
                }

                for (const fieldSpec of objSpec.fields) {
                    const normalized = normalizeMetadataFieldInput({
                        label: fieldSpec.label,
                        apiName: fieldSpec.apiName,
                        dataType: fieldSpec.dataType,
                        isRequired: fieldSpec.isRequired,
                        picklistOptions: fieldSpec.picklistOptions,
                        validationRules: fieldSpec.validationRules,
                    });

                    const existingField = await q<{ id: string }>`
                        SELECT id
                        FROM metadata_fields
                        WHERE object_id = ${objectId}
                          AND api_name = ${normalized.apiName}
                        LIMIT 1
                    `;

                    if (existingField.length === 0) {
                        await q`
                            INSERT INTO metadata_fields (
                                object_id, label, api_name, data_type, is_custom, is_required,
                                picklist_options, validation_rules, status, version
                            )
                            VALUES (
                                ${objectId},
                                ${normalized.label},
                                ${normalized.apiName},
                                ${normalized.dataType},
                                true,
                                ${normalized.isRequired},
                                ${JSON.stringify(normalized.picklistOptions)}::jsonb,
                                ${JSON.stringify(normalized.validationRules)}::jsonb,
                                'ACTIVE',
                                1
                            )
                        `.execute();
                    }
                }

                // Provision FORM and LIST/KANBAN layouts
                await q`
                    DELETE FROM metadata_layouts
                    WHERE object_id = ${objectId}
                      AND layout_type IN ('FORM', 'LIST')
                `.execute();

                await q`
                    INSERT INTO metadata_layouts (object_id, layout_type, schema, is_default, created_at)
                    VALUES (
                        ${objectId},
                        'FORM',
                        ${JSON.stringify({ sections: objSpec.formSections })}::jsonb,
                        true,
                        NOW()
                    )
                `.execute();

                await q`
                    INSERT INTO metadata_layouts (object_id, layout_type, schema, is_default, created_at)
                    VALUES (
                        ${objectId},
                        'LIST',
                        ${JSON.stringify({
                            columns: objSpec.fields.map(f => f.apiName),
                            kanbanGroupByField: objSpec.kanbanGroupByField ?? null,
                            defaultViewMode: objSpec.defaultViewMode ?? 'TABLE',
                        })}::jsonb,
                        true,
                        NOW()
                    )
                `.execute();

                installedObjects.push(objSpec.apiName);
            }

            for (const wfSpec of pack.workflows) {
                const existingWf = await q<{ id: string }>`
                    SELECT id
                    FROM metadata_workflows
                    WHERE tenant_id = ${tenantId}
                      AND name = ${wfSpec.name}
                      AND object_name = ${wfSpec.objectName}
                    LIMIT 1
                `;
                if (existingWf.length === 0) {
                    await q`
                        INSERT INTO metadata_workflows (
                            tenant_id, name, object_name, trigger_event, conditions,
                            action_type, action_payload, is_active
                        )
                        VALUES (
                            ${tenantId},
                            ${wfSpec.name},
                            ${wfSpec.objectName},
                            ${wfSpec.triggerEvent},
                            ${JSON.stringify(wfSpec.conditions)}::jsonb,
                            ${wfSpec.actionType},
                            ${JSON.stringify(wfSpec.actionPayload)}::jsonb,
                            true
                        )
                    `.execute();
                    installedWorkflows++;
                }
            }

            await q`
                INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, after_state)
                VALUES (
                    ${tenantId},
                    ${userId},
                    'EDUCATION_BLUEPRINT_INSTALLED',
                    'metadata_blueprint',
                    ${JSON.stringify({
                        packId: pack.id,
                        title: pack.title,
                        installedObjects,
                        installedWorkflows,
                        installedAt: new Date().toISOString(),
                    })}::jsonb
                )
            `.execute();

            await q`COMMIT`.execute();
            revalidateTag('metadata', 'max');
            return {
                success: true,
                installedObjects,
                installedWorkflows,
            };
        } catch (err) {
            await q`ROLLBACK`.execute();
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        return {
            success: false,
            installedObjects: [],
            installedWorkflows: 0,
            error: error instanceof Error ? error.message : 'Failed to install Education Cloud blueprint.',
        };
    }
}

// ============================================================================
// 9. Track B: 360° Record Console (Duplicate Detection, Clone, Merge & Quick Activities)
// ============================================================================

/**
 * Scans existing records of `apiName` to detect potential duplicate records for a given `recordId`
 * using both explicit `duplicateRuleBehavior` fields and contact/name heuristics (`EMAIL`, `PHONE`, `student_name`, `candidate_name`).
 */
export async function findPotentialDuplicateRecords(
    apiName: string,
    recordId: string,
): Promise<DuplicateMatchEntry[]> {
    try {
        if (!UUID_RE.test(recordId)) return [];
        const { tenantId } = await requireAuth();
        const { fields } = await loadObjectMetadata(apiName, tenantId);
        const allRecords = await queryRecords(apiName, {}, 200, 0);
        const currentRecord = allRecords.find(r => String(r.id) === recordId);
        if (!currentRecord) return [];

        const result = detectMetadataDuplicates(fields, currentRecord, allRecords, {
            excludeRecordId: recordId,
            includeContactHeuristics: true,
        });
        return result.matches;
    } catch {
        return [];
    }
}

/**
 * Clones an existing EAV custom object record into a brand-new record, automatically generating
 * a fresh `AUTO_NUMBER` sequence if the object has an auto-number field and logging `METADATA_RECORD_CLONED`.
 */
export async function cloneMetadataRecord(
    apiName: string,
    sourceRecordId: string,
): Promise<{ success: boolean; clonedRecordId?: string; error?: string }> {
    try {
        if (!UUID_RE.test(sourceRecordId)) {
            return { success: false, error: 'Invalid source record ID.' };
        }
        const { tenantId, userId, session } = await requireAuth();
        const { objectDef, fields } = await loadObjectMetadata(apiName, tenantId);
        if (resolveMetadataStorageMode(objectDef) !== 'EAV') {
            return { success: false, error: 'Cloning is supported on custom EAV objects.' };
        }

        const existing = await queryRecords(apiName, { id: sourceRecordId }, 1, 0);
        if (existing.length === 0) {
            return { success: false, error: 'Source record not found.' };
        }
        const sourceRow = existing[0] as Record<string, unknown>;
        const writableFields = fields.filter(
            f =>
                !isVirtualMetadataField(f) &&
                canWriteMetadataField(
                    session.role,
                    f as unknown as RuntimeMetadataFieldWithPermissions,
                ),
        );
        if (writableFields.length === 0) {
            return {
                success: false,
                error: 'You do not have write permission to clone records on this object.',
            };
        }

        const clonePayload: Record<string, unknown> = {};
        for (const field of writableFields) {
            if (field.validationRules?.fieldSubType === 'AUTO_NUMBER') {
                // Leave blank so validateMetadataRecordPayload generates a fresh sequence
                continue;
            }
            if (sourceRow[field.apiName] !== undefined && sourceRow[field.apiName] !== null) {
                clonePayload[field.apiName] = sourceRow[field.apiName];
            }
        }

        const validated = validateMetadataRecordPayload(writableFields, clonePayload, {
            requireAll: false,
        });
        if (validated.ok === false) {
            return { success: false, error: validated.errors.join(' ') };
        }

        const clonedRecordId = await upsertEavRecord(
            objectDef,
            writableFields,
            tenantId,
            validated.data,
        );

        await sql`
            INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_state)
            VALUES (
                ${tenantId},
                ${userId},
                'METADATA_RECORD_CLONED',
                ${apiName},
                ${clonedRecordId},
                ${JSON.stringify({
                    sourceRecordId,
                    clonedRecordId,
                    clonedAt: new Date().toISOString(),
                })}::jsonb
            )
        `.execute();

        revalidateTag('metadata', 'max');
        return { success: true, clonedRecordId };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to clone record.',
        };
    }
}

/**
 * Merges a duplicate record (`duplicateRecordId`) into the primary record (`primaryRecordId`):
 *   1. Copies any non-empty field values from `duplicateRecordId` into blank fields on `primaryRecordId`.
 *   2. Re-links child `LOOKUP` EAV values referencing `duplicateRecordId` to `primaryRecordId`.
 *   3. Deletes `duplicateRecordId` and logs `METADATA_RECORD_MERGED` on `primaryRecordId`.
 */
export async function mergeMetadataRecords(
    apiName: string,
    primaryRecordId: string,
    duplicateRecordId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!UUID_RE.test(primaryRecordId) || !UUID_RE.test(duplicateRecordId)) {
            return { success: false, error: 'Invalid record ID.' };
        }
        if (primaryRecordId === duplicateRecordId) {
            return { success: false, error: 'Cannot merge a record with itself.' };
        }
        const { tenantId, userId, session } = await requireAuth();
        const { objectDef, fields } = await loadObjectMetadata(apiName, tenantId);
        if (resolveMetadataStorageMode(objectDef) !== 'EAV') {
            return { success: false, error: 'Record merging is supported on custom EAV objects.' };
        }

        const [primaryRows, duplicateRows] = await Promise.all([
            queryRecords(apiName, { id: primaryRecordId }, 1, 0),
            queryRecords(apiName, { id: duplicateRecordId }, 1, 0),
        ]);
        if (primaryRows.length === 0 || duplicateRows.length === 0) {
            return { success: false, error: 'Primary or duplicate record not found.' };
        }

        const primaryData = primaryRows[0] as Record<string, unknown>;
        const duplicateData = duplicateRows[0] as Record<string, unknown>;
        const writableFields = fields.filter(
            f =>
                !isVirtualMetadataField(f) &&
                canWriteMetadataField(
                    session.role,
                    f as unknown as RuntimeMetadataFieldWithPermissions,
                ),
        );
        if (writableFields.length === 0) {
            return {
                success: false,
                error: 'You do not have write permission to merge records on this object.',
            };
        }

        const mergedPatch: Record<string, unknown> = {};
        for (const field of writableFields) {
            const pVal = primaryData[field.apiName];
            const dVal = duplicateData[field.apiName];
            const primaryBlank = pVal === null || pVal === undefined || String(pVal).trim() === '';
            const duplicateHasVal = dVal !== null && dVal !== undefined && String(dVal).trim() !== '';
            if (primaryBlank && duplicateHasVal) {
                mergedPatch[field.apiName] = dVal;
            }
        }

        if (Object.keys(mergedPatch).length > 0) {
            await upsertEavRecord(objectDef, writableFields, tenantId, mergedPatch, primaryRecordId);
        }

        // Re-point any EAV lookup values referencing the duplicate record to the primary record
        await sql`
            UPDATE metadata_values mv
            SET value_string = ${primaryRecordId}
            FROM metadata_records mr
            WHERE mv.record_id = mr.id
              AND mr.tenant_id = ${tenantId}
              AND mv.value_string = ${duplicateRecordId}
        `.execute();

        // Delete the duplicate EAV record
        await sql`
            DELETE FROM metadata_values
            WHERE record_id = ${duplicateRecordId}
              AND EXISTS (
                  SELECT 1 FROM metadata_records mr
                  WHERE mr.id = ${duplicateRecordId}
                    AND mr.tenant_id = ${tenantId}
              )
        `.execute();
        await sql`
            DELETE FROM metadata_records
            WHERE id = ${duplicateRecordId}
              AND tenant_id = ${tenantId}
        `.execute();

        await sql`
            INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_state)
            VALUES (
                ${tenantId},
                ${userId},
                'METADATA_RECORD_MERGED',
                ${apiName},
                ${primaryRecordId},
                ${JSON.stringify({
                    primaryRecordId,
                    duplicateRecordId,
                    backfilledFields: Object.keys(mergedPatch),
                    mergedAt: new Date().toISOString(),
                })}::jsonb
            )
        `.execute();

        revalidateTag('metadata', 'max');
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to merge records.',
        };
    }
}

/**
 * Logs a counselor / advisor / faculty quick activity (`CALL`, `COUNSELING_NOTE`,
 * `FOLLOW_UP_TASK`, or `WHATSAPP_SENT`) directly onto a record's 360° timeline.
 */
export async function logRecordQuickActivity(
    apiName: string,
    recordId: string,
    payload: {
        activityType: 'CALL' | 'COUNSELING_NOTE' | 'FOLLOW_UP_TASK' | 'WHATSAPP_SENT';
        subject: string;
        notes?: string;
        dueDate?: string;
    },
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!UUID_RE.test(recordId)) {
            return { success: false, error: 'Invalid record ID.' };
        }
        const subject = String(payload.subject || '').trim();
        if (!subject) {
            return { success: false, error: 'Activity subject is required.' };
        }
        const { tenantId, userId } = await requireAuth();

        await sql`
            INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_state)
            VALUES (
                ${tenantId},
                ${userId},
                'METADATA_RECORD_ACTIVITY',
                ${apiName},
                ${recordId},
                ${JSON.stringify({
                    activityType: payload.activityType,
                    subject,
                    notes: payload.notes?.trim() || null,
                    dueDate: payload.dueDate || null,
                    loggedAt: new Date().toISOString(),
                })}::jsonb
            )
        `.execute();

        revalidateTag('metadata', 'max');
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to log activity.',
        };
    }
}

// ============================================================================
// 10. Track C: Experience Cloud Portals (Web-to-Object Intake & Self-Service Status Tracker)
// ============================================================================

export interface ExperiencePortalConfig {
    enabled: boolean;
    portalTitle: string;
    portalDescription: string;
    exposedFields: string[];
    defaultStageField?: string;
    defaultStageValue?: string;
    successMessage?: string;
    enableStatusTracker: boolean;
}

/**
 * Persists the Experience Cloud Web-to-Object Public Portal configuration inside the object's
 * `FORM` layout (`schema.portalConfig`) in `metadata_layouts` and writes `EXPERIENCE_PORTAL_CONFIGURED`
 * to `audit_logs`.
 */
export async function savePortalIntakeConfig(
    objectId: string,
    config: ExperiencePortalConfig,
): Promise<{ success: boolean; objectId?: string; error?: string }> {
    try {
        const { tenantId, userId } = await requireAuth('metadata:publish');
        const client = await pool.connect();
        const q = sqlFor(client);
        try {
            await q`BEGIN`.execute();
            const targetObject = await ensureTenantOwnedMetadataObject(
                client,
                objectId,
                tenantId,
                userId,
            );

            const existingLayouts = await q<{ schema: Record<string, unknown> }>`
                SELECT schema
                FROM metadata_layouts
                WHERE object_id = ${targetObject.id}
                  AND layout_type = 'FORM'
                LIMIT 1
            `;
            const baseSchema =
                existingLayouts.length > 0 &&
                existingLayouts[0].schema &&
                typeof existingLayouts[0].schema === 'object'
                    ? { ...existingLayouts[0].schema }
                    : { sections: [] };

            const sanitizedConfig: ExperiencePortalConfig = {
                enabled: Boolean(config.enabled),
                portalTitle: String(config.portalTitle || '').trim().slice(0, 140),
                portalDescription: String(config.portalDescription || '').trim().slice(0, 500),
                exposedFields: Array.isArray(config.exposedFields)
                    ? config.exposedFields
                          .map(f => String(f || '').trim())
                          .filter(Boolean)
                    : [],
                defaultStageField: config.defaultStageField?.trim() || undefined,
                defaultStageValue: config.defaultStageValue?.trim() || undefined,
                successMessage: config.successMessage?.trim().slice(0, 300) || undefined,
                enableStatusTracker: Boolean(config.enableStatusTracker),
            };

            const nextSchema = {
                ...baseSchema,
                portalConfig: sanitizedConfig,
            };

            await q`
                DELETE FROM metadata_layouts
                WHERE object_id = ${targetObject.id}
                  AND layout_type = 'FORM'
            `.execute();

            await q`
                INSERT INTO metadata_layouts (object_id, layout_type, schema, is_default, created_at)
                VALUES (${targetObject.id}, 'FORM', ${JSON.stringify(nextSchema)}::jsonb, true, NOW())
            `.execute();

            await q`
                INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_state)
                VALUES (
                    ${tenantId},
                    ${userId},
                    'EXPERIENCE_PORTAL_CONFIGURED',
                    'metadata_object',
                    ${targetObject.id},
                    ${JSON.stringify(sanitizedConfig)}::jsonb
                )
            `.execute();

            await q`COMMIT`.execute();
            revalidateTag('metadata', 'max');
            return { success: true, objectId: targetObject.id };
        } catch (err) {
            await q`ROLLBACK`.execute();
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save portal configuration.',
        };
    }
}

export interface PublicPortalSchemaResult {
    enabled: boolean;
    objectName: string;
    objectApiName: string;
    portalConfig: ExperiencePortalConfig;
    fields: MetadataField[];
    stageField?: {
        apiName: string;
        label: string;
        options: string[];
    } | null;
}

/**
 * Loads the public-safe Web-to-Object intake schema for `/portal/[tenantId]/[object]`.
 * Only exposes fields explicitly whitelisted in `portalConfig.exposedFields` when `portalConfig.enabled` is true.
 */
export async function getPublicPortalIntakeSchema(
    tenantId: string,
    objectApiName: string,
): Promise<PublicPortalSchemaResult | null> {
    try {
        if (!UUID_RE.test(tenantId)) return null;
        assertSafeMetadataIdentifier(objectApiName, 'object API name');

        const { objectDef, fields, layouts } = await loadObjectMetadata(objectApiName, tenantId);
        const formLayout = layouts.find(l => l.layoutType === 'FORM');
        const rawSchema = (formLayout?.schema || {}) as Record<string, unknown>;
        const rawPortal = (rawSchema.portalConfig || {}) as Partial<ExperiencePortalConfig>;

        if (!rawPortal.enabled) {
            return null;
        }

        const writableFields = fields.filter(
            f => !isVirtualMetadataField(f) && f.validationRules?.fieldSubType !== 'AUTO_NUMBER',
        );
        const exposedSet = new Set(
            Array.isArray(rawPortal.exposedFields) && rawPortal.exposedFields.length > 0
                ? rawPortal.exposedFields
                : writableFields.map(f => f.apiName),
        );
        const publicFields = writableFields.filter(f => exposedSet.has(f.apiName));

        const stageCandidate =
            fields.find(
                f =>
                    f.apiName === rawPortal.defaultStageField &&
                    f.dataType === 'PICKLIST' &&
                    Array.isArray(f.picklistOptions) &&
                    f.picklistOptions.length > 0,
            ) ||
            fields.find(
                f =>
                    f.dataType === 'PICKLIST' &&
                    Array.isArray(f.picklistOptions) &&
                    f.picklistOptions.length > 0,
            );

        return {
            enabled: true,
            objectName: objectDef.name,
            objectApiName: objectDef.apiName,
            portalConfig: {
                enabled: true,
                portalTitle: rawPortal.portalTitle || `${objectDef.name} Intake Portal`,
                portalDescription:
                    rawPortal.portalDescription ||
                    `Submit your ${objectDef.name.toLowerCase()} details below.`,
                exposedFields: publicFields.map(f => f.apiName),
                defaultStageField: rawPortal.defaultStageField,
                defaultStageValue: rawPortal.defaultStageValue,
                successMessage:
                    rawPortal.successMessage ||
                    'Your submission has been received! Keep your tracking reference below to check your live application status.',
                enableStatusTracker: rawPortal.enableStatusTracker ?? true,
            },
            fields: publicFields,
            stageField: stageCandidate
                ? {
                      apiName: stageCandidate.apiName,
                      label: stageCandidate.label,
                      options: stageCandidate.picklistOptions || [],
                  }
                : null,
        };
    } catch {
        return null;
    }
}

/**
 * Submits a record from the public Experience Cloud Web-to-Object Intake Portal:
 *   1. Verifies `portalConfig.enabled === true` on the object.
 *   2. Restricts submitted payload strictly to `portalConfig.exposedFields` plus optional `defaultStageField`.
 *   3. Runs full validation (`EMAIL`, `PHONE`, `URL`, Cross-Field Validation Rules, and `AUTO_NUMBER` generation).
 *   4. Enforces `BLOCK` Duplicate Rules against existing tenant records.
 *   5. Saves the EAV record, triggers active workflows (`object.record.upserted`), and logs `EXPERIENCE_PORTAL_SUBMISSION`.
 */
export async function submitPublicPortalIntakeRecord(
    tenantId: string,
    objectApiName: string,
    rawSubmission: Record<string, unknown>,
): Promise<{
    success: boolean;
    recordId?: string;
    trackingReference?: string;
    error?: string;
}> {
    try {
        const portalSchema = await getPublicPortalIntakeSchema(tenantId, objectApiName);
        if (!portalSchema || !portalSchema.enabled) {
            return {
                success: false,
                error: 'This public intake portal is not currently active.',
            };
        }

        const { objectDef, fields } = await loadObjectMetadata(objectApiName, tenantId);
        if (resolveMetadataStorageMode(objectDef) !== 'EAV') {
            return {
                success: false,
                error: 'Web-to-Object public intake is supported on custom EAV objects.',
            };
        }

        const persistedFields = fields.filter(f => !isVirtualMetadataField(f));
        const exposedSet = new Set(portalSchema.portalConfig.exposedFields);

        const filteredPayload: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rawSubmission)) {
            if (exposedSet.has(k)) {
                if (typeof v === 'string' && v.length > 4000) {
                    return {
                        success: false,
                        error: `Field "${k}" exceeds the 4,000 character guest portal limit.`,
                    };
                }
                filteredPayload[k] = v;
            }
        }

        // Apply default stage value if configured on the portal
        const { defaultStageField, defaultStageValue } = portalSchema.portalConfig;
        if (defaultStageField && defaultStageValue && !filteredPayload[defaultStageField]) {
            filteredPayload[defaultStageField] = defaultStageValue;
        }

        // Validate only exposed + default + auto-number fields
        const fieldsToValidate = persistedFields.filter(
            f =>
                exposedSet.has(f.apiName) ||
                f.apiName === defaultStageField ||
                f.validationRules?.fieldSubType === 'AUTO_NUMBER',
        );

        const validated = validateMetadataRecordPayload(fieldsToValidate, filteredPayload, {
            requireAll: true,
        });
        if (validated.ok === false) {
            return { success: false, error: validated.errors.join(' ') };
        }

        // Check blocking duplicate rules
        const hasBlockingDuplicateRule = fieldsToValidate.some(
            f => f.validationRules?.duplicateRuleBehavior === 'BLOCK',
        );
        if (hasBlockingDuplicateRule) {
            const existingRecords = await queryEavRecords(
                objectDef,
                persistedFields,
                tenantId,
                null,
                250,
                0,
            );
            const dupCheck = detectMetadataDuplicates(
                fieldsToValidate,
                validated.data,
                existingRecords,
            );
            if (dupCheck.blocked && dupCheck.matches.length > 0) {
                const firstBlock =
                    dupCheck.matches.find(m => m.behavior === 'BLOCK') ?? dupCheck.matches[0];
                return {
                    success: false,
                    error: `A submission with this ${firstBlock.fieldLabel} ("${firstBlock.matchedValue}") is already registered.`,
                };
            }
        }

        const recordId = await upsertEavRecord(
            objectDef,
            persistedFields,
            tenantId,
            validated.data,
        );

        await executeMatchingWorkflows(
            tenantId,
            objectApiName,
            'object.record.upserted',
            validated.data,
            recordId,
        );

        const autoNumField = persistedFields.find(
            f => f.validationRules?.fieldSubType === 'AUTO_NUMBER',
        );
        const trackingReference =
            autoNumField && validated.data[autoNumField.apiName]
                ? String(validated.data[autoNumField.apiName])
                : recordId.slice(0, 8).toUpperCase();

        await sql`
            INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, after_state)
            VALUES (
                ${tenantId},
                'EXPERIENCE_PORTAL_SUBMISSION',
                ${objectApiName},
                ${recordId},
                ${JSON.stringify({
                    trackingReference,
                    submittedFields: Object.keys(validated.data),
                    submittedAt: new Date().toISOString(),
                })}::jsonb
            )
        `.execute();

        revalidateTag('metadata', 'max');
        return {
            success: true,
            recordId,
            trackingReference,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to submit portal form.',
        };
    }
}

/**
 * Allows an external applicant/student/parent to check the live Stage Path status of their
 * submitted record on `/portal/[tenantId]/[object]` by providing their Tracking Reference
 * (Auto-Number or Record ID prefix) and a matching contact field (Email or Phone).
 */
export async function lookupPublicPortalRecordStatus(
    tenantId: string,
    objectApiName: string,
    referenceQuery: string,
    contactVerifier: string,
): Promise<{
    found: boolean;
    reference?: string;
    currentStage?: string;
    stageLabel?: string;
    stageOptions?: string[];
    submittedAt?: string;
    updatedAt?: string;
    error?: string;
}> {
    try {
        const portalSchema = await getPublicPortalIntakeSchema(tenantId, objectApiName);
        if (!portalSchema || !portalSchema.enabled || !portalSchema.portalConfig.enableStatusTracker) {
            return { found: false, error: 'Application status tracking is not enabled for this portal.' };
        }

        const cleanRef = String(referenceQuery || '').trim().toLowerCase();
        const cleanVerifier = String(contactVerifier || '').trim().toLowerCase();
        if (!cleanRef || !cleanVerifier) {
            return {
                found: false,
                error: 'Enter both your Tracking Reference and registered Email or Phone.',
            };
        }

        const { objectDef, fields } = await loadObjectMetadata(objectApiName, tenantId);
        const records = await queryEavRecords(objectDef, fields, tenantId, null, 200, 0);

        const autoNumField = fields.find(f => f.validationRules?.fieldSubType === 'AUTO_NUMBER');
        const contactFieldNames = new Set(
            fields
                .filter(
                    f =>
                        f.validationRules?.fieldSubType === 'EMAIL' ||
                        f.validationRules?.fieldSubType === 'PHONE' ||
                        /email|phone|mobile|contact/i.test(f.apiName),
                )
                .map(f => f.apiName),
        );
        const verifierDigits = cleanVerifier.replace(/\D/g, '');

        const matchedRow = records.find(row => {
            const idStr = String(row.id || '').toLowerCase();
            const autoVal = autoNumField
                ? String(row[autoNumField.apiName] || '').trim().toLowerCase()
                : '';
            const refMatches =
                idStr === cleanRef ||
                (cleanRef.length >= 8 && idStr.startsWith(cleanRef)) ||
                (autoVal.length > 0 && autoVal === cleanRef);
            if (!refMatches) return false;

            // Strictly verify against designated contact fields (EMAIL / PHONE)
            const candidateKeys =
                contactFieldNames.size > 0 ? [...contactFieldNames] : Object.keys(row);
            return candidateKeys.some(key => {
                const val = row[key];
                if (val === null || val === undefined) return false;
                const strVal = String(val).trim().toLowerCase();
                if (strVal === cleanVerifier) return true;
                const valDigits = strVal.replace(/\D/g, '');
                return verifierDigits.length >= 7 && valDigits === verifierDigits;
            });
        });

        if (!matchedRow) {
            return {
                found: false,
                error: 'No matching submission found for that reference and contact detail.',
            };
        }

        const stageField = portalSchema.stageField;
        const currentStage = stageField
            ? String(matchedRow[stageField.apiName] || 'SUBMITTED')
            : 'SUBMITTED';
        const displayRef =
            autoNumField && matchedRow[autoNumField.apiName]
                ? String(matchedRow[autoNumField.apiName])
                : String(matchedRow.id || '').slice(0, 8).toUpperCase();

        return {
            found: true,
            reference: displayRef,
            currentStage,
            stageLabel: stageField?.label || 'Application Status',
            stageOptions: stageField?.options || ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'],
            submittedAt: matchedRow.created_at ? String(matchedRow.created_at) : undefined,
            updatedAt: matchedRow.updated_at ? String(matchedRow.updated_at) : undefined,
        };
    } catch (error) {
        return {
            found: false,
            error: error instanceof Error ? error.message : 'Unable to look up status.',
        };
    }
}

// ============================================================================
// 11. Track D: Native Schema Package Studio (Export & Import .scholarmind.json Bundles)
// ============================================================================

/**
 * Exports selected (or all) tenant custom objects, fields, validation rules, layouts,
 * and workflow automations into a portable `.scholarmind.json` Schema Bundle (`ScholarMindSchemaBundle`)
 * for Sandbox-to-Production and Multi-Campus deployment on Vercel + Neon PostgreSQL.
 */
export async function exportTenantSchemaBundle(params: {
    bundleName: string;
    bundleDescription?: string;
    objectApiNames?: string[];
}): Promise<{
    success: boolean;
    bundle?: ScholarMindSchemaBundle;
    error?: string;
}> {
    try {
        const { tenantId, userId } = await requireAuth('metadata:publish');
        const bundleName = String(params.bundleName || 'ScholarMind Campus Schema Bundle').trim();

        const objectRows = await sql<{
            id: string;
            name: string;
            api_name: string;
            description: string | null;
        }>`
            SELECT id, name, api_name, description
            FROM metadata_objects
            WHERE tenant_id = ${tenantId}
              AND status = 'PUBLISHED'
            ORDER BY name ASC
        `;

        const filterSet =
            Array.isArray(params.objectApiNames) && params.objectApiNames.length > 0
                ? new Set(params.objectApiNames.map(a => a.trim().toLowerCase()))
                : null;

        const selectedObjects = filterSet
            ? objectRows.filter(o => filterSet.has(o.api_name.toLowerCase()))
            : objectRows;

        if (selectedObjects.length === 0) {
            return {
                success: false,
                error: 'No published custom objects found to export into the schema bundle.',
            };
        }

        const bundleObjects: ScholarMindSchemaBundle['objects'] = [];
        const selectedApiNames = new Set<string>();

        for (const obj of selectedObjects) {
            selectedApiNames.add(obj.api_name.toLowerCase());
            const fieldRows = await sql<{
                label: string;
                api_name: string;
                data_type: MetadataDataType;
                is_required: boolean;
                picklist_options: string[] | null;
                validation_rules: MetadataValidationRules | null;
            }>`
                SELECT label, api_name, data_type, is_required, picklist_options, validation_rules
                FROM metadata_fields
                WHERE object_id = ${obj.id}
                  AND status = 'ACTIVE'
                ORDER BY created_at ASC
            `;

            const layoutRows = await sql<{
                layout_type: 'FORM' | 'LIST';
                schema: Record<string, unknown>;
            }>`
                SELECT layout_type, schema
                FROM metadata_layouts
                WHERE object_id = ${obj.id}
                  AND layout_type IN ('FORM', 'LIST')
            `;

            bundleObjects.push({
                name: obj.name,
                apiName: obj.api_name,
                description: obj.description || '',
                fields: fieldRows.map(f => ({
                    label: f.label,
                    apiName: f.api_name,
                    dataType: f.data_type,
                    isRequired: Boolean(f.is_required),
                    picklistOptions: Array.isArray(f.picklist_options) ? f.picklist_options : [],
                    validationRules: f.validation_rules || {},
                })),
                layouts: layoutRows.map(l => ({
                    layoutType: l.layout_type,
                    schema: l.schema || {},
                })),
            });
        }

        const workflowRows = await sql<{
            name: string;
            object_name: string;
            trigger_event: string;
            conditions: { field: string; operator: string; value: string }[] | null;
            action_type: string;
            action_payload: Record<string, unknown> | null;
        }>`
            SELECT name, object_name, trigger_event, conditions, action_type, action_payload
            FROM metadata_workflows
            WHERE tenant_id = ${tenantId}
              AND is_active = true
        `;

        const bundleWorkflows = workflowRows
            .filter(w => selectedApiNames.has(w.object_name.toLowerCase()))
            .map(w => ({
                name: w.name,
                objectName: w.object_name,
                triggerEvent: w.trigger_event,
                conditions: Array.isArray(w.conditions) ? w.conditions : [],
                actionType: w.action_type,
                actionPayload: redactSensitiveWorkflowPayload(w.action_payload || {}),
            }));

        const bundle: ScholarMindSchemaBundle = {
            formatVersion: 'scholarmind.bundle.v1',
            bundleName,
            bundleDescription:
                String(params.bundleDescription || '').trim() ||
                `Exported ${bundleObjects.length} object(s) and ${bundleWorkflows.length} workflow(s).`,
            exportedAt: new Date().toISOString(),
            objects: bundleObjects,
            workflows: bundleWorkflows,
        };

        await sql`
            INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, after_state)
            VALUES (
                ${tenantId},
                ${userId},
                'SCHEMA_BUNDLE_EXPORTED',
                'metadata_bundle',
                ${JSON.stringify({
                    bundleName,
                    objectCount: bundleObjects.length,
                    workflowCount: bundleWorkflows.length,
                    exportedAt: bundle.exportedAt,
                })}::jsonb
            )
        `.execute();

        return { success: true, bundle };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to export schema bundle.',
        };
    }
}

/**
 * Validates and deploys a `.scholarmind.json` Schema Bundle (`ScholarMindSchemaBundle`)
 * idempotently into the current tenant on Neon PostgreSQL, provisioning objects, fields,
 * layouts, and workflows in a single database transaction.
 */
export async function importTenantSchemaBundle(
    rawBundle: unknown,
): Promise<{
    success: boolean;
    importedObjects: string[];
    importedFields: number;
    importedWorkflows: number;
    error?: string;
}> {
    try {
        const { tenantId, userId } = await requireAuth('metadata:publish');
        const validated = validateScholarMindSchemaBundle(rawBundle);
        if (validated.ok === false) {
            return {
                success: false,
                importedObjects: [],
                importedFields: 0,
                importedWorkflows: 0,
                error: validated.error,
            };
        }

        const { bundle } = validated;
        const client = await pool.connect();
        const q = sqlFor(client);
        const importedObjects: string[] = [];
        let importedFields = 0;
        let importedWorkflows = 0;

        try {
            await q`BEGIN`.execute();

            for (const objSpec of bundle.objects) {
                const existingObj = await q<{ id: string }>`
                    SELECT id
                    FROM metadata_objects
                    WHERE tenant_id = ${tenantId}
                      AND api_name = ${objSpec.apiName}
                    LIMIT 1
                `;

                let objectId: string;
                if (existingObj.length > 0) {
                    objectId = existingObj[0].id;
                    await q`
                        UPDATE metadata_objects
                        SET name = ${objSpec.name},
                            description = ${objSpec.description},
                            status = 'PUBLISHED'
                        WHERE id = ${objectId}
                    `.execute();
                } else {
                    const insertedObj = await q<{ id: string }>`
                        INSERT INTO metadata_objects (
                            tenant_id, name, api_name, table_name, description, is_custom,
                            status, version, published_version, published_at
                        )
                        VALUES (
                            ${tenantId},
                            ${objSpec.name},
                            ${objSpec.apiName},
                            ${metadataTableNameForNewObject()},
                            ${objSpec.description},
                            true,
                            'PUBLISHED',
                            1,
                            1,
                            NOW()
                        )
                        RETURNING id
                    `;
                    objectId = insertedObj[0].id;
                }

                for (const fieldSpec of objSpec.fields) {
                    const existingField = await q<{ id: string }>`
                        SELECT id
                        FROM metadata_fields
                        WHERE object_id = ${objectId}
                          AND api_name = ${fieldSpec.apiName}
                        LIMIT 1
                    `;
                    if (existingField.length === 0) {
                        await q`
                            INSERT INTO metadata_fields (
                                object_id, label, api_name, data_type, is_custom, is_required,
                                picklist_options, validation_rules, status, version
                            )
                            VALUES (
                                ${objectId},
                                ${fieldSpec.label},
                                ${fieldSpec.apiName},
                                ${fieldSpec.dataType},
                                true,
                                ${fieldSpec.isRequired},
                                ${JSON.stringify(fieldSpec.picklistOptions)}::jsonb,
                                ${JSON.stringify(fieldSpec.validationRules)}::jsonb,
                                'ACTIVE',
                                1
                            )
                        `.execute();
                        importedFields++;
                    }
                }

                if (objSpec.layouts.length > 0) {
                    for (const layoutSpec of objSpec.layouts) {
                        await q`
                            DELETE FROM metadata_layouts
                            WHERE object_id = ${objectId}
                              AND layout_type = ${layoutSpec.layoutType}
                        `.execute();
                        await q`
                            INSERT INTO metadata_layouts (object_id, layout_type, schema, is_default, created_at)
                            VALUES (
                                ${objectId},
                                ${layoutSpec.layoutType},
                                ${JSON.stringify(layoutSpec.schema)}::jsonb,
                                true,
                                NOW()
                            )
                        `.execute();
                    }
                }

                importedObjects.push(objSpec.apiName);
            }

            for (const wfSpec of bundle.workflows) {
                const existingWf = await q<{ id: string }>`
                    SELECT id
                    FROM metadata_workflows
                    WHERE tenant_id = ${tenantId}
                      AND name = ${wfSpec.name}
                      AND object_name = ${wfSpec.objectName}
                    LIMIT 1
                `;
                if (existingWf.length === 0) {
                    await q`
                        INSERT INTO metadata_workflows (
                            tenant_id, name, object_name, trigger_event, conditions,
                            action_type, action_payload, is_active
                        )
                        VALUES (
                            ${tenantId},
                            ${wfSpec.name},
                            ${wfSpec.objectName},
                            ${wfSpec.triggerEvent},
                            ${JSON.stringify(wfSpec.conditions)}::jsonb,
                            ${wfSpec.actionType},
                            ${JSON.stringify(wfSpec.actionPayload)}::jsonb,
                            true
                        )
                    `.execute();
                    importedWorkflows++;
                }
            }

            await q`
                INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, after_state)
                VALUES (
                    ${tenantId},
                    ${userId},
                    'SCHEMA_BUNDLE_IMPORTED',
                    'metadata_bundle',
                    ${JSON.stringify({
                        bundleName: bundle.bundleName,
                        importedObjects,
                        importedFields,
                        importedWorkflows,
                        importedAt: new Date().toISOString(),
                    })}::jsonb
                )
            `.execute();

            await q`COMMIT`.execute();
            revalidateTag('metadata', 'max');
            return {
                success: true,
                importedObjects,
                importedFields,
                importedWorkflows,
            };
        } catch (err) {
            await q`ROLLBACK`.execute();
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        return {
            success: false,
            importedObjects: [],
            importedFields: 0,
            importedWorkflows: 0,
            error: error instanceof Error ? error.message : 'Failed to import schema bundle.',
        };
    }
}





