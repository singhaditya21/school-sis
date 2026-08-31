import { createSqlTag, sqlFor, identifier, SqlQuery, type SqlRunner } from "@/lib/db/sql";

/** A fake runner that records every query and returns a configured result. */
function fakeRunner(rows: Array<Record<string, unknown>> = [], rowCount?: number) {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const runner: SqlRunner = {
        query: (async (text: string, params: unknown[]) => {
            calls.push({ text, params });
            return { rows, rowCount: rowCount ?? rows.length, command: "", oid: 0, fields: [] };
        }) as SqlRunner["query"],
    };
    return { runner, calls };
}

describe("sql`` helper — parameterization", () => {
    const sql = createSqlTag(() => fakeRunner().runner);

    it("binds a single value as $1, never inlining it", () => {
        const q = sql`SELECT * FROM invoices WHERE tenant_id = ${"t-1"}`;
        expect(q.text).toBe("SELECT * FROM invoices WHERE tenant_id = $1");
        expect(q.params).toEqual(["t-1"]);
    });

    it("numbers multiple values left to right", () => {
        const q = sql`WHERE a = ${1} AND b = ${2} AND c = ${3}`;
        expect(q.text).toBe("WHERE a = $1 AND b = $2 AND c = $3");
        expect(q.params).toEqual([1, 2, 3]);
    });

    it("handles a query with no interpolated values", () => {
        const q = sql`SELECT now()`;
        expect(q.text).toBe("SELECT now()");
        expect(q.params).toEqual([]);
    });

    it("keeps an injection payload as a bound parameter, not SQL text", () => {
        const evil = "'; DROP TABLE users; --";
        const q = sql`SELECT * FROM users WHERE name = ${evil}`;
        expect(q.text).toBe("SELECT * FROM users WHERE name = $1");
        expect(q.params).toEqual([evil]);
        // The dangerous text appears only in params, never in the SQL.
        expect(q.text).not.toContain("DROP TABLE");
    });
});

describe("sql`` helper — composition", () => {
    const sql = createSqlTag(() => fakeRunner().runner);

    it("inlines a nested fragment and renumbers its placeholders", () => {
        const frag = sql`b = ${2} OR c = ${3}`;
        expect(frag.text).toBe("b = $1 OR c = $2");
        const q = sql`SELECT * FROM t WHERE a = ${1} AND (${frag}) AND d = ${4}`;
        expect(q.text).toBe("SELECT * FROM t WHERE a = $1 AND (b = $2 OR c = $3) AND d = $4");
        expect(q.params).toEqual([1, 2, 3, 4]);
    });

    it("composes several fragments in order", () => {
        const a = sql`status = ${"OVERDUE"}`;
        const b = sql`amount > ${100}`;
        const q = sql`SELECT 1 WHERE ${a} AND ${b}`;
        expect(q.text).toBe("SELECT 1 WHERE status = $1 AND amount > $2");
        expect(q.params).toEqual(["OVERDUE", 100]);
    });

    it("never binds a SqlQuery as a value", () => {
        const q = sql`x ${sql`y = ${1}`}`;
        expect(q.params).toEqual([1]);
        expect(q.params.some((p) => p instanceof SqlQuery)).toBe(false);
    });

    it("leaves a literal $n inside a composed fragment untouched (no regex renumbering)", () => {
        // A currency-style literal '$5 fee' must survive composition after a prior
        // parameter — placeholders are assigned structurally, not by rewriting text.
        const frag = sql`amount > ${100} AND note = '$5 fee'`;
        expect(frag.text).toBe("amount > $1 AND note = '$5 fee'");
        const q = sql`SELECT * FROM t WHERE tenant_id = ${"tid"} AND (${frag})`;
        expect(q.text).toBe("SELECT * FROM t WHERE tenant_id = $1 AND (amount > $2 AND note = '$5 fee')");
        expect(q.params).toEqual(["tid", 100]);
    });

    it("numbers placeholders correctly through nested fragments", () => {
        const inner = sql`c = ${3}`;
        const middle = sql`b = ${2} AND (${inner})`;
        const q = sql`a = ${1} AND (${middle}) AND d = ${4}`;
        expect(q.text).toBe("a = $1 AND (b = $2 AND (c = $3)) AND d = $4");
        expect(q.params).toEqual([1, 2, 3, 4]);
    });

    it("composes an identifier() as quoted SQL text, contributing no parameters", () => {
        const q = sql`SELECT ${identifier("fee_plans", "id")} FROM ${identifier("fee_plans")} WHERE ${identifier("fee_plans", "tenant_id")} = ${"t"}`;
        expect(q.text).toBe('SELECT "fee_plans"."id" FROM "fee_plans" WHERE "fee_plans"."tenant_id" = $1');
        expect(q.params).toEqual(["t"]);
    });

    it("rejects an unsafe identifier part and cannot be executed on its own", async () => {
        expect(() => identifier("fee_plans; DROP TABLE x")).toThrow(/Unsafe SQL identifier/);
        expect(() => identifier()).toThrow(/at least one name part/);
        await expect(identifier("fee_plans", "id").rows()).rejects.toThrow(/not executable on its own/);
    });
});

describe("sql`` helper — execution", () => {
    it("await resolves to the runner's rows", async () => {
        const { runner, calls } = fakeRunner([{ id: "a" }, { id: "b" }]);
        const sql = createSqlTag(() => runner);
        const rows = await sql<{ id: string }>`SELECT id FROM t WHERE k = ${1}`;
        expect(rows).toEqual([{ id: "a" }, { id: "b" }]);
        expect(calls).toEqual([{ text: "SELECT id FROM t WHERE k = $1", params: [1] }]);
    });

    it("one() returns the single row, throws on 0 or many", async () => {
        await expect(createSqlTag(() => fakeRunner([{ id: "x" }]).runner)`SELECT 1`.one()).resolves.toEqual({ id: "x" });
        await expect(createSqlTag(() => fakeRunner([]).runner)`SELECT 1`.one()).rejects.toThrow(/exactly one row/);
        await expect(
            createSqlTag(() => fakeRunner([{ id: "x" }, { id: "y" }]).runner)`SELECT 1`.one(),
        ).rejects.toThrow(/exactly one row/);
    });

    it("maybeOne() returns null for 0, the row for 1, throws on many", async () => {
        await expect(createSqlTag(() => fakeRunner([]).runner)`SELECT 1`.maybeOne()).resolves.toBeNull();
        await expect(createSqlTag(() => fakeRunner([{ id: "x" }]).runner)`SELECT 1`.maybeOne()).resolves.toEqual({ id: "x" });
        await expect(
            createSqlTag(() => fakeRunner([{ id: "x" }, { id: "y" }]).runner)`SELECT 1`.maybeOne(),
        ).rejects.toThrow(/at most one row/);
    });

    it("execute() returns the affected row count", async () => {
        const sql = createSqlTag(() => fakeRunner([], 5).runner);
        await expect(sql`UPDATE t SET x = ${1}`.execute()).resolves.toBe(5);
    });

    it("uses an explicit client over the default runner when provided", async () => {
        const def = fakeRunner([{ from: "pool" }]);
        const client = fakeRunner([{ from: "client" }]);
        const sql = createSqlTag(() => def.runner);
        const rows = await sql<{ from: string }>`SELECT 1`.rows(client.runner);
        expect(rows).toEqual([{ from: "client" }]);
        expect(def.calls).toHaveLength(0);
        expect(client.calls).toHaveLength(1);
    });

    it("sqlFor(client) binds every statement to that client (transaction safety)", async () => {
        const poolRunner = fakeRunner([{ from: "pool" }]);
        const client = fakeRunner([{ from: "client" }]);
        const sql = sqlFor(client.runner);
        const rows = await sql<{ from: string }>`INSERT INTO audit_logs VALUES (${1})`;
        expect(rows).toEqual([{ from: "client" }]);
        expect(client.calls).toEqual([{ text: "INSERT INTO audit_logs VALUES ($1)", params: [1] }]);
        expect(poolRunner.calls).toHaveLength(0);
    });

    it("resolves the default runner lazily, per execution", async () => {
        let current = fakeRunner([{ n: 1 }]);
        const sql = createSqlTag(() => current.runner);
        const q = sql<{ n: number }>`SELECT 1`;
        expect(await q).toEqual([{ n: 1 }]);
        current = fakeRunner([{ n: 2 }]); // swap the runner after building the query
        expect(await q).toEqual([{ n: 2 }]);
    });
});
