'use server';

import { pool, runWithTenantContext } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { redirect } from 'next/navigation';
import { unstable_cache, revalidateTag } from 'next/cache';
import { hash } from 'bcryptjs';
import crypto from 'crypto';
import {
    requireApprovedWorkflowApprovalOrRequest,
    toWorkflowApprovalSummary,
} from '@school-sis/api';
import type { AuthorizationRole } from '@school-sis/api';
import {
    assertSafeMetadataIdentifier,
    normalizeMetadataFieldInput,
    quoteIdentifier,
    validateMetadataRecordPayload,
    type MetadataDataType,
    type MetadataValidationRules,
} from '@/lib/metadata/platform';

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
}

export interface MetadataLayout {
    id: string;
    objectId: string;
    layoutType: 'FORM' | 'LIST';
    schema: any;
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
    const objQuery = `
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
        WHERE api_name = $1
          AND status = 'PUBLISHED'
          AND (
            tenant_id = $2
            OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
          )
        ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END, created_at DESC
        LIMIT 1
    `;
    const { rows: objRows } = await pool.query(objQuery, [apiName, tenantId]);
    if (objRows.length === 0) throw new Error(`Object ${apiName} not found`);
    const objectDef: MetadataObject = objRows[0];

    assertSafeMetadataIdentifier(objectDef.tableName, 'metadata table name');

    // Get Fields
    const fieldsQuery = `
        SELECT id, object_id as "objectId", label, api_name as "apiName", data_type as "dataType", 
               is_custom as "isCustom",
               is_required as "isRequired",
               default_value as "defaultValue",
               picklist_options as "picklistOptions",
               validation_rules as "validationRules",
               status,
               version
        FROM metadata_fields
        WHERE object_id = $1
          AND status = 'ACTIVE'
        ORDER BY created_at ASC
    `;
    const { rows: fieldRows } = await pool.query(fieldsQuery, [objectDef.id]);
    const fields: MetadataField[] = fieldRows;

    // Get Layouts
    const layoutQuery = `
        SELECT id, object_id as "objectId", layout_type as "layoutType", schema, is_default as "isDefault"
        FROM metadata_layouts
        WHERE object_id = $1 AND is_default = true
    `;
    const { rows: layoutRows } = await pool.query(layoutQuery, [objectDef.id]);
    const layouts: MetadataLayout[] = layoutRows;

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
 * Fetches the object definition including all its fields and layout schemas
 */
export async function getObjectMetadata(apiName: string) {
    const { tenantId } = await requireAuth();
    if (process.env.NODE_ENV === 'test' || process.env.DATABASE_URL?.includes('_test')) {
        return runWithTenantContext(tenantId, () => fetchObjectMetadata(apiName, tenantId));
    }
    return getCachedObjectMetadata(apiName, tenantId);
}

/**
 * Fetch records for a specific object, handling JSONB custom fields mapping
 */
export async function queryRecords(apiName: string, filters: Record<string, any> = {}, limit = 50, offset = 0) {
    const { tenantId } = await requireAuth();
    const { objectDef, fields } = await getObjectMetadata(apiName);

    // Build standard SELECT columns
    const standardFields = fields.filter(f => !f.isCustom).map(f => quoteIdentifier(f.apiName));
    // Determine if we need to fetch custom_data
    const hasCustomFields = fields.some(f => f.isCustom);
    const tableName = quoteIdentifier(objectDef.tableName);
    
    // We always need id and tenant_id
    const selectCols = [quoteIdentifier('id'), ...standardFields];
    if (hasCustomFields && !selectCols.includes('custom_data')) {
        selectCols.push(quoteIdentifier('custom_data'));
    }

    // A real implementation would parse filters, check SQL injection, etc.
    const query = `
        SELECT ${selectCols.join(', ')} 
        FROM ${tableName} 
        WHERE tenant_id = $1
        LIMIT $2 OFFSET $3
    `;

    const { rows } = await pool.query(query, [tenantId, limit, offset]);

    // Flatten custom_data into the root object for the UI
    return rows.map(row => {
        const { custom_data, ...rest } = row;
        const serializedRest: Record<string, any> = {};
        for (const [key, val] of Object.entries(rest)) {
            if (val instanceof Date) {
                serializedRest[key] = val.toISOString().split('T')[0];
            } else {
                serializedRest[key] = val;
            }
        }
        return {
            ...serializedRest,
            ...(custom_data || {})
        };
    });
}

/**
 * Inserts or Updates a record, mapping fields to columns and packing unknown fields into JSONB custom_data
 */
export async function upsertRecord(apiName: string, data: Record<string, any>, id?: string) {
    try {
        const { tenantId } = await requireAuth();
        const { objectDef, fields } = await getObjectMetadata(apiName);

        const standardFields = fields.filter(f => !f.isCustom);
        const customFields = fields.filter(f => f.isCustom);
        
        // Separate data into standard columns and custom_data
        const standardData: Record<string, any> = {};
        const customData: Record<string, any> = {};

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
                    const { rows: gradeRows } = await pool.query('SELECT id FROM grades WHERE tenant_id = $1 LIMIT 1', [tenantId]);
                    if (gradeRows.length > 0) standardData.grade_id = gradeRows[0].id;
                } else {
                    const { rowCount } = await pool.query(
                        'SELECT 1 FROM grades WHERE id = $1 AND tenant_id = $2 LIMIT 1',
                        [standardData.grade_id, tenantId]
                    );
                    if (rowCount === 0) throw new Error('Grade not found for tenant');
                }
                if (!standardData.section_id) {
                    const { rows: sectionRows } = await pool.query('SELECT id FROM sections WHERE tenant_id = $1 LIMIT 1', [tenantId]);
                    if (sectionRows.length > 0) standardData.section_id = sectionRows[0].id;
                } else {
                    const { rowCount } = await pool.query(
                        'SELECT 1 FROM sections WHERE id = $1 AND tenant_id = $2 LIMIT 1',
                        [standardData.section_id, tenantId]
                    );
                    if (rowCount === 0) throw new Error('Section not found for tenant');
                }
            }

            if (apiName === 'staff') {
                if (!standardData.joining_date) {
                    standardData.joining_date = new Date().toISOString().split('T')[0];
                }
                // Create a user account for the staff member
                const email = `${standardData.employee_id || 'staff_' + Math.random().toString(36).substring(2, 11)}@greenwood.edu`;
                const userInsertQuery = `
                    INSERT INTO users (tenant_id, email, password_hash, role, first_name, last_name)
                    VALUES ($1, $2, $3, 'TEACHER', $4, $5)
                    RETURNING id
                `;
                const passwordHash = await hash(crypto.randomBytes(18).toString('base64url'), 12);
                const firstName = customData.first_name || 'Staff';
                const lastName = customData.last_name || 'Member';
                const { rows: userRows } = await pool.query(userInsertQuery, [tenantId, email, passwordHash, firstName, lastName]);
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
                if (!standardData.student_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(standardData.student_id)) {
                    const { rows: studentRows } = await pool.query('SELECT id FROM students WHERE tenant_id = $1 LIMIT 1', [tenantId]);
                    if (studentRows.length > 0) standardData.student_id = studentRows[0].id;
                } else {
                    const { rowCount } = await pool.query(
                        'SELECT 1 FROM students WHERE id = $1 AND tenant_id = $2 LIMIT 1',
                        [standardData.student_id, tenantId]
                    );
                    if (rowCount === 0) throw new Error('Student not found for tenant');
                }
                if (!standardData.fee_plan_id) {
                    const { rows: feePlanRows } = await pool.query('SELECT id FROM fee_plans WHERE tenant_id = $1 LIMIT 1', [tenantId]);
                    if (feePlanRows.length > 0) standardData.fee_plan_id = feePlanRows[0].id;
                } else {
                    const { rowCount } = await pool.query(
                        'SELECT 1 FROM fee_plans WHERE id = $1 AND tenant_id = $2 LIMIT 1',
                        [standardData.fee_plan_id, tenantId]
                    );
                    if (rowCount === 0) throw new Error('Fee plan not found for tenant');
                }
            }
        }

        if (standardData.gender) {
            standardData.gender = standardData.gender.toUpperCase();
        }

        const validated = validateMetadataRecordPayload(fields, { ...standardData, ...customData }, { requireAll: !id });
        if (validated.ok === false) {
            throw new Error(validated.errors.join(' '));
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
            const values: any[] = [id, tenantId];
            let argIndex = 3;

            for (const [key, value] of Object.entries(standardData)) {
                setClauses.push(`${quoteIdentifier(key)} = $${argIndex++}`);
                values.push(value);
            }

            if (hasCustomData) {
                setClauses.push(`${quoteIdentifier('custom_data')} = COALESCE(${quoteIdentifier('custom_data')}, '{}'::jsonb) || $${argIndex++}`);
                values.push(JSON.stringify(customData));
            }

            if (setClauses.length === 0) return { id }; // Nothing to update

            const query = `
                UPDATE ${tableName}
                SET ${setClauses.join(', ')}, ${quoteIdentifier('updated_at')} = CURRENT_TIMESTAMP
                WHERE id = $1 AND tenant_id = $2
                RETURNING id
            `;
             const { rows } = await pool.query(query, values);
            
            redirect(`/app/${apiName}`);
        } else {
            // INSERT
            const keys = [quoteIdentifier('tenant_id')];
            const values: any[] = [tenantId];
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

            redirect(`/app/${apiName}`);
        }
    } catch (e: any) {
        if (e.digest?.startsWith('NEXT_REDIRECT') || e.message === 'NEXT_REDIRECT') {
            throw e;
        }
        console.error("UPSERT RECORD ERROR FOR OBJECT:", apiName, e);
        throw e;
    }
}

/**
 * Fetches all metadata objects for the Object Manager
 */
export async function getAllMetadataObjects() {
    const { tenantId } = await requireAuth();
    const { rows } = await pool.query(`
        SELECT *
        FROM (
            SELECT DISTINCT ON (api_name) *
            FROM metadata_objects
            WHERE status <> 'ARCHIVED'
              AND (
                tenant_id = $1
                OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
              )
            ORDER BY api_name, CASE WHEN tenant_id = $1 THEN 0 ELSE 1 END, created_at DESC
        ) resolved_objects
        ORDER BY name ASC
    `, [tenantId]);
    return rows;
}

async function snapshotMetadataSchema(
    client: any,
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
    client: any,
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
    fieldData: any,
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

    const { rows: objRows } = await pool.query(`
        SELECT * FROM metadata_objects 
        WHERE id = $1
          AND status <> 'ARCHIVED'
          AND (
            tenant_id = $2
            OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
          )
    `, [objectId, tenantId]);

    if (objRows.length === 0) throw new Error("Object not found");

    let objectDef = objRows[0];
    if (objectDef.tenant_id === null) {
        const { rows: tenantObjectRows } = await pool.query(
            `SELECT *
             FROM metadata_objects
             WHERE tenant_id = $1
               AND api_name = $2
               AND status <> 'ARCHIVED'
             ORDER BY created_at DESC
             LIMIT 1`,
            [tenantId, objectDef.api_name],
        );
        if (tenantObjectRows.length > 0) objectDef = tenantObjectRows[0];
    }

    const { rows: fieldRows } = await pool.query(`
        SELECT * FROM metadata_fields 
        WHERE object_id = $1
          AND status <> 'ARCHIVED'
        ORDER BY is_custom ASC, label ASC
    `, [objectDef.id]);

    return {
        objectDef,
        fields: fieldRows.map(row => ({
            id: row.id,
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
        } as MetadataField))
    };
}
