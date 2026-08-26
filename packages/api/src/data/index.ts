/**
 * packages/api/src/data — the repository layer.
 *
 * ADOPTING THIS FOR THE NEXT DOMAIN
 * ---------------------------------
 * The fee domain (apps/web/src/lib/actions/fees.ts, fee-plans.ts,
 * invoice-generation.ts) is the worked example. To move another domain:
 *
 *  1. Replace `import { pool } from '@/lib/db'` with
 *     `import { tenantScope, ... } from '@school-sis/api/src/data'`.
 *
 *  2. Right after `requireAuth`, open the scope:
 *
 *         const { tenantId } = await requireAuth('<perm>');
 *         const scope = tenantScope(tenantId);
 *
 *     Everything below that line is tenant-scoped by construction.
 *
 *  3. Turn each SQL string into a builder call. Column names come from the
 *     Drizzle schema, so `invoices.amount` — the executive-dashboard bug — is
 *     now a compile error rather than a runtime one:
 *
 *         await scope.from(invoices)
 *             .innerJoin(students, eq(invoices.studentId, students.id))
 *             .select({ id: invoices.id, name: students.firstName })
 *             .where(eq(invoices.status, 'PAID'))
 *             .orderBy(asc(invoices.dueDate))
 *             .rows();
 *
 *  4. A table with no `tenant_id` (check the schema, not your memory) is read
 *     with `scope.fromChild(child, { parent, on })` and written through
 *     `scope.claim(parent, id)` + `scope.childInsert/childUpdate/childDelete`.
 *
 *  5. Aggregates that genuinely resist the builder go through `scope.raw()`,
 *     which hands you a `tenant(alias)` helper and refuses to run without it.
 *
 *  6. Writes that must not half-apply go inside `scope.transaction(async (tx) =>
 *     ...)`; `tx` is a `TenantScope` bound to the same tenant and connection.
 *
 * What NOT to do: do not add a `tenantId` parameter to a helper and hope
 * callers pass it. The point of this layer is that the tenant predicate is
 * attached by the builder, below the level a caller can forget it.
 */

export {
    tenantScope,
    TenantScope,
    ScopedFrom,
    ScopedSelect,
    type ScopedConnection,
    type ScopedFields,
    type ScopedRow,
    type TenantOwnedTable,
    type ClaimableTable,
    type ChildTable,
    type TenantInsert,
    type TenantUpdate,
    type OwnedRow,
} from './tenant-scope';
