/**
 * Tenant-scoped data access on raw Neon Postgres.
 *
 * WHY THIS EXISTS
 * ---------------
 * At ~1,000 hand-written SQL strings, one defect class is uncatchable by review:
 * missing tenant scoping. `WHERE fee_plan_id = $1` reads whichever school owns that
 * id, because remembering `AND tenant_id = $2` is a convention, and conventions are
 * forgotten. This module removes it BY CONSTRUCTION:
 *
 *   - There is no way to obtain a query here without a tenant id, and the tenant
 *     predicate is appended by the builder itself, not by the caller. `.where()`
 *     narrows a query; it can never widen it.
 *   - Tables with no `tenant_id` (e.g. `fee_components`) cannot be read without naming
 *     the tenant-owning parent to join through, and cannot be written without an
 *     `OwnedRow` handle minted by a tenant-scoped read (see `fromChild` / `claim`).
 *   - Raw SQL is available via `raw()` for aggregates the builder should not express,
 *     but the callback gets a `tenant()` helper and the call throws if it went unused.
 *
 * Columns come from the generated schema (db/generated/tables.ts): `feePlans.id` is a
 * composable "fee_plans"."id" fragment. Column existence is verified by the CI SQL
 * audits (audit:sql / audit:sql:prepare) that parse every statement against the
 * migrated schema — the compile-time check the previous Drizzle version gave is
 * replaced by that gate, not lost.
 */

import { column, identifier, pool, sqlFor } from "../db";
import type { ColumnRef, SqlQuery, SqlRunner, SqlTag } from "../db";
import { and } from "./operators";

export * from "./operators";

// ─── Table shapes ────────────────────────────────────────────

/** A generated table object: a `$name` plus one `ColumnRef` per column. */
export interface GeneratedTable {
    readonly $name: string;
    readonly [column: string]: ColumnRef | string;
}
/** A table that carries its own `tenant_id`. Only these can be queried directly. */
export type TenantOwnedTable = GeneratedTable & { readonly tenantId: ColumnRef };
/** Tenant-owned and with an `id`, so it can be claimed. */
export type ClaimableTable = TenantOwnedTable & { readonly id: ColumnRef };
/** A table with no `tenant_id` — only reachable through a tenant-owning parent. */
export type ChildTable = GeneratedTable;

/** A projection: output key -> a column reference or a typed SQL expression. */
export type ScopedFields = Record<string, SqlQuery>;

/** Values for a write — `tenantId` is supplied by the scope and cannot be set here. */
export type ScopedValues = Record<string, unknown>;

// ─── Proof of ownership ──────────────────────────────────────

const ownedBrand = Symbol("tenantOwnedRow");

/**
 * A row read back under the caller's tenant predicate. It is the only key that opens
 * writes to that row's tenant-less children, and it cannot be forged: the brand symbol
 * is private to this module.
 */
export interface OwnedRow<TRow = Record<string, unknown>> {
    readonly [ownedBrand]: true;
    readonly id: string;
    readonly tenantId: string;
    readonly row: TRow;
}

// ─── Internals ───────────────────────────────────────────────

interface JoinSpec {
    kind: "inner" | "left";
    tableName: string;
    on: SqlQuery;
}

const TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertTenantId(tenantId: string): string {
    if (typeof tenantId !== "string" || !TENANT_ID_PATTERN.test(tenantId)) {
        throw new Error("tenantScope requires the caller's tenant id.");
    }
    return tenantId;
}

/** Every column of a generated table as a projection keyed by its property name. */
function allColumns(table: GeneratedTable): ScopedFields {
    const fields: ScopedFields = {};
    for (const [key, value] of Object.entries(table)) {
        if (key === "$name") continue;
        fields[key] = value as ColumnRef;
    }
    return fields;
}

/** The bare, quoted column name for a table property (for INSERT/UPDATE lists). */
function columnName(table: GeneratedTable, property: string): SqlQuery {
    const ref = table[property];
    if (!ref || typeof ref === "string") {
        throw new Error(`Unknown column ${property} on ${table.$name}.`);
    }
    return identifier((ref as ColumnRef).column);
}

/** Join fragments with a comma. */
function commaJoin(sql: SqlTag, parts: SqlQuery[]): SqlQuery {
    let combined = parts[0]!;
    for (let i = 1; i < parts.length; i += 1) combined = sql`${combined}, ${parts[i]}`;
    return combined;
}

// ─── Query builder ───────────────────────────────────────────

/** A SELECT whose tenant predicate is already fixed. `where`, `orderBy`, `limit` narrow. */
export class ScopedSelect<TRow> {
    private readonly conditions: Array<SqlQuery | undefined> = [];
    private readonly groupings: SqlQuery[] = [];
    private readonly orderings: SqlQuery[] = [];
    private rowLimit: number | undefined;
    private rowOffset: number | undefined;
    private lockForUpdate = false;

    constructor(
        private readonly sql: SqlTag,
        private readonly runner: SqlRunner,
        private readonly table: GeneratedTable,
        private readonly joins: JoinSpec[],
        private readonly scopeConditions: SqlQuery[],
        private readonly fields: ScopedFields,
    ) {}

    /** Adds a further restriction. `undefined` is ignored, so optional filters read cleanly. */
    where(condition: SqlQuery | undefined): this {
        // Parenthesise the caller's predicate: a top-level OR inside it must not escape
        // the tenant AND via SQL precedence (`tenant AND a OR b` binds as `(tenant AND a) OR b`).
        this.conditions.push(condition === undefined ? undefined : this.sql`(${condition})`);
        return this;
    }

    groupBy(...expressions: SqlQuery[]): this {
        this.groupings.push(...expressions);
        return this;
    }

    orderBy(...expressions: SqlQuery[]): this {
        this.orderings.push(...expressions);
        return this;
    }

    limit(rows: number): this {
        this.rowLimit = rows;
        return this;
    }

    offset(rows: number): this {
        this.rowOffset = rows;
        return this;
    }

    /** `FOR UPDATE` — only meaningful inside `TenantScope.transaction`. */
    forUpdate(): this {
        this.lockForUpdate = true;
        return this;
    }

    private build(): SqlQuery {
        const sql = this.sql;
        const projection = commaJoin(
            sql,
            Object.entries(this.fields).map(([alias, expr]) => sql`${expr} AS ${identifier(alias)}`),
        );
        let query = sql`SELECT ${projection} FROM ${identifier(this.table.$name)}`;
        for (const join of this.joins) {
            query =
                join.kind === "inner"
                    ? sql`${query} INNER JOIN ${identifier(join.tableName)} ON ${join.on}`
                    : sql`${query} LEFT JOIN ${identifier(join.tableName)} ON ${join.on}`;
        }
        const where = and(...this.scopeConditions, ...this.conditions);
        if (where) query = sql`${query} WHERE ${where}`;
        if (this.groupings.length > 0) query = sql`${query} GROUP BY ${commaJoin(sql, this.groupings)}`;
        if (this.orderings.length > 0) query = sql`${query} ORDER BY ${commaJoin(sql, this.orderings)}`;
        if (this.rowLimit !== undefined) query = sql`${query} LIMIT ${this.rowLimit}`;
        if (this.rowOffset !== undefined) query = sql`${query} OFFSET ${this.rowOffset}`;
        if (this.lockForUpdate) query = sql`${query} FOR UPDATE`;
        return query;
    }

    async rows(): Promise<TRow[]> {
        return (await this.build().rows(this.runner)) as TRow[];
    }

    async first(): Promise<TRow | null> {
        if (this.rowLimit === undefined) this.limit(1);
        const rows = await this.rows();
        return rows[0] ?? null;
    }
}

/** A FROM clause that already knows its tenant. Joins and projection hang off it. */
export class ScopedFrom {
    constructor(
        private readonly sql: SqlTag,
        private readonly runner: SqlRunner,
        private readonly tenantId: string,
        private readonly table: GeneratedTable,
        private readonly joins: JoinSpec[],
        private readonly scopeConditions: SqlQuery[],
    ) {}

    /**
     * Joins another tenant-owning table. The joined table's own tenant predicate is
     * added automatically, so a join can never widen the query across tenants.
     */
    innerJoin(table: TenantOwnedTable, on: SqlQuery): ScopedFrom {
        return this.join("inner", table, on);
    }

    leftJoin(table: TenantOwnedTable, on: SqlQuery): ScopedFrom {
        return this.join("left", table, on);
    }

    private join(kind: "inner" | "left", table: TenantOwnedTable, on: SqlQuery): ScopedFrom {
        const scopedOn = this.sql`${on} AND ${table.tenantId} = ${this.tenantId}`;
        return new ScopedFrom(this.sql, this.runner, this.tenantId, this.table, [
            ...this.joins,
            { kind, tableName: table.$name, on: scopedOn },
        ], this.scopeConditions);
    }

    /** Names the columns to read. The row type is supplied by the caller. */
    select<TRow = Record<string, unknown>>(fields: { [K in keyof TRow]: SqlQuery } | ScopedFields): ScopedSelect<TRow> {
        return new ScopedSelect<TRow>(
            this.sql,
            this.runner,
            this.table,
            this.joins,
            this.scopeConditions,
            fields as ScopedFields,
        );
    }
}

// ─── The scope ───────────────────────────────────────────────

export class TenantScope {
    readonly tenantId: string;
    private readonly sql: SqlTag;

    constructor(tenantId: string, private readonly runner: SqlRunner = pool) {
        this.tenantId = assertTenantId(tenantId);
        this.sql = sqlFor(this.runner);
    }

    /** `<table>.tenant_id = <this tenant>`, for use inside a `sql` fragment. */
    tenantPredicate(table: TenantOwnedTable): SqlQuery {
        return this.sql`${table.tenantId} = ${this.tenantId}`;
    }

    /** Reads from a table that owns its own `tenant_id`. */
    from(table: TenantOwnedTable): ScopedFrom {
        return new ScopedFrom(this.sql, this.runner, this.tenantId, table, [], [this.tenantPredicate(table)]);
    }

    /**
     * Reads from a table with no `tenant_id`, through the parent that owns it. The
     * join and the parent's tenant predicate are both mandatory — there is no overload
     * without them, so `fee_components` cannot be read without proving the tenant.
     */
    fromChild(child: ChildTable, ownership: { parent: TenantOwnedTable; on: SqlQuery }): ScopedFrom {
        const on = this.sql`${ownership.on} AND ${this.tenantPredicate(ownership.parent)}`;
        return new ScopedFrom(this.sql, this.runner, this.tenantId, child, [
            { kind: "inner", tableName: ownership.parent.$name, on },
        ], []);
    }

    /**
     * Reads one row by id under the tenant predicate and, on a hit, returns an
     * `OwnedRow` handle — the proof of ownership the `child*` write helpers require.
     */
    async claim<TRow = Record<string, unknown>>(
        table: ClaimableTable,
        id: string,
        options?: { forUpdate?: boolean },
    ): Promise<OwnedRow<TRow> | null> {
        if (typeof id !== "string" || id.length === 0) return null;

        const select = this.from(table)
            .select<TRow>(allColumns(table))
            .where(this.sql`${table.id} = ${id}`);
        if (options?.forUpdate) select.forUpdate();

        const found = await select.first();
        if (!found) return null;

        return { [ownedBrand]: true, id, tenantId: this.tenantId, row: found };
    }

    /** `SELECT count(*)` under the tenant predicate. */
    async count(table: TenantOwnedTable, where?: SqlQuery): Promise<number> {
        const rows = await this.from(table)
            .select<{ value: string }>({ value: this.sql`count(*)` })
            .where(where)
            .rows();
        return Number(rows[0]?.value ?? 0);
    }

    /** INSERT with `tenant_id` supplied by the scope; callers cannot set it. */
    async insert(table: TenantOwnedTable, values: ScopedValues | ScopedValues[]): Promise<number> {
        const list = Array.isArray(values) ? values : [values];
        if (list.length === 0) return 0;
        const rows = list.map((value) => ({ ...value, tenantId: this.tenantId }));
        return this.insertRows(table, rows);
    }

    /** UPDATE restricted to this tenant. Returns the number of rows changed. */
    async update(table: TenantOwnedTable, values: ScopedValues, where?: SqlQuery): Promise<number> {
        const predicate = and(this.tenantPredicate(table), this.grouped(where))!;
        return this.updateRows(table, values, predicate);
    }

    /** DELETE restricted to this tenant. */
    async delete(table: TenantOwnedTable, where?: SqlQuery): Promise<number> {
        const predicate = and(this.tenantPredicate(table), this.grouped(where))!;
        return this.sql`DELETE FROM ${identifier(table.$name)} WHERE ${predicate}`.execute(this.runner);
    }

    /**
     * Parenthesise a caller-supplied predicate so a top-level OR inside it stays
     * grouped when ANDed with the tenant/foreign-key predicate.
     */
    private grouped(where?: SqlQuery): SqlQuery | undefined {
        return where === undefined ? undefined : this.sql`(${where})`;
    }

    /**
     * A child helper's OwnedRow must have been minted by THIS scope — the brand alone
     * proves it was read back under a tenant predicate, but not under *this* tenant's.
     */
    private assertOwned(parent: OwnedRow): void {
        if (parent[ownedBrand] !== true || parent.tenantId !== this.tenantId) {
            throw new Error("OwnedRow belongs to a different tenant scope.");
        }
    }

    // ─── Tenant-less children ────────────────────────────────
    //
    // Each takes an `OwnedRow` and the child's foreign key, and pins the statement to
    // `<fk> = <owned row id>`. There is no way to reach a child row whose parent was
    // not read back under this tenant first.

    childSelect(child: ChildTable, parent: OwnedRow, foreignKey: string): ScopedFrom {
        this.assertOwned(parent);
        return new ScopedFrom(this.sql, this.runner, this.tenantId, child, [], [
            this.sql`${columnRef(child, foreignKey)} = ${parent.id}`,
        ]);
    }

    async childInsert(
        child: ChildTable,
        parent: OwnedRow,
        foreignKey: string,
        values: ScopedValues | ScopedValues[],
    ): Promise<number> {
        this.assertOwned(parent);
        const list = Array.isArray(values) ? values : [values];
        if (list.length === 0) return 0;
        const rows = list.map((value) => ({ ...value, [foreignKey]: parent.id }));
        return this.insertRows(child, rows);
    }

    async childUpdate(
        child: ChildTable,
        parent: OwnedRow,
        foreignKey: string,
        values: ScopedValues,
        where?: SqlQuery,
    ): Promise<number> {
        this.assertOwned(parent);
        const predicate = and(this.sql`${columnRef(child, foreignKey)} = ${parent.id}`, this.grouped(where))!;
        return this.updateRows(child, values, predicate);
    }

    async childDelete(
        child: ChildTable,
        parent: OwnedRow,
        foreignKey: string,
        where?: SqlQuery,
    ): Promise<number> {
        this.assertOwned(parent);
        const predicate = and(this.sql`${columnRef(child, foreignKey)} = ${parent.id}`, this.grouped(where))!;
        return this.sql`DELETE FROM ${identifier(child.$name)} WHERE ${predicate}`.execute(this.runner);
    }

    // ─── Shared write builders ───────────────────────────────

    private async insertRows(table: GeneratedTable, rows: ScopedValues[]): Promise<number> {
        const keys = Object.keys(rows[0]!);
        const columns = commaJoin(this.sql, keys.map((key) => columnName(table, key)));
        const tuples = rows.map((row) =>
            this.sql`(${commaJoin(this.sql, keys.map((key) => this.sql`${row[key]}`))})`,
        );
        const values = commaJoin(this.sql, tuples);
        return this.sql`INSERT INTO ${identifier(table.$name)} (${columns}) VALUES ${values}`.execute(this.runner);
    }

    private async updateRows(table: GeneratedTable, values: ScopedValues, where: SqlQuery): Promise<number> {
        const assignments = commaJoin(
            this.sql,
            Object.entries(values).map(([key, value]) => this.sql`${columnName(table, key)} = ${value}`),
        );
        return this.sql`UPDATE ${identifier(table.$name)} SET ${assignments} WHERE ${where}`.execute(this.runner);
    }

    // ─── Escape hatch ────────────────────────────────────────

    /**
     * Raw SQL, for aggregates the builder should not express. The callback receives a
     * `tenant(alias)` helper that renders `<alias>."tenant_id" = $n`. The fragment it
     * returns MUST be interpolated into the returned query: the call throws both if
     * tenant() was never called AND if the tenant id it binds is absent from the
     * compiled parameters — so calling tenant() and discarding its fragment cannot
     * ship an unscoped query either.
     */
    async raw<TRow extends Record<string, unknown>>(
        build: (tenant: (alias: string) => SqlQuery, sql: SqlTag) => SqlQuery,
    ): Promise<TRow[]> {
        let usages = 0;
        const tenant = (alias: string): SqlQuery => {
            usages += 1;
            return this.sql`${identifier(alias, "tenant_id")} = ${this.tenantId}`;
        };
        const query = build(tenant, this.sql);
        if (usages === 0 || !query.params.includes(this.tenantId)) {
            throw new Error(
                "TenantScope.raw: the query was built without the tenant() predicate. " +
                    "Interpolate tenant(<table alias>) into its WHERE clause.",
            );
        }
        return (await query.rows(this.runner)) as TRow[];
    }

    /** Runs `fn` in a transaction against a scope bound to the same tenant. */
    async transaction<TResult>(fn: (tx: TenantScope) => Promise<TResult>): Promise<TResult> {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const result = await fn(new TenantScope(this.tenantId, client));
            await client.query("COMMIT");
            return result;
        } catch (error) {
            await client.query("ROLLBACK").catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }
}

/** A child column reference by property name (fails loudly on a bad key). */
function columnRef(table: GeneratedTable, property: string): ColumnRef {
    const ref = table[property];
    if (!ref || typeof ref === "string") {
        throw new Error(`Unknown column ${property} on ${table.$name}.`);
    }
    return ref as ColumnRef;
}

// `column` is imported only so downstream code can build ad-hoc refs; keep it exported.
export { column, identifier };

/**
 * The only way in. There is no zero-argument overload, no ambient default and no
 * "current tenant" global: a query in this layer cannot exist without the tenant id
 * that scopes it.
 */
export function tenantScope(tenantId: string, runner: SqlRunner = pool): TenantScope {
    return new TenantScope(tenantId, runner);
}
