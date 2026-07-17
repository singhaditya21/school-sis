import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedJson, stripTenantFields } from '@/lib/tenant/isolation';
import {
  assertSafeMetadataIdentifier,
  eavValueColumnForType,
  validateMetadataRecordPayload,
  type MetadataDataType,
  type RuntimeMetadataField,
} from '@/lib/metadata/platform';
import {
  checkWritableMetadataPayload,
  filterReadableMetadataFields,
  type RuntimeMetadataFieldWithPermissions,
} from '@/lib/metadata/access-control';
import { logAudit } from '@/lib/audit';

type RouteContext = {
  params: Promise<{ object_name: string }>;
};

async function fetchMetadataObject(objectName: string, tenantId: string) {
  return pool.query<{ id: string }>(
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
    [objectName, tenantId],
  );
}

async function fetchMetadataFields(objectId: string): Promise<RuntimeMetadataFieldWithPermissions[]> {
  const { rows } = await pool.query(
    `SELECT f.id,
            f.label,
            f.api_name as "apiName",
            f.data_type as "dataType",
            f.is_required as "isRequired",
            f.picklist_options as "picklistOptions",
            f.validation_rules as "validationRules",
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
     WHERE f.object_id = $1
       AND f.status = 'ACTIVE'
     GROUP BY f.id,
              f.label,
              f.api_name,
              f.data_type,
              f.is_required,
              f.picklist_options,
              f.validation_rules,
              f.created_at
     ORDER BY f.created_at ASC`,
    [objectId],
  );
  return rows as RuntimeMetadataFieldWithPermissions[];
}

/**
 * Core Data Router for the No-Code Engine.
 * Dynamically handles CRUD operations for any custom object (e.g. /api/data/hostel_assignments)
 */
export async function GET(
  req: Request,
  { params }: RouteContext
) {
  try {
    const auth = await requireApiPermission('metadata:read');
    if (auth.ok === false) return auth.response;

    const { object_name: objectName } = await params;
    const tenantId = auth.context.tenantId;
    assertSafeMetadataIdentifier(objectName, 'object API name');

    const objRes = await fetchMetadataObject(objectName, tenantId);

    if (objRes.rowCount === 0) {
      return NextResponse.json({ error: `Object '${objectName}' not found.` }, { status: 404 });
    }
    const objectId = objRes.rows[0].id;
    const readableFields = filterReadableMetadataFields(
      await fetchMetadataFields(objectId),
      auth.context.role,
    );

    if (readableFields.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // 2. Fetch all records and their EAV values for this object
    const recordsRes = await pool.query(
      `SELECT r.id as record_id, f.api_name as field_name, v.value_string, v.value_number, v.value_boolean, v.value_date
       FROM metadata_records r
       JOIN metadata_values v ON v.record_id = r.id
       JOIN metadata_fields f ON v.field_id = f.id
       WHERE r.object_id = $1
         AND r.tenant_id = $2
         AND f.status = 'ACTIVE'
         AND f.id = ANY($3::uuid[])`,
      [objectId, tenantId, readableFields.map((field) => field.id)]
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

    const data = Array.from(dataMap.values());

    // Audit the read: who read which object, how many records, and which fields were exposed.
    await logAudit({
      tenantId,
      userId: auth.context.userId,
      action: 'READ',
      entityType: objectName,
      description: `Read ${data.length} record(s) from object '${objectName}'`,
      afterState: {
        recordCount: data.length,
        readableFields: readableFields.map((field) => field.apiName),
      },
    });

    return NextResponse.json({ data });
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
    const auth = await requireApiPermission('metadata:create');
    if (auth.ok === false) return auth.response;

    const { object_name: objectName } = await params;
    const tenantId = auth.context.tenantId;
    assertSafeMetadataIdentifier(objectName, 'object API name');
    const json = await readTenantScopedJson<Record<string, unknown>>(req, tenantId);
    if (json.ok === false) return json.response;
    const body = stripTenantFields(json.data);

    const objRes = await fetchMetadataObject(objectName, tenantId);

    if (objRes.rowCount === 0) {
      return NextResponse.json({ error: `Object '${objectName}' not found.` }, { status: 404 });
    }
    const objectId = objRes.rows[0].id;

    const fields = await fetchMetadataFields(objectId);
    const writeAccess = checkWritableMetadataPayload(fields, auth.context.role, body);
    if (writeAccess.ok === false) {
      return NextResponse.json({
        error: 'Forbidden',
        details: {
          deniedFields: writeAccess.deniedFields,
          blockedRequiredFields: writeAccess.blockedRequiredFields,
        },
      }, { status: 403 });
    }

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

      // Audit the write: who created which record in which object, and the fields written.
      await logAudit({
        tenantId,
        userId: auth.context.userId,
        action: 'CREATE',
        entityType: objectName,
        entityId: recordId,
        description: `Created record in object '${objectName}'`,
        afterState: { fields: Object.keys(validated.data) },
      });

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
