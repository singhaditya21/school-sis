import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson, stripTenantFields } from '@/lib/tenant/isolation';
import {
  assertSafeMetadataIdentifier,
  eavValueColumnForType,
  validateMetadataRecordPayload,
  type MetadataDataType,
  type RuntimeMetadataField,
} from '@/lib/metadata/platform';

type RouteContext = {
  params: Promise<{ object_name: string }>;
};

/**
 * Core Data Router for the No-Code Engine.
 * Dynamically handles CRUD operations for any custom object (e.g. /api/data/hostel_assignments)
 */
export async function GET(
  req: Request,
  { params }: RouteContext
) {
  try {
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    const { object_name: objectName } = await params;
    const tenantId = auth.context.tenantId;
    assertSafeMetadataIdentifier(objectName, 'object API name');

    // 1. Validate the object exists for this tenant
    const objRes = await pool.query(
      `SELECT id
       FROM metadata_objects
       WHERE api_name = $1
         AND status = 'PUBLISHED'
         AND (
           tenant_id = $2
           OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
         )
       ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END, created_at DESC
       LIMIT 1`,
      [objectName, tenantId]
    );

    if (objRes.rowCount === 0) {
      return NextResponse.json({ error: `Object '${objectName}' not found.` }, { status: 404 });
    }
    const objectId = objRes.rows[0].id;

    // 2. Fetch all records and their EAV values for this object
    const recordsRes = await pool.query(
      `SELECT r.id as record_id, f.api_name as field_name, v.value_string, v.value_number, v.value_boolean, v.value_date
       FROM metadata_records r
       JOIN metadata_values v ON v.record_id = r.id
       JOIN metadata_fields f ON v.field_id = f.id
       WHERE r.object_id = $1
         AND r.tenant_id = $2
         AND f.status = 'ACTIVE'`,
      [objectId, tenantId]
    );

    // Group EAV rows into clean JSON objects
    const dataMap = new Map();
    recordsRes.rows.forEach((row: {
      record_id: string;
      field_name: string;
      value_string: string | null;
      value_number: string | null;
      value_boolean: boolean | null;
      value_date: string | null;
    }) => {
      if (!dataMap.has(row.record_id)) {
        dataMap.set(row.record_id, { id: row.record_id });
      }
      const record = dataMap.get(row.record_id);
      // Coalesce the EAV value based on what is not null
      const value = row.value_string ?? row.value_number ?? row.value_boolean ?? row.value_date;
      record[row.field_name] = value;
    });

    return NextResponse.json({ data: Array.from(dataMap.values()) });
  } catch (error) {
    console.error('Dynamic Data GET Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: RouteContext
) {
  try {
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    const { object_name: objectName } = await params;
    const tenantId = auth.context.tenantId;
    assertSafeMetadataIdentifier(objectName, 'object API name');
    const json = await readTenantScopedJson<Record<string, unknown>>(req, tenantId);
    if (json.ok === false) return json.response;
    const body = stripTenantFields(json.data);

    // 1. Validate object
    const objRes = await pool.query(
      `SELECT id
       FROM metadata_objects
       WHERE api_name = $1
         AND status = 'PUBLISHED'
         AND (
           tenant_id = $2
           OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
         )
       ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END, created_at DESC
       LIMIT 1`,
      [objectName, tenantId]
    );

    if (objRes.rowCount === 0) {
      return NextResponse.json({ error: `Object '${objectName}' not found.` }, { status: 404 });
    }
    const objectId = objRes.rows[0].id;

    const { rows: fieldRows } = await pool.query(
      `SELECT id,
              label,
              api_name as "apiName",
              data_type as "dataType",
              is_required as "isRequired",
              picklist_options as "picklistOptions",
              validation_rules as "validationRules"
       FROM metadata_fields
       WHERE object_id = $1
         AND status = 'ACTIVE'
       ORDER BY created_at ASC`,
      [objectId],
    );
    const fields = fieldRows as RuntimeMetadataField[];
    const validated = validateMetadataRecordPayload(fields, body, { requireAll: true });
    if (validated.ok === false) {
      return NextResponse.json({ error: 'Validation failed', details: validated.errors }, { status: 400 });
    }
    const fieldByApiName = new Map(fields.map((field) => [field.apiName, field]));

    // 2. Begin Transaction to insert Record + Values
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create the record wrapper
      const recordRes = await client.query(
        `INSERT INTO metadata_records (id, tenant_id, object_id, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, NOW(), NOW()) RETURNING id`,
        [tenantId, objectId]
      );
      const recordId = recordRes.rows[0].id;

      // Insert EAV values for each key in the JSON body
      for (const [key, value] of Object.entries(validated.data)) {
        if (value == null) continue;
        const field = fieldByApiName.get(key);
        if (!field) continue;
        const valCol = eavValueColumnForType(field.dataType as MetadataDataType);

        await client.query(
          `INSERT INTO metadata_values (id, record_id, field_id, ${valCol}) 
           VALUES (gen_random_uuid(), $1, $2, $3)`,
          [recordId, field.id, value]
        );
      }

      await client.query('COMMIT');
      return NextResponse.json({ success: true, recordId }, { status: 201 });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Dynamic Data POST Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
