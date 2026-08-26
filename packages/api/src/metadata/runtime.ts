/**
 * Metadata runtime — storage-agnostic helpers for the low-code (metadata) engine.
 *
 * Pure functions only: no database handle, no framework imports, no I/O. Every
 * SQL statement that uses these helpers still lives in the caller, so the caller
 * keeps ownership of tenant scoping. The helpers exist so that the two storage
 * modes the engine supports can be reasoned about (and unit tested) in one place
 * instead of being re-derived per module.
 *
 * ## The two storage modes
 *
 * `TABLE`  — the metadata object is a *projection* over a hand-built physical
 *            table (`students`, `staff_profiles`, `invoices`, ...). Standard
 *            fields map to real columns; custom fields live in that table's
 *            `custom_data` JSONB column. This is what the engine has always
 *            done, and it only works for tables somebody already wrote a
 *            migration for.
 *
 * `EAV`    — the metadata object is *tenant-defined* and has no physical table
 *            at all. Rows live in `metadata_records` (which carries
 *            `tenant_id`) and cell values live in `metadata_values`.
 *
 * ## Tenant scoping note (important)
 *
 * `metadata_values` has NO `tenant_id` of its own. It can only ever be reached
 * through `metadata_values.record_id -> metadata_records.id`, and
 * `metadata_records` is the tenant-owning parent. Every helper here that shapes
 * an EAV read or write assumes the caller has already constrained the record set
 * to `metadata_records.tenant_id = <session tenant>`; nothing in this file can
 * enforce that on its own.
 */

export type MetadataStorageMode = "TABLE" | "EAV";

/**
 * Tenant-defined objects are stored in the shared EAV tables, so their
 * `metadata_objects.table_name` is this sentinel rather than a real table.
 */
export const METADATA_EAV_TABLE_NAME = "metadata_records";

export type MetadataStorageDescriptor = {
  tableName?: string | null;
};

export function resolveMetadataStorageMode(
  objectDef: MetadataStorageDescriptor,
): MetadataStorageMode {
  return objectDef?.tableName === METADATA_EAV_TABLE_NAME ? "EAV" : "TABLE";
}

export function isEavMetadataObject(objectDef: MetadataStorageDescriptor): boolean {
  return resolveMetadataStorageMode(objectDef) === "EAV";
}

export type MetadataEavColumn =
  | "value_string"
  | "value_number"
  | "value_boolean"
  | "value_date";

export const METADATA_EAV_COLUMNS: readonly MetadataEavColumn[] = [
  "value_string",
  "value_number",
  "value_boolean",
  "value_date",
];

/**
 * Which typed column of `metadata_values` backs a given field data type.
 * Money (`CURRENCY`) is a numeric in RUPEES, exactly like the hand-built
 * modules' `numeric(12,2)` columns — never scaled by 100.
 */
export function metadataEavColumnForType(dataType: string): MetadataEavColumn {
  const normalized = String(dataType || "").toUpperCase();
  if (normalized === "NUMBER" || normalized === "CURRENCY") return "value_number";
  if (normalized === "BOOLEAN") return "value_boolean";
  if (normalized === "DATE") return "value_date";
  return "value_string";
}

/**
 * The value columns to blank when writing `target`. The target itself is
 * excluded: a single UPDATE cannot assign the same column twice.
 */
export function metadataEavResetColumns(
  target: MetadataEavColumn,
): MetadataEavColumn[] {
  return METADATA_EAV_COLUMNS.filter((column) => column !== target);
}

export type MetadataEavJoinRow = {
  record_id: string;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  field_api_name?: string | null;
  data_type?: string | null;
  value_string?: string | null;
  value_number?: string | number | null;
  value_boolean?: boolean | null;
  value_date?: Date | string | null;
};

export type MetadataProjectedRecord = Record<string, unknown> & { id: string };

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    // node-pg parses a `date` column into a Date at LOCAL midnight. Reading it
    // back through toISOString() would shift the day west of UTC, so read the
    // local calendar fields instead.
    const year = String(value.getFullYear()).padStart(4, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

/**
 * Reads one EAV cell out of a joined row, using the field's declared data type
 * rather than a `??` chain across the four value columns. A `??` chain silently
 * returns the wrong column when a field's type has been changed and a stale
 * value is still parked in the old column.
 */
export function readMetadataEavCell(row: MetadataEavJoinRow): unknown {
  const column = metadataEavColumnForType(row.data_type ?? "TEXT");
  switch (column) {
    case "value_number": {
      const raw = row.value_number;
      // pg returns `numeric` as a string; keep it as a string so rupee amounts
      // never round-trip through a float.
      return raw == null ? null : String(raw);
    }
    case "value_boolean":
      return row.value_boolean ?? null;
    case "value_date":
      return toIsoDate(row.value_date);
    default:
      return row.value_string ?? null;
  }
}

/**
 * Collapses the `records LEFT JOIN values LEFT JOIN fields` result set into one
 * flat object per record, in the row order the query produced.
 *
 * Rows whose `field_api_name` is null are kept as bare records: that is how a
 * record with no values yet — or a record whose only values are on fields the
 * caller may not read — still shows up in a list instead of vanishing.
 */
export function projectMetadataEavRows(
  rows: readonly MetadataEavJoinRow[],
): MetadataProjectedRecord[] {
  const byRecord = new Map<string, MetadataProjectedRecord>();

  for (const row of rows) {
    let record = byRecord.get(row.record_id);
    if (!record) {
      record = {
        id: row.record_id,
        created_at: toIsoDate(row.created_at),
        updated_at: toIsoDate(row.updated_at),
      };
      byRecord.set(row.record_id, record);
    }
    if (!row.field_api_name) continue;
    record[row.field_api_name] = readMetadataEavCell(row);
  }

  return Array.from(byRecord.values());
}

export type MetadataEavAssignment = {
  fieldId: string;
  apiName: string;
  column: MetadataEavColumn;
  value: unknown;
};

export type MetadataAssignableField = {
  id: string;
  apiName: string;
  dataType: string;
};

/**
 * Turns an already-validated payload into one write instruction per field that
 * the payload actually mentions. Fields absent from the payload are left alone,
 * so a partial edit does not blank out cells the form never rendered.
 */
export function buildMetadataEavAssignments(
  fields: readonly MetadataAssignableField[],
  validatedData: Record<string, unknown>,
): MetadataEavAssignment[] {
  const assignments: MetadataEavAssignment[] = [];

  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(validatedData, field.apiName)) continue;
    assignments.push({
      fieldId: field.id,
      apiName: field.apiName,
      column: metadataEavColumnForType(field.dataType),
      value: validatedData[field.apiName] ?? null,
    });
  }

  return assignments;
}

/**
 * Drops payload keys that are not live fields of this object before validation.
 * Client forms echo back whatever was in `defaultValues` (`id`, `created_at`,
 * ...), and the validator treats an unrecognised key as a hard error.
 */
export function pickKnownMetadataFields(
  fields: readonly { apiName: string }[],
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const known = new Set(fields.map((field) => field.apiName));
  const picked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (known.has(key)) picked[key] = value;
  }
  return picked;
}

/**
 * The table name a newly defined tenant object is registered under. Kept as a
 * function so callers do not hard-code the sentinel.
 */
export function metadataTableNameForNewObject(): string {
  return METADATA_EAV_TABLE_NAME;
}
