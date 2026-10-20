import { NextResponse } from 'next/server';
import { pool, sql, identifier } from '@/lib/db';
import { requireApiPermission } from '@/lib/auth/api';
import { readTenantScopedJson, stripTenantFields } from '@/lib/tenant/isolation';
import {
  assertSafeMetadataIdentifier,
  eavValueColumnForType,
  evaluateMetadataFormula,
  validateMetadataRecordPayload,
  type MetadataDataType,
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
  return sql<{ id: string; tableName: string; isCustom: boolean }>`
    SELECT id,
           table_name AS "tableName",
           COALESCE(is_custom, false) AS "isCustom"
    FROM metadata_objects
    WHERE api_name = ${objectName}
      AND status = 'PUBLISHED'
      AND (
        tenant_id = ${tenantId}
        OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
      )
    ORDER BY CASE WHEN tenant_id = ${tenantId} THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1
  `;
}

async function fetchMetadataFields(objectId: string): Promise<RuntimeMetadataFieldWithPermissions[]> {
  return sql<RuntimeMetadataFieldWithPermissions>`
    SELECT f.id,
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
    WHERE f.object_id = ${objectId}
      AND f.status = 'ACTIVE'
    GROUP BY f.id,
             f.label,
             f.api_name,
             f.data_type,
             f.is_required,
             f.picklist_options,
             f.validation_rules,
             f.created_at
    ORDER BY f.created_at ASC
  `;
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

    const objRows = await fetchMetadataObject(objectName, tenantId);

    if (objRows.length === 0) {
      return NextResponse.json({ error: `Object '${objectName}' not found.` }, { status: 404 });
    }
    const objectDef = objRows[0];
    const objectId = objectDef.id;
    const readableFields = filterReadableMetadataFields(
      await fetchMetadataFields(objectId),
      auth.context.role,
    );

    const clientFields = readableFields.map(({ permissions: _permissions, ...rest }) => rest);

    if (readableFields.length === 0) {
      return NextResponse.json({ data: [], fields: [] });
    }

    const isEavStorage = objectDef.isCustom || !objectDef.tableName || objectDef.tableName === 'metadata_records';
    let data: Record<string, unknown>[] = [];

    if (isEavStorage) {
      // Fetch all records and their EAV values for this object
      const recordsRows = await sql<{
        record_id: string;
        field_name: string;
        value_string: string | null;
        value_number: string | null;
        value_boolean: boolean | null;
        value_date: string | null;
      }>`
        SELECT r.id as record_id, f.api_name as field_name, v.value_string, v.value_number, v.value_boolean, v.value_date
        FROM metadata_records r
        JOIN metadata_values v ON v.record_id = r.id
        JOIN metadata_fields f ON v.field_id = f.id
        WHERE r.object_id = ${objectId}
          AND r.tenant_id = ${tenantId}
          AND f.status = 'ACTIVE'
          AND f.id = ANY(${readableFields.map((field) => field.id)}::uuid[])
      `;

      // Group EAV rows into clean JSON objects
      const dataMap = new Map<string, Record<string, unknown>>();
      recordsRows.forEach((row) => {
        if (!dataMap.has(row.record_id)) {
          dataMap.set(row.record_id, { id: row.record_id });
        }
        const record = dataMap.get(row.record_id)!;
        const value = row.value_string ?? row.value_number ?? row.value_boolean ?? row.value_date;
        record[row.field_name] = value;
      });
      data = Array.from(dataMap.values());
    } else {
      const tableIdent = identifier(objectDef.tableName);
      const rawRows = await sql<Record<string, unknown>>`
        SELECT *
        FROM ${tableIdent}
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
        LIMIT 200
      `;
      data = rawRows.map((row) => {
        const projected: Record<string, unknown> = { id: row.id };
        const customBag =
          row.custom_data && typeof row.custom_data === 'object'
            ? (row.custom_data as Record<string, unknown>)
            : {};
        for (const field of readableFields) {
          if (Object.prototype.hasOwnProperty.call(row, field.apiName)) {
            projected[field.apiName] = row[field.apiName];
          } else if (Object.prototype.hasOwnProperty.call(customBag, field.apiName)) {
            projected[field.apiName] = customBag[field.apiName];
          }
        }
        return projected;
      });
    }

    // Evaluate virtual FORMULA fields across all projected records
    const formulaFields = readableFields.filter(
      (f) => f.validationRules?.fieldSubType === 'FORMULA' && f.validationRules?.formulaExpression,
    );
    if (formulaFields.length > 0) {
      for (const record of data) {
        for (const formulaField of formulaFields) {
          record[formulaField.apiName] = evaluateMetadataFormula(
            formulaField.validationRules!.formulaExpression!,
            record,
          );
        }
      }
    }

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

    return NextResponse.json({ data, fields: clientFields });
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

    const objRows = await fetchMetadataObject(objectName, tenantId);

    if (objRows.length === 0) {
      return NextResponse.json({ error: `Object '${objectName}' not found.` }, { status: 404 });
    }
    const objectId = objRows[0].id;

    const allFields = await fetchMetadataFields(objectId);
    const fields = allFields.filter((f) => f.validationRules?.fieldSubType !== 'FORMULA');
    const sanitizedBody: Record<string, unknown> = { ...body };
    for (const f of allFields) {
      if (f.validationRules?.fieldSubType === 'FORMULA') {
        delete sanitizedBody[f.apiName];
      }
    }

    const writeAccess = checkWritableMetadataPayload(fields, auth.context.role, sanitizedBody);
    if (writeAccess.ok === false) {
      return NextResponse.json({
        error: 'Forbidden',
        details: {
          deniedFields: writeAccess.deniedFields,
          blockedRequiredFields: writeAccess.blockedRequiredFields,
        },
      }, { status: 403 });
    }

    const validated = validateMetadataRecordPayload(fields, sanitizedBody, { requireAll: true });
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
