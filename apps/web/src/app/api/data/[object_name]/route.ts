import { NextResponse } from 'next/server';
import { runWithTenantContext, sql, sqlFor, withTenant, identifier } from '@/lib/db';
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
  canWriteMetadataField,
  checkWritableMetadataPayload,
  filterReadableMetadataFields,
  isProtectedLedgerOrIdentityTable,
  isProtectedLegacyPlaintextColumn,
  type RuntimeMetadataFieldWithPermissions,
} from '@/lib/metadata/access-control';
import { logAudit } from '@/lib/audit';
import { logger } from '@/lib/observability/logger';

type RouteContext = {
  params: Promise<{ object_name: string }>;
};

type ApiMetadataField = RuntimeMetadataFieldWithPermissions & {
  isCustom?: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

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

async function fetchMetadataFields(objectId: string): Promise<ApiMetadataField[]> {
  return sql<ApiMetadataField>`
    SELECT f.id,
           f.label,
           f.api_name as "apiName",
           f.data_type as "dataType",
           COALESCE(f.is_custom, false) as "isCustom",
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
             f.is_custom,
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

    const searchParams = new URL(req.url).searchParams;
    const limit = clampInt(searchParams.get('limit'), 100, 1, 200);
    const offset = clampInt(searchParams.get('offset'), 0, 0, 10_000);

    return await runWithTenantContext(tenantId, async () => {
      const objRows = await fetchMetadataObject(objectName, tenantId);

      if (objRows.length === 0) {
        return NextResponse.json({ error: `Object '${objectName}' not found.` }, { status: 404 });
      }
      const objectDef = objRows[0];
      if (objectDef.tableName === 'platform_audit_logs') {
        return NextResponse.json(
          { error: `Object '${objectName}' cannot be queried via generic metadata API.` },
          { status: 403 },
        );
      }
      const objectId = objectDef.id;
      const isEavStorage =
        objectDef.isCustom || !objectDef.tableName || objectDef.tableName === 'metadata_records';
      const candidateFields = (await fetchMetadataFields(objectId)).filter(
        (field) =>
          isEavStorage || Boolean(field.isCustom) || !isProtectedLegacyPlaintextColumn(field.apiName),
      );
      const readableFields = filterReadableMetadataFields(
        candidateFields,
        auth.context.role,
      ) as ApiMetadataField[];

      const clientFields = readableFields.map(({ permissions: _permissions, ...rest }) => rest);

      if (readableFields.length === 0) {
        return NextResponse.json({ data: [], fields: [], pagination: { limit, offset } });
      }

      let data: Record<string, unknown>[] = [];

      if (isEavStorage) {
        // Fetch bounded page of records and their EAV values for this object
        const recordsRows = await sql<{
          record_id: string;
          field_name: string | null;
          value_string: string | null;
          value_number: string | null;
          value_boolean: boolean | null;
          value_date: string | null;
        }>`
          WITH page AS (
            SELECT r.id, r.created_at
            FROM metadata_records r
            WHERE r.object_id = ${objectId}
              AND r.tenant_id = ${tenantId}
            ORDER BY r.created_at DESC, r.id
            LIMIT ${limit} OFFSET ${offset}
          )
          SELECT p.id as record_id,
                 f.api_name as field_name,
                 v.value_string,
                 v.value_number,
                 v.value_boolean,
                 v.value_date
          FROM page p
          LEFT JOIN metadata_values v ON v.record_id = p.id
          LEFT JOIN metadata_fields f
                 ON v.field_id = f.id
                AND f.status = 'ACTIVE'
                AND f.id = ANY(${readableFields.map((field) => field.id)}::uuid[])
          ORDER BY p.created_at DESC, p.id
        `;

        // Group EAV rows into clean JSON objects
        const dataMap = new Map<string, Record<string, unknown>>();
        recordsRows.forEach((row) => {
          if (!dataMap.has(row.record_id)) {
            dataMap.set(row.record_id, { id: row.record_id });
          }
          if (row.field_name) {
            const record = dataMap.get(row.record_id)!;
            const value =
              row.value_string ?? row.value_number ?? row.value_boolean ?? row.value_date;
            record[row.field_name] = value;
          }
        });
        data = Array.from(dataMap.values());
      } else {
        const tableIdent = identifier(objectDef.tableName);
        const rawRows = await sql<Record<string, unknown>>`
          SELECT *
          FROM ${tableIdent}
          WHERE tenant_id = ${tenantId}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
        data = rawRows.map((row) => {
          const projected: Record<string, unknown> = { id: row.id };
          const customBag =
            row.custom_data && typeof row.custom_data === 'object'
              ? (row.custom_data as Record<string, unknown>)
              : {};
          for (const field of readableFields) {
            if (!field.isCustom && isProtectedLegacyPlaintextColumn(field.apiName)) {
              continue;
            }
            if (!field.isCustom && Object.prototype.hasOwnProperty.call(row, field.apiName)) {
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
          limit,
          offset,
          readableFields: readableFields.map((field) => field.apiName),
        },
      });

      return NextResponse.json({ data, fields: clientFields, pagination: { limit, offset } });
    });
  } catch (error) {
    logger.error('metadata_api.get_failed', 'Dynamic Data GET Error', {
      metadata: { error: error instanceof Error ? error.message : String(error) },
    });
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

    return await runWithTenantContext(tenantId, async () => {
      const objRows = await fetchMetadataObject(objectName, tenantId);

      if (objRows.length === 0) {
        return NextResponse.json({ error: `Object '${objectName}' not found.` }, { status: 404 });
      }
      const objectDef = objRows[0];
      if (isProtectedLedgerOrIdentityTable(objectDef.tableName)) {
        return NextResponse.json(
          {
            error: `Direct record creation on protected ledger/identity table '${objectDef.tableName}' is blocked. Use governed finance or IAM workflows.`,
          },
          { status: 403 },
        );
      }
      const isEavStorage =
        objectDef.isCustom || !objectDef.tableName || objectDef.tableName === 'metadata_records';
      if (!isEavStorage) {
        return NextResponse.json(
          {
            error: `Object '${objectName}' is backed by a standard domain table and must be created via its domain API.`,
          },
          { status: 400 },
        );
      }

      const objectId = objectDef.id;
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

      const recordId = await withTenant(tenantId, async (tx) => {
        const q = sqlFor(tx);
        const recordRows = await q<{ id: string }>`
          INSERT INTO metadata_records (id, tenant_id, object_id, created_at, updated_at)
          VALUES (gen_random_uuid(), ${tenantId}, ${objectId}, NOW(), NOW())
          RETURNING id
        `;
        const createdId = recordRows[0].id;

        for (const [key, value] of Object.entries(validated.data)) {
          if (value == null) continue;
          const field = fieldByApiName.get(key);
          if (!field) continue;
          const valCol = identifier(eavValueColumnForType(field.dataType as MetadataDataType));

          await q`
            INSERT INTO metadata_values (id, record_id, field_id, ${valCol})
            VALUES (gen_random_uuid(), ${createdId}, ${field.id}, ${value})
          `.execute();
        }

        return createdId;
      });

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
    });
  } catch (error) {
    logger.error('metadata_api.post_failed', 'Dynamic Data POST Error', {
      metadata: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

async function handleUpdateRequest(
  req: Request,
  { params }: RouteContext,
  preverifiedAuth?: Extract<Awaited<ReturnType<typeof requireApiPermission>>, { ok: true }>,
) {
  try {
    const auth = preverifiedAuth ?? (await requireApiPermission('metadata:write'));
    if (auth.ok === false) return auth.response;

    const { object_name: objectName } = await params;
    const tenantId = auth.context.tenantId;
    assertSafeMetadataIdentifier(objectName, 'object API name');

    const json = await readTenantScopedJson<Record<string, unknown>>(req, tenantId);
    if (json.ok === false) return json.response;
    const body = stripTenantFields(json.data);

    const searchParams = new URL(req.url).searchParams;
    const rawId = searchParams.get('id') || (typeof body.id === 'string' ? body.id : '');
    if (!UUID_RE.test(rawId)) {
      return NextResponse.json({ error: 'Valid record id (UUID) is required.' }, { status: 400 });
    }
    const recordId = rawId;

    return await runWithTenantContext(tenantId, async () => {
      const objRows = await fetchMetadataObject(objectName, tenantId);
      if (objRows.length === 0) {
        return NextResponse.json({ error: `Object '${objectName}' not found.` }, { status: 404 });
      }
      const objectDef = objRows[0];
      const isEavStorage =
        objectDef.isCustom || !objectDef.tableName || objectDef.tableName === 'metadata_records';
      const allFields = await fetchMetadataFields(objectDef.id);
      const nonVirtualFields = allFields.filter(
        (f) =>
          f.validationRules?.fieldSubType !== 'FORMULA' &&
          f.validationRules?.fieldSubType !== 'ROLLUP_SUMMARY',
      );

      const sanitizedBody: Record<string, unknown> = { ...body };
      delete sanitizedBody.id;
      for (const f of allFields) {
        if (
          f.validationRules?.fieldSubType === 'FORMULA' ||
          f.validationRules?.fieldSubType === 'ROLLUP_SUMMARY'
        ) {
          delete sanitizedBody[f.apiName];
        }
      }

      if (!isEavStorage) {
        for (const key of Object.keys(sanitizedBody)) {
          if (isProtectedLegacyPlaintextColumn(key)) {
            return NextResponse.json(
              {
                error: `Direct writes to protected legacy plaintext column '${key}' are blocked.`,
              },
              { status: 403 },
            );
          }
        }

        const customFields = nonVirtualFields.filter((f) => Boolean(f.isCustom));
        const customFieldMap = new Map(customFields.map((f) => [f.apiName, f]));
        const disallowedStandardKeys = Object.keys(sanitizedBody).filter(
          (key) => !customFieldMap.has(key),
        );

        if (disallowedStandardKeys.length > 0) {
          if (isProtectedLedgerOrIdentityTable(objectDef.tableName)) {
            return NextResponse.json(
              {
                error: `Direct standard-column updates on protected ledger/identity table '${objectDef.tableName}' are blocked (${disallowedStandardKeys.join(', ')}). Only custom_data fields may be updated, or use governed finance/IAM workflows.`,
              },
              { status: 403 },
            );
          }
          return NextResponse.json(
            {
              error: `Direct standard-column updates on '${objectDef.tableName}' must go through its domain API; only custom_data fields may be updated here.`,
            },
            { status: 403 },
          );
        }

        if (objectDef.tableName === 'audit_logs' || objectDef.tableName === 'platform_audit_logs') {
          return NextResponse.json(
            { error: `Audit log table '${objectDef.tableName}' is append-only and immutable.` },
            { status: 403 },
          );
        }

        const writeAccess = checkWritableMetadataPayload(
          customFields,
          auth.context.role,
          sanitizedBody,
        );
        if (writeAccess.ok === false) {
          return NextResponse.json(
            {
              error: 'Forbidden',
              details: {
                deniedFields: writeAccess.deniedFields,
                blockedRequiredFields: writeAccess.blockedRequiredFields,
              },
            },
            { status: 403 },
          );
        }

        const validated = validateMetadataRecordPayload(customFields, sanitizedBody, {
          requireAll: false,
        });
        if (validated.ok === false) {
          return NextResponse.json(
            { error: 'Validation failed', details: validated.errors },
            { status: 400 },
          );
        }

        const tableIdent = identifier(objectDef.tableName);
        const updatedRows = await sql<{ id: string }>`
          UPDATE ${tableIdent}
          SET custom_data = COALESCE(custom_data, '{}'::jsonb) || ${JSON.stringify(validated.data)}::jsonb,
              updated_at = NOW()
          WHERE id = ${recordId}
            AND tenant_id = ${tenantId}
          RETURNING id
        `;
        if (updatedRows.length === 0) {
          return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
        }

        await logAudit({
          tenantId,
          userId: auth.context.userId,
          action: 'UPDATE',
          entityType: objectName,
          entityId: recordId,
          description: `Updated custom_data fields on '${objectName}'`,
          afterState: { fields: Object.keys(validated.data) },
        });

        return NextResponse.json({ success: true, recordId });
      }

      const writeAccess = checkWritableMetadataPayload(
        nonVirtualFields,
        auth.context.role,
        sanitizedBody,
      );
      if (writeAccess.ok === false) {
        return NextResponse.json(
          {
            error: 'Forbidden',
            details: {
              deniedFields: writeAccess.deniedFields,
              blockedRequiredFields: writeAccess.blockedRequiredFields,
            },
          },
          { status: 403 },
        );
      }

      const validated = validateMetadataRecordPayload(nonVirtualFields, sanitizedBody, {
        requireAll: false,
      });
      if (validated.ok === false) {
        return NextResponse.json(
          { error: 'Validation failed', details: validated.errors },
          { status: 400 },
        );
      }

      const fieldByApiName = new Map(nonVirtualFields.map((field) => [field.apiName, field]));
      const found = await withTenant(tenantId, async (tx) => {
        const q = sqlFor(tx);
        const existing = await q<{ id: string }>`
          SELECT id
          FROM metadata_records
          WHERE id = ${recordId}
            AND tenant_id = ${tenantId}
            AND object_id = ${objectDef.id}
          FOR UPDATE
        `;
        if (existing.length === 0) return false;

        for (const [key, value] of Object.entries(validated.data)) {
          const field = fieldByApiName.get(key);
          if (!field) continue;
          const valCol = identifier(eavValueColumnForType(field.dataType as MetadataDataType));
          await q`
            DELETE FROM metadata_values
            WHERE record_id = ${recordId}
              AND field_id = ${field.id}
          `.execute();
          if (value != null) {
            await q`
              INSERT INTO metadata_values (id, record_id, field_id, ${valCol})
              VALUES (gen_random_uuid(), ${recordId}, ${field.id}, ${value})
            `.execute();
          }
        }

        await q`
          UPDATE metadata_records
          SET updated_at = NOW()
          WHERE id = ${recordId}
            AND tenant_id = ${tenantId}
        `.execute();

        return true;
      });

      if (!found) {
        return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
      }

      await logAudit({
        tenantId,
        userId: auth.context.userId,
        action: 'UPDATE',
        entityType: objectName,
        entityId: recordId,
        description: `Updated record in object '${objectName}'`,
        afterState: { fields: Object.keys(validated.data) },
      });

      return NextResponse.json({ success: true, recordId });
    });
  } catch (error) {
    logger.error('metadata_api.update_failed', 'Dynamic Data UPDATE Error', {
      metadata: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: RouteContext) {
  const auth = await requireApiPermission('metadata:write');
  if (auth.ok === false) return auth.response;
  return handleUpdateRequest(req, ctx, auth);
}

export async function PATCH(req: Request, ctx: RouteContext) {
  const auth = await requireApiPermission('metadata:write');
  if (auth.ok === false) return auth.response;
  return handleUpdateRequest(req, ctx, auth);
}

export async function DELETE(
  req: Request,
  { params }: RouteContext,
) {
  try {
    const auth = await requireApiPermission('metadata:delete');
    if (auth.ok === false) return auth.response;

    const { object_name: objectName } = await params;
    const tenantId = auth.context.tenantId;
    assertSafeMetadataIdentifier(objectName, 'object API name');

    return await runWithTenantContext(tenantId, async () => {
      const objRows = await fetchMetadataObject(objectName, tenantId);
      if (objRows.length === 0) {
        return NextResponse.json({ error: `Object '${objectName}' not found.` }, { status: 404 });
      }
      const objectDef = objRows[0];
      if (isProtectedLedgerOrIdentityTable(objectDef.tableName)) {
        return NextResponse.json(
          {
            error: `Record deletion on protected ledger/identity table '${objectDef.tableName}' is blocked. Use governed finance or IAM workflows.`,
          },
          { status: 403 },
        );
      }

      const isEavStorage =
        objectDef.isCustom || !objectDef.tableName || objectDef.tableName === 'metadata_records';
      if (!isEavStorage) {
        return NextResponse.json(
          {
            error: `Standard domain records on '${objectDef.tableName}' cannot be deleted via generic metadata API; use the domain lifecycle workflow.`,
          },
          { status: 403 },
        );
      }

      const searchParams = new URL(req.url).searchParams;
      let recordId = searchParams.get('id') || '';
      if (!recordId) {
        try {
          const json = await readTenantScopedJson<Record<string, unknown>>(req, tenantId);
          if (json.ok && typeof json.data.id === 'string') {
            recordId = json.data.id;
          }
        } catch {
          // No body provided
        }
      }
      if (!UUID_RE.test(recordId)) {
        return NextResponse.json({ error: 'Valid record id (UUID) is required.' }, { status: 400 });
      }

      const fields = await fetchMetadataFields(objectDef.id);
      const writableFields = fields.filter((f) => canWriteMetadataField(auth.context.role, f));
      if (writableFields.length === 0) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const deleted = await withTenant(tenantId, async (tx) => {
        const q = sqlFor(tx);
        await q`
          DELETE FROM metadata_values
          WHERE record_id = ${recordId}
            AND record_id IN (
              SELECT id
              FROM metadata_records
              WHERE id = ${recordId}
                AND object_id = ${objectDef.id}
                AND tenant_id = ${tenantId}
            )
        `.execute();
        const removedRows = await q<{ id: string }>`
          DELETE FROM metadata_records
          WHERE id = ${recordId}
            AND object_id = ${objectDef.id}
            AND tenant_id = ${tenantId}
          RETURNING id
        `;
        return removedRows.length > 0;
      });

      if (!deleted) {
        return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
      }

      await logAudit({
        tenantId,
        userId: auth.context.userId,
        action: 'DELETE',
        entityType: objectName,
        entityId: recordId,
        description: `Deleted record in object '${objectName}'`,
        afterState: { deletedRecordId: recordId },
      });

      return NextResponse.json({ success: true, recordId });
    });
  } catch (error) {
    logger.error('metadata_api.delete_failed', 'Dynamic Data DELETE Error', {
      metadata: { error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
