/**
 * Generate packages/api/src/db/generated/tables.ts from the MIGRATED database — the
 * raw-Neon-Postgres replacement for Drizzle's typed schema. It reads
 * information_schema + pg_enum against a database carrying the full migration chain
 * and emits, per table:
 *
 *   - a column-reference object (camelCase property -> an `identifier()` fragment
 *     that renders "<table>"."<column>", for SELECT/WHERE/JOIN/ORDER BY),
 *   - a column-name map (camelCase -> snake_case, for building INSERT/UPDATE),
 *   - a Row interface (what a raw pool.query returns for each column), and
 *   - an Insert interface (columns with a default / nullable / identity are optional);
 *
 * plus every enum as a string-literal union and an UPPER_VALUES array.
 *
 * TS types mirror node-pg's DEFAULT parsers (verified): numeric/bigint -> string,
 * integer -> number, timestamptz/timestamp/date -> Date, boolean, uuid/text -> string,
 * jsonb -> unknown, text[] -> string[]. Drizzle's defaults match these, so moving a
 * query off the builder does not silently change a column's runtime type.
 *
 *   pnpm --filter @school-sis/web db:types          # regenerate
 *   pnpm --filter @school-sis/web db:types:check     # verify it is up to date (CI)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { resolveDatabaseConnectionOptions } from "../../../packages/api/src/db/ssl";

const OUT_PATH = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../packages/api/src/db/generated/tables.ts",
);

const connectionString =
    process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
if (!connectionString) {
    console.error("[db:types] Set DIRECT_URL or DATABASE_URL to a MIGRATED database.");
    process.exit(1);
}
const checkOnly = process.argv.includes("--check");

// ─── Naming ──────────────────────────────────────────────────
const toCamel = (snake: string): string =>
    snake.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
const toPascal = (snake: string): string => {
    const camel = toCamel(snake);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
};

// ─── pg type -> TS type (node-pg default parsers) ────────────
const SCALAR: Record<string, string> = {
    uuid: "string",
    text: "string",
    "character varying": "string",
    character: "string",
    citext: "string",
    numeric: "string",
    bigint: "string",
    integer: "number",
    smallint: "number",
    "double precision": "number",
    real: "number",
    boolean: "boolean",
    "timestamp with time zone": "Date",
    "timestamp without time zone": "Date",
    date: "Date",
    time: "string",
    "time without time zone": "string",
    "time with time zone": "string",
    interval: "string",
    inet: "string",
    cidr: "string",
    macaddr: "string",
    bytea: "Buffer",
    json: "unknown",
    jsonb: "unknown",
};
// text[] etc. — element udt (leading underscore stripped) -> TS
const ARRAY_ELEMENT: Record<string, string> = {
    text: "string",
    varchar: "string",
    uuid: "string",
    int4: "number",
    int8: "string",
    numeric: "string",
    bool: "boolean",
    timestamptz: "Date",
    jsonb: "unknown",
};

interface ColumnRow {
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
    is_identity: "YES" | "NO";
}

function tsTypeFor(column: ColumnRow, enumNames: Set<string>): string {
    let base: string;
    if (column.data_type === "USER-DEFINED" && enumNames.has(column.udt_name)) {
        base = toPascal(column.udt_name);
    } else if (column.data_type === "ARRAY") {
        const element = column.udt_name.replace(/^_/, "");
        base = `${ARRAY_ELEMENT[element] ?? "unknown"}[]`;
    } else {
        base = SCALAR[column.data_type] ?? "unknown";
    }
    return column.is_nullable === "YES" ? `${base} | null` : base;
}

/** A column is optional on insert if the database can supply it. */
function optionalOnInsert(column: ColumnRow): boolean {
    return column.column_default !== null || column.is_nullable === "YES" || column.is_identity === "YES";
}

async function main(): Promise<void> {
    const client = new Client({
        ...resolveDatabaseConnectionOptions(connectionString!),
        application_name: "school-sis-db-types-generator",
    });
    await client.connect();

    let output: string;
    try {
        const { rows: enumRows } = await client.query<{ typname: string; labels: string[] }>(
            `SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
             FROM pg_type t
             JOIN pg_enum e ON e.enumtypid = t.oid
             JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = 'public'
             GROUP BY t.typname ORDER BY t.typname`,
        );
        const enumNames = new Set(enumRows.map((r) => r.typname));

        const { rows: tableRows } = await client.query<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
             ORDER BY table_name`,
        );

        const parts: string[] = [];
        parts.push(
            "// AUTO-GENERATED by scripts/generate-db-tables.ts from the migrated schema. Do not edit by hand.",
            "// Regenerate with: pnpm --filter @school-sis/web db:types",
            'import { column, type ColumnRef } from "../sql";',
            "",
            "// ─── Enums ───────────────────────────────────────────────────",
        );
        for (const e of enumRows) {
            const typeName = toPascal(e.typname);
            const constName = e.typname.toUpperCase() + "_VALUES";
            const union = e.labels.map((l) => `"${l}"`).join(" | ");
            parts.push(
                `export type ${typeName} = ${union};`,
                `export const ${constName} = [${e.labels.map((l) => `"${l}"`).join(", ")}] as const;`,
                "",
            );
        }

        for (const { table_name } of tableRows) {
            const { rows: columns } = await client.query<ColumnRow>(
                `SELECT column_name, data_type, udt_name, is_nullable, column_default, is_identity
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1
                 ORDER BY ordinal_position`,
                [table_name],
            );
            const pascal = toPascal(table_name);
            const camel = toCamel(table_name);

            parts.push(`// ─── ${table_name} ${"─".repeat(Math.max(0, 44 - table_name.length))}`);

            // Row interface
            parts.push(`export interface ${pascal}Row {`);
            for (const c of columns) {
                parts.push(`    ${toCamel(c.column_name)}: ${tsTypeFor(c, enumNames)};`);
            }
            parts.push("}");

            // Insert interface
            parts.push(`export interface ${pascal}Insert {`);
            for (const c of columns) {
                const optional = optionalOnInsert(c) ? "?" : "";
                parts.push(`    ${toCamel(c.column_name)}${optional}: ${tsTypeFor(c, enumNames)};`);
            }
            parts.push("}");

            // Column-reference object: each column is a ColumnRef (a "<table>"."<col>"
            // fragment that also carries the bare table/column names for INSERT/UPDATE).
            parts.push(`export const ${camel} = {`);
            parts.push(`    $name: "${table_name}" as const,`);
            for (const c of columns) {
                parts.push(`    ${toCamel(c.column_name)}: column("${table_name}", "${c.column_name}"),`);
            }
            parts.push(`} satisfies { $name: string } & Record<string, ColumnRef | string>;`, "");
        }

        output = parts.join("\n") + "\n";
    } finally {
        await client.end();
    }

    if (checkOnly) {
        const current = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, "utf8") : "";
        if (current !== output) {
            console.error("[db:types] generated/tables.ts is stale. Run `pnpm --filter @school-sis/web db:types`.");
            process.exit(1);
        }
        console.log("[db:types] generated tables are current.");
    } else {
        writeFileSync(OUT_PATH, output);
        console.log(`[db:types] wrote ${OUT_PATH}`);
    }
}

main().catch((error) => {
    console.error("[db:types] failed:", error instanceof Error ? error.message : error);
    process.exit(1);
});
