/**
 * Raw-SQL condition/ordering builders — the drizzle-orm operator replacements the
 * tenant-scope layer and its consumers use. Each returns a composable `SqlQuery`
 * fragment: a column reference (a `ColumnRef`/`SqlQuery`) is inlined as SQL text, and
 * every plain value is bound as a parameter, so nothing a caller passes as a value can
 * become SQL. `and`/`or` return `undefined` for an empty/all-undefined set, matching
 * how the builder treats an absent predicate (`where(undefined)` is a no-op).
 */

import { sql } from "../db";
import type { SqlQuery } from "../db";

export { sql };

/** A comparison right-hand side: another column reference, or a bound value. */
type Operand = SqlQuery | unknown;

export function eq(left: SqlQuery, right: Operand): SqlQuery {
    return sql`${left} = ${right}`;
}

export function ne(left: SqlQuery, right: Operand): SqlQuery {
    return sql`${left} <> ${right}`;
}

export function gt(left: SqlQuery, right: Operand): SqlQuery {
    return sql`${left} > ${right}`;
}

export function gte(left: SqlQuery, right: Operand): SqlQuery {
    return sql`${left} >= ${right}`;
}

export function lt(left: SqlQuery, right: Operand): SqlQuery {
    return sql`${left} < ${right}`;
}

export function lte(left: SqlQuery, right: Operand): SqlQuery {
    return sql`${left} <= ${right}`;
}

export function isNull(column: SqlQuery): SqlQuery {
    return sql`${column} IS NULL`;
}

export function isNotNull(column: SqlQuery): SqlQuery {
    return sql`${column} IS NOT NULL`;
}

export function ilike(column: SqlQuery, pattern: string): SqlQuery {
    return sql`${column} ILIKE ${pattern}`;
}

export function like(column: SqlQuery, pattern: string): SqlQuery {
    return sql`${column} LIKE ${pattern}`;
}

/** `<column> = ANY($values)` — true for no rows when `values` is empty. */
export function inArray(column: SqlQuery, values: readonly unknown[]): SqlQuery {
    return sql`${column} = ANY(${values as unknown[]})`;
}

/** `<column> <> ALL($values)` — true for all rows when `values` is empty. */
export function notInArray(column: SqlQuery, values: readonly unknown[]): SqlQuery {
    return sql`${column} <> ALL(${values as unknown[]})`;
}

function join(keyword: "AND" | "OR", conditions: Array<SqlQuery | undefined>): SqlQuery | undefined {
    const present = conditions.filter((condition): condition is SqlQuery => condition !== undefined);
    if (present.length === 0) return undefined;
    if (present.length === 1) return present[0];
    let combined = present[0]!;
    for (let i = 1; i < present.length; i += 1) {
        combined = keyword === "AND" ? sql`${combined} AND ${present[i]}` : sql`${combined} OR ${present[i]}`;
    }
    return sql`(${combined})`;
}

export function and(...conditions: Array<SqlQuery | undefined>): SqlQuery | undefined {
    return join("AND", conditions);
}

export function or(...conditions: Array<SqlQuery | undefined>): SqlQuery | undefined {
    return join("OR", conditions);
}

export function asc(column: SqlQuery): SqlQuery {
    return sql`${column} ASC`;
}

export function desc(column: SqlQuery): SqlQuery {
    return sql`${column} DESC`;
}
