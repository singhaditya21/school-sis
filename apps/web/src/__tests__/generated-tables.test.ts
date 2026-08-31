import {
    feePlans,
    FEE_FREQUENCY_VALUES,
    INVOICE_STATUS_VALUES,
    type FeePlansRow,
    type FeePlansInsert,
    type FeeFrequency,
} from "@/lib/db/generated/tables";
import { SqlQuery } from "@/lib/db/sql";

/**
 * Smoke test for the generated schema tables — mainly so tsc compiles the generated
 * file and its shapes stay consistent with the migration chain. `db:types:check`
 * (CI, against the migrated DB) guards staleness; this guards the TypeScript surface.
 */
describe("generated db tables", () => {
    it("exposes enum value arrays that match their union types", () => {
        expect(FEE_FREQUENCY_VALUES).toContain("MONTHLY");
        expect(INVOICE_STATUS_VALUES).toContain("OVERDUE");
        const frequency: FeeFrequency = FEE_FREQUENCY_VALUES[0];
        expect(typeof frequency).toBe("string");
    });

    it("exposes column refs as composable fragments carrying their bare names", () => {
        expect(feePlans.$name).toBe("fee_plans");
        expect(feePlans.id).toBeInstanceOf(SqlQuery);
        expect(feePlans.id.text).toBe('"fee_plans"."id"');
        expect(feePlans.tenantId.text).toBe('"fee_plans"."tenant_id"');
        // The bare table/column names, for building INSERT/UPDATE column lists.
        expect(feePlans.tenantId.column).toBe("tenant_id");
        expect(feePlans.academicYearId.column).toBe("academic_year_id");
        expect(feePlans.id.table).toBe("fee_plans");
    });

    it("has Row/Insert types with the expected shape", () => {
        const row: FeePlansRow = {
            id: "p1",
            tenantId: "t1",
            academicYearId: "y1",
            name: "Plan",
            description: null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            ownerId: null,
            groupId: null,
        };
        // Insert allows omitting defaulted/nullable columns.
        const insert: FeePlansInsert = { tenantId: "t1", academicYearId: "y1", name: "Plan" };
        expect(row.name).toBe("Plan");
        expect(insert.name).toBe("Plan");
    });
});
