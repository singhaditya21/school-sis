import { TenantScope, eq, sql } from "@school-sis/api/src/data";
import type { SqlRunner } from "@school-sis/api/src/db/sql";
import { feePlans, feeComponents, academicYears, invoices } from "@school-sis/api/src/db/generated/tables";

/**
 * The rebuilt tenant-scope layer's whole job is to attach the tenant predicate BY
 * CONSTRUCTION. These assert the generated SQL directly (through a recording runner,
 * no database), pinning that every read/write is scoped and that a value can never
 * reach the SQL text unparameterized.
 */
const TENANT = "11111111-1111-1111-1111-111111111111";

function recordingRunner() {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const runner: SqlRunner = {
        query: (async (text: string, params: unknown[]) => {
            calls.push({ text, params });
            return { rows: [], rowCount: 0, command: "", oid: 0, fields: [] };
        }) as SqlRunner["query"],
    };
    return { runner, calls };
}

describe("tenant-scope SQL generation", () => {
    it("appends the tenant predicate to a direct read", async () => {
        const { runner, calls } = recordingRunner();
        await new TenantScope(TENANT, runner)
            .from(feePlans)
            .select({ id: feePlans.id })
            .where(eq(feePlans.id, "p1"))
            .rows();
        expect(calls[0].text).toBe(
            'SELECT "fee_plans"."id" AS "id" FROM "fee_plans" ' +
                'WHERE ("fee_plans"."tenant_id" = $1 AND ("fee_plans"."id" = $2))',
        );
        expect(calls[0].params).toEqual([TENANT, "p1"]);
    });

    it("scopes a joined table to the tenant too (a join cannot widen)", async () => {
        const { runner, calls } = recordingRunner();
        await new TenantScope(TENANT, runner)
            .from(feePlans)
            .innerJoin(academicYears, eq(academicYears.id, feePlans.academicYearId))
            .select({ name: academicYears.name })
            .rows();
        expect(calls[0].text).toContain(
            'INNER JOIN "academic_years" ON ' +
                '"academic_years"."id" = "fee_plans"."academic_year_id" AND "academic_years"."tenant_id" = $1',
        );
        expect(calls[0].text).toContain('WHERE "fee_plans"."tenant_id" = $2');
        expect(calls[0].params).toEqual([TENANT, TENANT]);
    });

    it("reaches a tenant-less child only through the parent's tenant predicate", async () => {
        const { runner, calls } = recordingRunner();
        await new TenantScope(TENANT, runner)
            .fromChild(feeComponents, { parent: feePlans, on: eq(feeComponents.feePlanId, feePlans.id) })
            .select({ id: feeComponents.id })
            .rows();
        expect(calls[0].text).toBe(
            'SELECT "fee_components"."id" AS "id" FROM "fee_components" ' +
                'INNER JOIN "fee_plans" ON ' +
                '"fee_components"."fee_plan_id" = "fee_plans"."id" AND "fee_plans"."tenant_id" = $1',
        );
        expect(calls[0].params).toEqual([TENANT]);
    });

    it("supplies tenant_id on INSERT and never lets the caller override it", async () => {
        const { runner, calls } = recordingRunner();
        await new TenantScope(TENANT, runner).insert(invoices, {
            id: "i1",
            studentId: "s1",
            tenantId: "SPOOFED",
        });
        expect(calls[0].text).toBe(
            'INSERT INTO "invoices" ("id", "student_id", "tenant_id") VALUES ($1, $2, $3)',
        );
        // The scope's tenant wins — the caller-supplied "SPOOFED" is discarded.
        expect(calls[0].params).toEqual(["i1", "s1", TENANT]);
    });

    it("restricts UPDATE and DELETE to the tenant", async () => {
        const update = recordingRunner();
        await new TenantScope(TENANT, update.runner).update(invoices, { paidAmount: "5" }, eq(invoices.id, "i1"));
        expect(update.calls[0].text).toBe(
            'UPDATE "invoices" SET "paid_amount" = $1 WHERE ("invoices"."tenant_id" = $2 AND ("invoices"."id" = $3))',
        );
        expect(update.calls[0].params).toEqual(["5", TENANT, "i1"]);

        const del = recordingRunner();
        await new TenantScope(TENANT, del.runner).delete(invoices, eq(invoices.id, "i1"));
        expect(del.calls[0].text).toBe(
            'DELETE FROM "invoices" WHERE ("invoices"."tenant_id" = $1 AND ("invoices"."id" = $2))',
        );
        expect(del.calls[0].params).toEqual([TENANT, "i1"]);
    });

    it("claims a row under the tenant predicate before minting an OwnedRow", async () => {
        const { runner, calls } = recordingRunner();
        await new TenantScope(TENANT, runner).claim(feePlans, "p1", { forUpdate: true });
        expect(calls[0].text).toContain('FROM "fee_plans" WHERE ("fee_plans"."tenant_id" = $1 AND ("fee_plans"."id" = $2))');
        // `first()` adds LIMIT (param 1), then the locking clause — valid Postgres order.
        expect(calls[0].text).toContain("LIMIT $3 FOR UPDATE");
        expect(calls[0].params).toEqual([TENANT, "p1", 1]);
    });

    it("keeps a value a bound parameter even when it looks like SQL", async () => {
        const { runner, calls } = recordingRunner();
        await new TenantScope(TENANT, runner)
            .from(invoices)
            .select({ id: invoices.id })
            .where(eq(invoices.invoiceNumber, "'; DROP TABLE invoices; --"))
            .rows();
        expect(calls[0].text).not.toContain("DROP TABLE");
        expect(calls[0].params).toContain("'; DROP TABLE invoices; --");
    });

    it("raw() refuses to run without the tenant() predicate", async () => {
        const { runner } = recordingRunner();
        const scope = new TenantScope(TENANT, runner);
        await expect(
            scope.raw((_tenant, sql) => sql`SELECT 1 FROM "invoices"`),
        ).rejects.toThrow(/without the tenant\(\) predicate/);
    });

    // ─── Review-hardening regressions ────────────────────────────

    it("parenthesises a raw OR predicate so it cannot escape the tenant AND", async () => {
        const { runner, calls } = recordingRunner();
        await new TenantScope(TENANT, runner)
            .from(invoices)
            .select({ id: invoices.id })
            .where(sql`${invoices.paidAmount} = 0 OR ${invoices.status} = 'DRAFT'`)
            .rows();
        expect(calls[0].text).toContain(
            'WHERE ("invoices"."tenant_id" = $1 AND ("invoices"."paid_amount" = 0 OR "invoices"."status" = \'DRAFT\'))',
        );
    });

    it("wraps a raw OR predicate in UPDATE too", async () => {
        const { runner, calls } = recordingRunner();
        await new TenantScope(TENANT, runner).update(
            invoices,
            { status: "VOID" },
            sql`${invoices.status} = 'PENDING' OR ${invoices.paidAmount} = 0`,
        );
        expect(calls[0].text).toContain(
            'WHERE ("invoices"."tenant_id" = $2 AND ("invoices"."status" = \'PENDING\' OR "invoices"."paid_amount" = 0))',
        );
    });

    it("rejects a child write with an OwnedRow minted by a different tenant scope", async () => {
        const TENANT_B = "22222222-2222-2222-2222-222222222222";
        const claimRunner: SqlRunner = {
            query: (async () => ({ rows: [{ id: "planA" }], rowCount: 1, command: "", oid: 0, fields: [] })) as SqlRunner["query"],
        };
        const owned = await new TenantScope(TENANT, claimRunner).claim(feePlans, "planA");
        expect(owned).not.toBeNull();
        const { runner } = recordingRunner();
        await expect(
            new TenantScope(TENANT_B, runner).childInsert(feeComponents, owned!, "feePlanId", { name: "x" }),
        ).rejects.toThrow(/different tenant scope/);
    });

    it("raw() throws when tenant() is called but its fragment is discarded", async () => {
        const { runner } = recordingRunner();
        const scope = new TenantScope(TENANT, runner);
        await expect(
            scope.raw((tenant, sql) => {
                tenant("invoices"); // called, but the fragment is thrown away
                return sql`SELECT count(*) FROM "invoices"`;
            }),
        ).rejects.toThrow(/without the tenant\(\) predicate/);
    });
});
