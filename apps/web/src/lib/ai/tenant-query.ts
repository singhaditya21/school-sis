/**
 * The only way an AI tool is allowed to touch the database.
 *
 * Tenant isolation for AI is not a convention here — it is enforced three times
 * over, and each layer is independently testable:
 *
 *   1. STATIC: the SQL text is checked before it is sent. Every relation in the
 *      FROM/JOIN list must carry its own `tenant_id = $1` predicate, `$1` must be
 *      the caller's tenant id, the statement must be read-only, and it must be
 *      bounded by a LIMIT.
 *   2. BOUND: `$1` is asserted to be exactly `context.tenantId`, so a tool cannot
 *      smuggle a different tenant in through its arguments.
 *   3. RLS: the query runs inside `runWithTenantContext`, so Postgres row level
 *      security rejects any row that escaped 1 and 2 anyway.
 *
 * A tool that tries to bypass this helper has no other route to the pool — the
 * registry test asserts no tool module imports the pool directly.
 */
import { pool, runWithTenantContext } from '@/lib/db';
import { isValidTenantId } from '@/lib/tenant/isolation';
import type { AiToolContext } from './types';

export class AiTenantScopeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AiTenantScopeError';
    }
}

const FORBIDDEN_STATEMENTS =
    /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|call|do)\b/i;
const RELATION_RE = /\b(?:from|join)\s+(?:only\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
const TENANT_PREDICATE_RE = /(?:^|[\s(.])tenant_id\s*=\s*\$1(?![0-9])/gi;

/** Relations that legitimately carry no tenant predicate because they are inline. */
const NON_TENANT_RELATIONS = new Set(['lateral', 'unnest', 'generate_series']);

export interface TenantQueryAudit {
    relations: string[];
    tenantPredicates: number;
    limited: boolean;
}

/**
 * Statically validate a read-only, tenant-scoped statement. Exported so the test
 * suite can assert the rules directly without a database.
 */
export function auditTenantScopedSql(sql: string): TenantQueryAudit {
    const normalized = sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();

    if (!/^(select|with)\b/i.test(normalized)) {
        throw new AiTenantScopeError('AI tools may only run SELECT statements.');
    }
    if (FORBIDDEN_STATEMENTS.test(normalized)) {
        throw new AiTenantScopeError('AI tool SQL may not contain a data-modifying keyword.');
    }
    if (normalized.includes(';')) {
        throw new AiTenantScopeError('AI tool SQL may not contain multiple statements.');
    }

    const relations: string[] = [];
    for (const match of normalized.matchAll(RELATION_RE)) {
        const relation = match[1].toLowerCase();
        if (NON_TENANT_RELATIONS.has(relation)) continue;
        relations.push(relation);
    }
    if (relations.length === 0) {
        throw new AiTenantScopeError('AI tool SQL must read from at least one relation.');
    }

    const tenantPredicates = [...normalized.matchAll(TENANT_PREDICATE_RE)].length;
    if (tenantPredicates < relations.length) {
        throw new AiTenantScopeError(
            `Every relation must be tenant-scoped: ${relations.length} relation(s) (${relations.join(', ')}) but only ${tenantPredicates} "tenant_id = $1" predicate(s).`,
        );
    }

    const limited = /\blimit\s+(\$\d+|\d+)\b/i.test(normalized);
    if (!limited) {
        throw new AiTenantScopeError('AI tool SQL must be bounded by a LIMIT.');
    }

    return { relations, tenantPredicates, limited };
}

/**
 * Run a tenant-scoped read for an AI tool. `$1` is always the tenant id and is
 * supplied by the server, never by the model.
 */
export async function runTenantScopedRead<TRow extends Record<string, unknown>>(
    context: AiToolContext,
    sql: string,
    params: readonly unknown[] = [],
): Promise<TRow[]> {
    if (!isValidTenantId(context.tenantId)) {
        throw new AiTenantScopeError('AI tool context has no valid tenant id.');
    }
    auditTenantScopedSql(sql);

    if (params.length > 0 && params[0] !== context.tenantId) {
        throw new AiTenantScopeError('AI tool query must bind $1 to the caller tenant id.');
    }

    const bound = params.length > 0 ? params : [context.tenantId];
    return runWithTenantContext(context.tenantId, async () => {
        const { rows } = await pool.query(sql, bound as unknown[]);
        return rows as TRow[];
    });
}
