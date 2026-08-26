/**
 * Tenant-scoped, compiler-checked data access.
 *
 * WHY THIS EXISTS
 * ---------------
 * The application reached ~1,000 hand-written SQL strings. Two defect classes
 * came out of that and neither one is catchable by review at that volume:
 *
 *   1. Columns that do not exist. A string like `SUM(amount)` compiles fine in
 *      TypeScript and fails (or silently returns nothing) at runtime.
 *   2. Missing tenant scoping. `WHERE fee_plan_id = $1` reads whichever school
 *      owns that id, because remembering `AND tenant_id = $2` is a convention,
 *      and conventions are forgotten.
 *
 * This module removes both by construction:
 *
 *   - Every column reference goes through the Drizzle schema in ../db/schema,
 *     so a column that does not exist is a type error, not a 500.
 *   - There is no way to obtain a query builder here without a tenant id, and
 *     the tenant predicate is appended by the builder itself, not by the
 *     caller. `.where()` narrows a query; it can never widen it.
 *   - Tables with no `tenant_id` of their own (e.g. `fee_components`) cannot be
 *     read without naming the tenant-owning parent to join through, and cannot
 *     be written without an `OwnedRow` handle that was minted by a
 *     tenant-scoped read. See `fromChild` / `claim` below.
 *   - Raw SQL is still available via `raw()` for aggregates the builder should
 *     not try to express, but the callback is handed a `tenant()` helper and
 *     the call throws if that helper was never used.
 */

import { and, asc, desc, getTableColumns, sql, SQL, type ExtractTablesWithRelations } from 'drizzle-orm';
import type { AnyPgColumn, PgColumn, PgDatabase, PgTable } from 'drizzle-orm/pg-core';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { db as rootDb } from '../db';

export { and, asc, desc, sql, SQL };

// ─── Connection ──────────────────────────────────────────────

/**
 * Anything that can run a statement: the root Drizzle database or a Drizzle
 * transaction. Both go through the RLS-routing pool exported by ../db, so this
 * layer inherits the same tenant session context as the raw `pool.query` call
 * sites it replaces.
 */
export type ScopedConnection = PgDatabase<
    NodePgQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
>;

// ─── Table shapes ────────────────────────────────────────────

/** A table that carries its own `tenant_id`. Only these can be queried directly. */
export type TenantOwnedTable = PgTable & { tenantId: AnyPgColumn };

/** A tenant-owned table that also has an `id` primary key, so it can be claimed. */
export type ClaimableTable = TenantOwnedTable & { id: AnyPgColumn };

/**
 * A table with no `tenant_id` column — `fee_components` is the canonical one.
 * Row-level security cannot scope these, so this layer refuses to touch them
 * except through a tenant-owning parent.
 */
export type ChildTable = PgTable;

// ─── Row inference ───────────────────────────────────────────

type ColumnData<TColumn extends PgColumn> = TColumn['_']['notNull'] extends true
    ? TColumn['_']['data']
    : TColumn['_']['data'] | null;

/** What may appear in a projection: a real column, or an explicitly typed SQL expression. */
export type ScopedFields = Record<string, PgColumn | SQL | SQL.Aliased>;

/**
 * The row type a projection produces.
 *
 * Caveat worth knowing: a column selected from a LEFT JOINed table is typed
 * here as if the join always matched. When that matters, project it as
 * `sql<string | null>` so the nullability is explicit.
 */
export type ScopedRow<TFields extends ScopedFields> = {
    [K in keyof TFields]: TFields[K] extends PgColumn
        ? ColumnData<TFields[K]>
        : TFields[K] extends SQL.Aliased<infer TAliased>
            ? TAliased
            : TFields[K] extends SQL<infer TValue>
                ? TValue
                : never;
};

/** Insert payload for a tenant-owned table — `tenantId` is supplied by the scope. */
export type TenantInsert<TTable extends TenantOwnedTable> = Omit<TTable['$inferInsert'], 'tenantId'>;

/** Update payload — `tenantId` can never be reassigned through this layer. */
export type TenantUpdate<TTable extends PgTable> = Partial<Omit<TTable['$inferInsert'], 'tenantId'>>;

// ─── Proof of ownership ──────────────────────────────────────

const ownedBrand = Symbol('tenantOwnedRow');

/**
 * A row that has been *read back* under the caller's tenant predicate. It is
 * the only key that opens writes to that row's tenant-less children, and it
 * cannot be forged: the brand symbol is private to this module.
 */
export interface OwnedRow<TTable extends ClaimableTable> {
    readonly [ownedBrand]: true;
    readonly id: string;
    readonly tenantId: string;
    readonly row: TTable['$inferSelect'];
}

// ─── Internals ───────────────────────────────────────────────

/**
 * The one deliberate cast in this module. Drizzle's builder types encode the
 * whole query shape in their type parameters, which makes them impossible to
 * accumulate step by step behind a stable interface. `$dynamic()` is Drizzle's
 * own sanctioned escape from that, and this is the surface of it we use.
 */
interface DynamicSelect {
    innerJoin(table: PgTable, on: SQL): DynamicSelect;
    leftJoin(table: PgTable, on: SQL): DynamicSelect;
    where(condition: SQL): DynamicSelect;
    groupBy(...expressions: Array<SQL | PgColumn>): DynamicSelect;
    orderBy(...expressions: Array<SQL | PgColumn>): DynamicSelect;
    limit(rows: number): DynamicSelect;
    offset(rows: number): DynamicSelect;
    for(strength: 'update'): DynamicSelect;
    execute(): Promise<unknown[]>;
}

interface JoinSpec {
    kind: 'inner' | 'left';
    table: PgTable;
    on: SQL;
}

function combine(conditions: Array<SQL | undefined>): SQL | undefined {
    const present = conditions.filter((condition): condition is SQL => condition !== undefined);
    if (present.length === 0) return undefined;
    if (present.length === 1) return present[0];
    return and(...present) as SQL;
}

const TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertTenantId(tenantId: string): string {
    if (typeof tenantId !== 'string' || !TENANT_ID_PATTERN.test(tenantId)) {
        throw new Error('tenantScope requires the caller\'s tenant id.');
    }
    return tenantId;
}

// ─── Query builder ───────────────────────────────────────────

/**
 * A SELECT whose tenant predicate is already fixed. `where`, `orderBy`,
 * `limit` and friends can only narrow it.
 */
export class ScopedSelect<TFields extends ScopedFields> {
    private readonly conditions: Array<SQL | undefined> = [];
    private readonly groupings: Array<SQL | PgColumn> = [];
    private readonly orderings: Array<SQL | PgColumn> = [];
    private rowLimit: number | undefined;
    private rowOffset: number | undefined;
    private lockForUpdate = false;

    constructor(
        private readonly conn: ScopedConnection,
        private readonly table: PgTable,
        private readonly joins: JoinSpec[],
        private readonly scopeConditions: SQL[],
        private readonly fields: TFields,
    ) {}

    /** Adds a further restriction. `undefined` is ignored, so optional filters read cleanly. */
    where(condition: SQL | undefined): this {
        this.conditions.push(condition);
        return this;
    }

    groupBy(...expressions: Array<SQL | PgColumn>): this {
        this.groupings.push(...expressions);
        return this;
    }

    orderBy(...expressions: Array<SQL | PgColumn>): this {
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

    async rows(): Promise<Array<ScopedRow<TFields>>> {
        let query = this.conn
            .select(this.fields)
            .from(this.table) as unknown as DynamicSelect;

        for (const join of this.joins) {
            query = join.kind === 'inner'
                ? query.innerJoin(join.table, join.on)
                : query.leftJoin(join.table, join.on);
        }

        const where = combine([...this.scopeConditions, ...this.conditions]);
        if (where) query = query.where(where);
        if (this.groupings.length > 0) query = query.groupBy(...this.groupings);
        if (this.orderings.length > 0) query = query.orderBy(...this.orderings);
        if (this.rowLimit !== undefined) query = query.limit(this.rowLimit);
        if (this.rowOffset !== undefined) query = query.offset(this.rowOffset);
        if (this.lockForUpdate) query = query.for('update');

        const result = await query.execute();
        return result as Array<ScopedRow<TFields>>;
    }

    async first(): Promise<ScopedRow<TFields> | null> {
        if (this.rowLimit === undefined) this.limit(1);
        const rows = await this.rows();
        return rows[0] ?? null;
    }
}

/** A FROM clause that already knows its tenant. Joins and projection hang off it. */
export class ScopedFrom {
    constructor(
        private readonly conn: ScopedConnection,
        private readonly tenantId: string,
        private readonly table: PgTable,
        private readonly joins: JoinSpec[],
        private readonly scopeConditions: SQL[],
    ) {}

    /**
     * Joins another tenant-owning table. The joined table's own tenant
     * predicate is added automatically, so a join can never widen the query
     * across tenants — which is exactly the mistake the old `INNER JOIN
     * academic_years a ON p.academic_year_id = a.id` made.
     */
    innerJoin<TTable extends TenantOwnedTable>(table: TTable, on: SQL): ScopedFrom {
        return this.join('inner', table, on);
    }

    leftJoin<TTable extends TenantOwnedTable>(table: TTable, on: SQL): ScopedFrom {
        return this.join('left', table, on);
    }

    private join(kind: 'inner' | 'left', table: TenantOwnedTable, on: SQL): ScopedFrom {
        const scopedOn = and(on, sql`${table.tenantId} = ${this.tenantId}`) as SQL;
        return new ScopedFrom(
            this.conn,
            this.tenantId,
            this.table,
            [...this.joins, { kind, table, on: scopedOn }],
            this.scopeConditions,
        );
    }

    /** Names the columns to read. Every entry is checked against the schema. */
    select<TFields extends ScopedFields>(fields: TFields): ScopedSelect<TFields> {
        return new ScopedSelect(this.conn, this.table, this.joins, this.scopeConditions, fields);
    }
}

// ─── The scope ───────────────────────────────────────────────

export class TenantScope {
    readonly tenantId: string;

    constructor(tenantId: string, private readonly conn: ScopedConnection) {
        this.tenantId = assertTenantId(tenantId);
    }

    /** `<table>.tenant_id = <this tenant>`, for use inside a `sql` fragment. */
    tenantPredicate(table: TenantOwnedTable): SQL {
        return sql`${table.tenantId} = ${this.tenantId}`;
    }

    /** Reads from a table that owns its own `tenant_id`. */
    from<TTable extends TenantOwnedTable>(table: TTable): ScopedFrom {
        return new ScopedFrom(this.conn, this.tenantId, table, [], [this.tenantPredicate(table)]);
    }

    /**
     * Reads from a table with no `tenant_id`, through the parent that owns it.
     *
     * `fee_components` is why this exists: it inherits its tenant from
     * `fee_plans.fee_plan_id`, and the version of `getFeePlanComponents` that
     * forgot to join back to `fee_plans` served other schools' fee structures
     * to anyone who guessed a plan id. Here the join and the parent's tenant
     * predicate are both mandatory — there is no overload without them.
     */
    fromChild<TChild extends ChildTable, TParent extends TenantOwnedTable>(
        child: TChild,
        ownership: { parent: TParent; on: SQL },
    ): ScopedFrom {
        const on = and(ownership.on, this.tenantPredicate(ownership.parent)) as SQL;
        return new ScopedFrom(this.conn, this.tenantId, child, [
            { kind: 'inner', table: ownership.parent, on },
        ], []);
    }

    /**
     * Reads one row by id under the tenant predicate and, on a hit, returns an
     * `OwnedRow` handle. That handle is the proof of ownership required by the
     * `child*` write helpers below.
     */
    async claim<TTable extends ClaimableTable>(
        table: TTable,
        id: string,
        options?: { forUpdate?: boolean },
    ): Promise<OwnedRow<TTable> | null> {
        if (typeof id !== 'string' || id.length === 0) return null;

        const select = this.from(table)
            .select(getTableColumns(table) as ScopedFields)
            .where(sql`${table.id} = ${id}`);
        if (options?.forUpdate) select.forUpdate();

        const found = await select.first();
        if (!found) return null;

        return {
            [ownedBrand]: true,
            id,
            tenantId: this.tenantId,
            row: found as unknown as TTable['$inferSelect'],
        };
    }

    /** `SELECT count(*)` under the tenant predicate. */
    async count<TTable extends TenantOwnedTable>(table: TTable, where?: SQL): Promise<number> {
        const rows = await this.from(table)
            .select({ value: sql<string>`count(*)` })
            .where(where)
            .rows();
        return Number(rows[0]?.value ?? 0);
    }

    /** INSERT with `tenant_id` supplied by the scope; callers cannot set it. */
    async insert<TTable extends TenantOwnedTable>(
        table: TTable,
        values: TenantInsert<TTable> | Array<TenantInsert<TTable>>,
    ): Promise<number> {
        const list = Array.isArray(values) ? values : [values];
        if (list.length === 0) return 0;
        const rows = list.map((value) => ({ ...value, tenantId: this.tenantId })) as Array<TTable['$inferInsert']>;
        const result = await this.conn.insert(table).values(rows);
        return result.rowCount ?? list.length;
    }

    /** UPDATE restricted to this tenant. Returns the number of rows changed. */
    async update<TTable extends TenantOwnedTable>(
        table: TTable,
        values: TenantUpdate<TTable>,
        where?: SQL,
    ): Promise<number> {
        const predicate = combine([this.tenantPredicate(table), where]) as SQL;
        const result = await this.conn
            .update(table)
            .set(values as TTable['$inferInsert'])
            .where(predicate);
        return result.rowCount ?? 0;
    }

    /** DELETE restricted to this tenant. */
    async delete<TTable extends TenantOwnedTable>(table: TTable, where?: SQL): Promise<number> {
        const predicate = combine([this.tenantPredicate(table), where]) as SQL;
        const result = await this.conn.delete(table).where(predicate);
        return result.rowCount ?? 0;
    }

    // ─── Tenant-less children ────────────────────────────────
    //
    // Every one of these takes an `OwnedRow` and the child's foreign key, and
    // pins the statement to `<fk> = <owned row id>`. There is no way to reach a
    // child row whose parent was not read back under this tenant first.

    /** The child's foreign-key column, addressed by its schema property name. */
    private childKey<TChild extends ChildTable>(child: TChild, foreignKey: string): AnyPgColumn {
        const column = (getTableColumns(child) as Record<string, AnyPgColumn>)[foreignKey];
        if (!column) throw new Error(`Unknown column ${foreignKey} on ${String(child)}.`);
        return column;
    }

    childSelect<
        TChild extends ChildTable,
        TParent extends ClaimableTable,
        TKey extends keyof TChild['$inferInsert'] & string,
    >(child: TChild, parent: OwnedRow<TParent>, foreignKey: TKey): ScopedFrom {
        return new ScopedFrom(this.conn, this.tenantId, child, [], [
            sql`${this.childKey(child, foreignKey)} = ${parent.id}`,
        ]);
    }

    async childInsert<
        TChild extends ChildTable,
        TParent extends ClaimableTable,
        TKey extends keyof TChild['$inferInsert'] & string,
    >(
        child: TChild,
        parent: OwnedRow<TParent>,
        foreignKey: TKey,
        values: Omit<TChild['$inferInsert'], TKey> | Array<Omit<TChild['$inferInsert'], TKey>>,
    ): Promise<number> {
        const list = Array.isArray(values) ? values : [values];
        if (list.length === 0) return 0;
        const rows = list.map((value) => ({ ...value, [foreignKey]: parent.id })) as Array<TChild['$inferInsert']>;
        const result = await this.conn.insert(child).values(rows);
        return result.rowCount ?? list.length;
    }

    async childUpdate<
        TChild extends ChildTable,
        TParent extends ClaimableTable,
        TKey extends keyof TChild['$inferInsert'] & string,
    >(
        child: TChild,
        parent: OwnedRow<TParent>,
        foreignKey: TKey,
        values: TenantUpdate<TChild>,
        where?: SQL,
    ): Promise<number> {
        const predicate = combine([sql`${this.childKey(child, foreignKey)} = ${parent.id}`, where]) as SQL;
        const result = await this.conn
            .update(child)
            .set(values as TChild['$inferInsert'])
            .where(predicate);
        return result.rowCount ?? 0;
    }

    async childDelete<
        TChild extends ChildTable,
        TParent extends ClaimableTable,
        TKey extends keyof TChild['$inferInsert'] & string,
    >(child: TChild, parent: OwnedRow<TParent>, foreignKey: TKey, where?: SQL): Promise<number> {
        const predicate = combine([sql`${this.childKey(child, foreignKey)} = ${parent.id}`, where]) as SQL;
        const result = await this.conn.delete(child).where(predicate);
        return result.rowCount ?? 0;
    }

    // ─── Escape hatch ────────────────────────────────────────

    /**
     * Raw SQL, for aggregates the builder should not try to express.
     *
     * The deliberate exception, not the default. The callback receives a
     * `tenant(alias)` helper that renders `<alias>."tenant_id" = $n`, and the
     * call throws if the query was built without it — so "I forgot the tenant
     * filter" cannot ship from here either. Interpolate schema columns
     * (`${invoices.paidAmount}`) rather than typing names, and the column-name
     * check survives too.
     */
    async raw<TRow extends Record<string, unknown>>(
        build: (tenant: (alias: string) => SQL) => SQL,
    ): Promise<TRow[]> {
        let usages = 0;
        const tenant = (alias: string): SQL => {
            usages += 1;
            return sql`${sql.identifier(alias)}."tenant_id" = ${this.tenantId}`;
        };

        const query = build(tenant);
        if (usages === 0) {
            throw new Error(
                'TenantScope.raw: the query was built without the tenant() predicate. ' +
                'Add tenant(<table alias>) to its WHERE clause.',
            );
        }

        const result = await this.conn.execute<TRow>(query);
        return result.rows as TRow[];
    }

    /** Runs `fn` in a transaction against a scope bound to the same tenant. */
    async transaction<TResult>(fn: (tx: TenantScope) => Promise<TResult>): Promise<TResult> {
        return this.conn.transaction(async (tx) =>
            fn(new TenantScope(this.tenantId, tx as unknown as ScopedConnection)),
        );
    }
}

/**
 * The only way in. There is no zero-argument overload, no ambient default and
 * no "current tenant" global: a query in this layer cannot exist without the
 * tenant id that scopes it.
 */
export function tenantScope(tenantId: string, conn: ScopedConnection = rootDb): TenantScope {
    return new TenantScope(tenantId, conn);
}
