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
const RELATION_CLAUSE_RE =
    /\b(from|join)\s+(?:only\s+)?(?:"?([a-z_][a-z0-9_]*)"?\.)?"?([a-z_][a-z0-9_]*)"?(?:\s+(?:as\s+)?(?!(?:on|using|where|join|inner|left|right|full|cross|lateral|natural|group|order|having|limit|offset|union|intersect|except|window|fetch|for)\b)"?([a-z_][a-z0-9_]*)"?)?/gi;
const SUBQUERY_RELATION_RE = /\b(?:from|join)\s*\(/i;
const COMMA_JOIN_RE =
    /\bfrom\s+(?:only\s+)?(?:"?[a-z_][a-z0-9_]*"?\.)?"?[a-z_][a-z0-9_]*"?(?:\s+(?:as\s+)?(?!(?:on|using|where|join|inner|left|right|full|cross|lateral|natural|group|order|having|limit|offset|union|intersect|except|window|fetch|for)\b)"?[a-z_][a-z0-9_]*"?)?\s*,/i;
const QUALIFIED_TENANT_PREDICATE_RE =
    /(?:^|[\s(,])(?:(?:"?([a-z_][a-z0-9_]*)"?)\.)?tenant_id\s*=\s*\$1(?![0-9])/gi;

/** Relations that legitimately carry no tenant predicate because they are inline. */
const NON_TENANT_RELATIONS = new Set(['lateral', 'unnest', 'generate_series']);

export interface TenantQueryAudit {
    relations: string[];
    tenantPredicates: number;
    limited: boolean;
}

function stripSqlCommentsAndLiterals(rawSql: string): string {
    let out = '';
    let i = 0;
    const len = rawSql.length;

    while (i < len) {
        const ch = rawSql[i];
        const next = i + 1 < len ? rawSql[i + 1] : '';

        // Line comment: -- ... \n
        if (ch === '-' && next === '-') {
            out += ' ';
            i += 2;
            while (i < len && rawSql[i] !== '\n') {
                i += 1;
            }
            continue;
        }

        // Block comment (supports PostgreSQL nested /* ... */ comments)
        if (ch === '/' && next === '*') {
            out += ' ';
            i += 2;
            let depth = 1;
            while (i < len && depth > 0) {
                if (rawSql[i] === '/' && rawSql[i + 1] === '*') {
                    depth += 1;
                    i += 2;
                } else if (rawSql[i] === '*' && rawSql[i + 1] === '/') {
                    depth -= 1;
                    i += 2;
                } else {
                    i += 1;
                }
            }
            if (depth > 0) {
                throw new AiTenantScopeError('Unterminated SQL block comment.');
            }
            continue;
        }

        // Single-quoted string literal: mask contents so literals cannot spoof predicates or hide semicolons
        if (ch === "'") {
            out += "''";
            i += 1;
            let closed = false;
            while (i < len) {
                if (rawSql[i] === "'") {
                    if (rawSql[i + 1] === "'") {
                        i += 2;
                        continue;
                    }
                    i += 1;
                    closed = true;
                    break;
                }
                i += 1;
            }
            if (!closed) {
                throw new AiTenantScopeError('Unterminated SQL string literal.');
            }
            continue;
        }

        // Reject dollar-quoted strings ($$...$$ or $tag$...$tag$) while preserving $1, $2 parameters
        if (ch === '$' && (next === '$' || /[a-z_]/i.test(next))) {
            throw new AiTenantScopeError('Dollar-quoted SQL strings are not allowed in AI queries.');
        }

        // Double-quoted identifier: preserve identifier characters
        if (ch === '"') {
            out += '"';
            i += 1;
            let closed = false;
            while (i < len) {
                const idCh = rawSql[i];
                out += idCh;
                i += 1;
                if (idCh === '"') {
                    if (rawSql[i] === '"') {
                        out += '"';
                        i += 1;
                        continue;
                    }
                    closed = true;
                    break;
                }
            }
            if (!closed) {
                throw new AiTenantScopeError('Unterminated SQL quoted identifier.');
            }
            continue;
        }

        out += ch;
        i += 1;
    }

    return out;
}

/**
 * Statically validate a read-only, tenant-scoped statement. Exported so the test
 * suite can assert the rules directly without a database.
 */
export function auditTenantScopedSql(sql: string): TenantQueryAudit {
    const normalized = stripSqlCommentsAndLiterals(sql).replace(/\s+/g, ' ').trim();

    if (!/^(select|with)\b/i.test(normalized)) {
        throw new AiTenantScopeError('AI tools may only run SELECT statements.');
    }
    if (FORBIDDEN_STATEMENTS.test(normalized)) {
        throw new AiTenantScopeError('AI tool SQL may not contain a data-modifying keyword.');
    }
    if (normalized.includes(';')) {
        throw new AiTenantScopeError('AI tool SQL may not contain multiple statements.');
    }
    if (SUBQUERY_RELATION_RE.test(normalized)) {
        throw new AiTenantScopeError('Every relation must be tenant-scoped directly without inline subquery relations.');
    }
    if (COMMA_JOIN_RE.test(normalized)) {
        throw new AiTenantScopeError('Every relation must be tenant-scoped via explicit JOINs, not comma joins.');
    }

    const cteNames = new Set<string>();
    if (/^with\b/i.test(normalized)) {
        for (const cteMatch of normalized.matchAll(/\b(?:with|,)\s+"?([a-z_][a-z0-9_]*)"?\s+as\s*\(/gi)) {
            cteNames.add(cteMatch[1].toLowerCase());
        }
    }

    const parsedRelations: Array<{ relation: string; qualifier: string; alias: string | null }> = [];
    for (const match of normalized.matchAll(RELATION_CLAUSE_RE)) {
        const relation = match[3].toLowerCase();
        if (NON_TENANT_RELATIONS.has(relation) || cteNames.has(relation)) continue;
        const alias = match[4] ? match[4].toLowerCase() : null;
        parsedRelations.push({
            relation,
            qualifier: alias ?? relation,
            alias,
        });
    }

    const relations = parsedRelations.map((entry) => entry.relation);
    if (relations.length === 0) {
        throw new AiTenantScopeError('AI tool SQL must read from at least one relation.');
    }

    const predicateMatches = [...normalized.matchAll(QUALIFIED_TENANT_PREDICATE_RE)];
    const tenantPredicates = predicateMatches.length;
    if (tenantPredicates < relations.length) {
        throw new AiTenantScopeError(
            `Every relation must be tenant-scoped: ${relations.length} relation(s) (${relations.join(', ')}) but only ${tenantPredicates} "tenant_id = $1" predicate(s).`,
        );
    }

    if (parsedRelations.length === 1) {
        const only = parsedRelations[0];
        const validSingle = predicateMatches.some((m) => {
            const qualifier = m[1]?.toLowerCase();
            return !qualifier || qualifier === only.qualifier || qualifier === only.relation;
        });
        if (!validSingle) {
            throw new AiTenantScopeError(
                `Every relation must be tenant-scoped: predicate qualifier does not match ${only.relation}.`,
            );
        }
    } else {
        const qualifiedPredicates = new Set(
            predicateMatches
                .map((m) => m[1]?.toLowerCase())
                .filter((q): q is string => Boolean(q)),
        );
        const seenQualifiers = new Set<string>();
        for (const entry of parsedRelations) {
            if (seenQualifiers.has(entry.qualifier)) {
                throw new AiTenantScopeError(
                    `Every relation must be tenant-scoped with a distinct alias (${entry.qualifier} reused).`,
                );
            }
            seenQualifiers.add(entry.qualifier);
            const matched =
                qualifiedPredicates.has(entry.qualifier) ||
                (!entry.alias && qualifiedPredicates.has(entry.relation));
            if (!matched) {
                throw new AiTenantScopeError(
                    `Every relation must be tenant-scoped: missing "${entry.qualifier}.tenant_id = $1" predicate for ${entry.relation}.`,
                );
            }
        }
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
