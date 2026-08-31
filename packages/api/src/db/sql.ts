import type { Pool, PoolClient, QueryResultRow } from "pg";

/**
 * A minimal, dependency-free tagged-template SQL helper — the raw-Neon-Postgres
 * replacement for the Drizzle query builder. It keeps two guarantees the builder
 * gave us, without the ORM:
 *
 *   1. Injection safety — every interpolated value becomes a bound `$n` parameter,
 *      never string-concatenated into the SQL. The only thing that may contribute
 *      SQL *text* is another `sql``` fragment (composition).
 *   2. RLS/tenant isolation — queries run through the shared pool, which is patched
 *      to apply the signed tenant context per connection (see patchPoolForRlsContext
 *      in ./index).
 *
 * Placeholders are assigned in a single left-to-right pass over the real bound
 * values at execution time — including through nested fragments — so a literal
 * `$5` inside a string literal or dollar-quoted body is copied verbatim and never
 * mistaken for a placeholder.
 *
 * TRANSACTIONS: awaiting a query directly (`await sql``...```) always runs it on the
 * routing pool, on a fresh autocommit connection — NOT on any ambient open
 * transaction. Inside a transaction you MUST bind the query to the checked-out
 * client, either per call — `.rows(client)` / `.one(client)` / `.execute(client)` —
 * or by using a client-bound tag from `sqlFor(client)`. A bare `await sql``` inside
 * a `withTenant` block would commit on a different connection and silently escape the
 * surrounding BEGIN/COMMIT.
 *
 * Usage:
 *   const rows = await sql<Row>`SELECT * FROM invoices WHERE tenant_id = ${tid}`;
 *   const one  = await sql<Row>`... WHERE id = ${id}`.one();
 *   const frag = sql`AND status = ${status}`;
 *   const rows = await sql<Row>`SELECT * FROM invoices WHERE tenant_id = ${tid} ${frag}`;
 *   // in a transaction:
 *   await withTenant(tid, async (client) => {
 *     const q = sqlFor(client);
 *     await q`INSERT INTO audit_logs ...`;
 *   });
 */

/** Anything that can run a parameterized query: the pool or a checked-out client. */
export type SqlRunner = Pick<Pool | PoolClient, "query">;

export class SqlQuery<Row extends QueryResultRow = QueryResultRow> implements PromiseLike<Row[]> {
    private compiled?: { text: string; params: unknown[] };

    constructor(
        private readonly strings: readonly string[],
        private readonly values: readonly unknown[],
        private readonly getDefaultRunner: () => SqlRunner,
    ) {}

    /**
     * Flatten this query and any nested fragments into one parameterized statement,
     * assigning `$n` in a single pass over the bound values. Memoized — the template
     * strings and values are immutable once constructed.
     */
    private compile(): { text: string; params: unknown[] } {
        if (!this.compiled) {
            const params: unknown[] = [];
            const text = this.render(params);
            this.compiled = { text, params };
        }
        return this.compiled;
    }

    /** Append this query's SQL to `text`, pushing bound values onto the shared `params`. */
    private render(params: unknown[]): string {
        let text = "";
        for (let i = 0; i < this.strings.length; i += 1) {
            text += this.strings[i];
            if (i >= this.values.length) continue;
            const value = this.values[i];
            if (value instanceof SqlQuery) {
                // Compose: inline the fragment, sharing the same params array so its
                // placeholders continue the single global sequence. Only a SqlQuery
                // may contribute SQL text; every other value is bound as a parameter.
                text += value.render(params);
            } else {
                params.push(value);
                text += `$${params.length}`;
            }
        }
        return text;
    }

    /** The compiled SQL text (placeholders assigned). */
    get text(): string {
        return this.compile().text;
    }

    /** The ordered bound parameters. */
    get params(): readonly unknown[] {
        return this.compile().params;
    }

    private runner(client?: SqlRunner): SqlRunner {
        return client ?? this.getDefaultRunner();
    }

    /** Execute and return every row. Pass a client to run inside its transaction. */
    async rows(client?: SqlRunner): Promise<Row[]> {
        const { text, params } = this.compile();
        const result = await this.runner(client).query<Row>(text, params);
        return result.rows;
    }

    /** Await the query directly to get its rows: `const rows = await sql`...``. */
    then<TResult1 = Row[], TResult2 = never>(
        onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
        return this.rows().then(onfulfilled, onrejected);
    }

    /** Exactly one row, or throw. */
    async one(client?: SqlRunner): Promise<Row> {
        const rows = await this.rows(client);
        if (rows.length !== 1) {
            throw new Error(`Expected exactly one row, received ${rows.length}.`);
        }
        return rows[0]!;
    }

    /** Zero or one row (throws on more than one); null when none. */
    async maybeOne(client?: SqlRunner): Promise<Row | null> {
        const rows = await this.rows(client);
        if (rows.length > 1) {
            throw new Error(`Expected at most one row, received ${rows.length}.`);
        }
        return rows[0] ?? null;
    }

    /** Run a statement for effect; returns the affected row count. */
    async execute(client?: SqlRunner): Promise<number> {
        const { text, params } = this.compile();
        const result = await this.runner(client).query(text, params);
        return result.rowCount ?? 0;
    }
}

/** A tagged-template function that builds SqlQuery objects bound to a runner. */
export type SqlTag = <Row extends QueryResultRow = QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: unknown[]
) => SqlQuery<Row>;

/**
 * Build a `sql` tag whose queries run, by default, through `getRunner()`. The runner
 * is resolved lazily per execution so the tag can be created before the pool exists
 * and so each call observes the current routing (tenant vs platform) pool.
 */
export function createSqlTag(getRunner: () => SqlRunner): SqlTag {
    return function sql<Row extends QueryResultRow = QueryResultRow>(
        strings: TemplateStringsArray,
        ...values: unknown[]
    ): SqlQuery<Row> {
        return new SqlQuery<Row>(strings, values, getRunner);
    };
}

/**
 * A `sql` tag bound to one runner — a checked-out client, typically. Use inside a
 * transaction so its statements run on the transaction's connection:
 *   await withTenant(tid, async (client) => { const sql = sqlFor(client); await sql`...`; });
 */
export function sqlFor(runner: SqlRunner): SqlTag {
    return createSqlTag(() => runner);
}

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/** A fragment that is composed into a query but never executed on its own. */
function unexecutable(): SqlRunner {
    throw new Error("A SQL identifier fragment is not executable on its own — compose it into a query.");
}

/**
 * A trusted, double-quoted, dotted SQL identifier as a composable fragment —
 * `identifier('fee_plans', 'id')` renders `"fee_plans"."id"`. Every part is
 * validated against a strict identifier pattern, so only known-safe names (schema
 * table/column names, never user input) can be built. Generated column references
 * are built from this so a value is never mistaken for an identifier.
 */
export function identifier(...parts: string[]): SqlQuery {
    if (parts.length === 0) {
        throw new Error("identifier() requires at least one name part.");
    }
    const rendered = parts
        .map((part) => {
            if (!IDENTIFIER_RE.test(part)) {
                throw new Error(`Unsafe SQL identifier part: ${JSON.stringify(part)}.`);
            }
            return `"${part}"`;
        })
        .join(".");
    return new SqlQuery([rendered], [], unexecutable);
}
