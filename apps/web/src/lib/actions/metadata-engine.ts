'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { redirect } from 'next/navigation';
import { unstable_cache, revalidateTag } from 'next/cache';

export interface MetadataObject {
    id: string;
    tenantId: string | null;
    name: string;
    apiName: string;
    tableName: string;
    isCustom: boolean;
}

export interface MetadataField {
    id: string;
    objectId: string;
    label: string;
    apiName: string;
    dataType: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'PICKLIST';
    isCustom: boolean;
    isRequired: boolean;
    defaultValue: string | null;
    picklistOptions: string[];
}

export interface MetadataLayout {
    id: string;
    objectId: string;
    layoutType: 'FORM' | 'LIST';
    schema: any;
    isDefault: boolean;
}

async function fetchObjectMetadata(apiName: string, tenantId: string) {
    // Get Object
    const objQuery = `
        SELECT id, tenant_id as "tenantId", name, api_name as "apiName", table_name as "tableName", is_custom as "isCustom"
        FROM metadata_objects
        WHERE api_name = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
        LIMIT 1
    `;
    const { rows: objRows } = await pool.query(objQuery, [apiName, tenantId]);
    if (objRows.length === 0) throw new Error(`Object ${apiName} not found`);
    const objectDef: MetadataObject = objRows[0];

    // Get Fields
    const fieldsQuery = `
        SELECT id, object_id as "objectId", label, api_name as "apiName", data_type as "dataType", 
               is_custom as "isCustom", is_required as "isRequired", default_value as "defaultValue", picklist_options as "picklistOptions"
        FROM metadata_fields
        WHERE object_id = $1
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
        return fetchObjectMetadata(apiName, tenantId);
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
        return fetchObjectMetadata(apiName, tenantId);
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
    const standardFields = fields.filter(f => !f.isCustom).map(f => `"${f.apiName}"`);
    // Determine if we need to fetch custom_data
    const hasCustomFields = fields.some(f => f.isCustom);
    
    // We always need id and tenant_id
    const selectCols = ['id', ...standardFields];
    if (hasCustomFields && !selectCols.includes('custom_data')) {
        selectCols.push('custom_data');
    }

    // A real implementation would parse filters, check SQL injection, etc.
    const query = `
        SELECT ${selectCols.join(', ')} 
        FROM ${objectDef.tableName} 
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
            if (standardFields.some(f => f.apiName === key)) {
                standardData[key] = value === '' ? null : value;
            } else if (customFields.some(f => f.apiName === key)) {
                customData[key] = value;
            } else if (key === 'id' || key === 'tenantId') {
                // ignore protected
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
                    const { rows: gradeRows } = await pool.query('SELECT id FROM grades LIMIT 1');
                    if (gradeRows.length > 0) standardData.grade_id = gradeRows[0].id;
                }
                if (!standardData.section_id) {
                    const { rows: sectionRows } = await pool.query('SELECT id FROM sections LIMIT 1');
                    if (sectionRows.length > 0) standardData.section_id = sectionRows[0].id;
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
                const passwordHash = '$2a$10$dummyhash'; // dummy bcrypt password hash
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
                    const { rows: studentRows } = await pool.query('SELECT id FROM students LIMIT 1');
                    if (studentRows.length > 0) standardData.student_id = studentRows[0].id;
                }
                if (!standardData.fee_plan_id) {
                    const { rows: feePlanRows } = await pool.query('SELECT id FROM fee_plans LIMIT 1');
                    if (feePlanRows.length > 0) standardData.fee_plan_id = feePlanRows[0].id;
                }
            }
        }

        if (standardData.gender) {
            standardData.gender = standardData.gender.toUpperCase();
        }

        const hasCustomData = Object.keys(customData).length > 0 || customFields.length > 0;
        
        if (id) {
            // UPDATE
            let setClauses = [];
            let values = [id, tenantId];
            let argIndex = 3;

            for (const [key, value] of Object.entries(standardData)) {
                setClauses.push(`"${key}" = $${argIndex++}`);
                values.push(value);
            }

            if (hasCustomData) {
                setClauses.push(`custom_data = custom_data || $${argIndex++}`);
                values.push(JSON.stringify(customData));
            }

            if (setClauses.length === 0) return { id }; // Nothing to update

            const query = `
                UPDATE ${objectDef.tableName}
                SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND tenant_id = $2
                RETURNING id
            `;
             const { rows } = await pool.query(query, values);
            
            redirect(`/app/${apiName}`);
        } else {
            // INSERT
            const keys = ['tenant_id'];
            const values = [tenantId];
            let placeholders = ['$1'];
            let argIndex = 2;

            for (const [key, value] of Object.entries(standardData)) {
                keys.push(`"${key}"`);
                values.push(value);
                placeholders.push(`$${argIndex++}`);
            }

            if (hasCustomData || customFields.length > 0) {
                keys.push('custom_data');
                values.push(JSON.stringify(customData));
                placeholders.push(`$${argIndex++}`);
            }

            const query = `
                INSERT INTO ${objectDef.tableName} (${keys.join(', ')})
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
        SELECT * FROM metadata_objects 
        WHERE tenant_id = $1 OR tenant_id IS NULL
        ORDER BY name ASC
    `, [tenantId]);
    return rows;
}

/**
 * Creates a new custom field for an object
 */
export async function createCustomField(objectId: string, fieldData: any) {
    const { tenantId } = await requireAuth();
    
    // Ensure the object belongs to the tenant or is a system object
    const { rows: objRows } = await pool.query(`
        SELECT id FROM metadata_objects WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
    `, [objectId, tenantId]);

    if (objRows.length === 0) throw new Error("Object not found or unauthorized");

    const query = `
        INSERT INTO metadata_fields (object_id, label, api_name, data_type, is_custom, is_required, picklist_options)
        VALUES ($1, $2, $3, $4, true, $5, $6)
        RETURNING *
    `;
    const values = [
        objectId,
        fieldData.label,
        fieldData.apiName,
        fieldData.dataType,
        fieldData.isRequired || false,
        fieldData.picklistOptions ? JSON.stringify(fieldData.picklistOptions) : null
    ];

    const { rows } = await pool.query(query, values);
    
    // Invalidate the cache when a new field is added
    revalidateTag('metadata');
    
    return rows[0];
}

/**
 * Fetches object and fields by its UUID
 */
export async function getObjectMetadataById(objectId: string) {
    const { tenantId } = await requireAuth();

    const { rows: objRows } = await pool.query(`
        SELECT * FROM metadata_objects 
        WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
    `, [objectId, tenantId]);

    if (objRows.length === 0) throw new Error("Object not found");

    const objectDef = objRows[0];

    const { rows: fieldRows } = await pool.query(`
        SELECT * FROM metadata_fields 
        WHERE object_id = $1 
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
            picklistOptions: row.picklist_options
        } as MetadataField))
    };
}
