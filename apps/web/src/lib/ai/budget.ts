import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTenant } from '@/lib/db';

const MICRO_USD_PER_USD = 1_000_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 800;

export type AiPricing = Readonly<{
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}>;

export type AiBudgetPolicy = Readonly<{
  tenantMonthlyTokens: number;
  tenantMonthlyCostMicrousd: number;
  userMonthlyTokens: number;
  userMonthlyCostMicrousd: number;
  maxOutputTokens: number;
}>;

export type AiBudgetEstimate = Readonly<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicrousd: number;
}>;

export type AiBudgetReservation = Readonly<{
  requestId: string;
  tenantId: string;
  userId: string;
  periodStart: string;
  estimate: AiBudgetEstimate;
  provider: string;
  model: string;
  agentType: string;
  startedAt: number;
}>;

type BudgetScope = 'TENANT' | 'USER';

export class AiBudgetExceededError extends Error {
  constructor(readonly scope: BudgetScope) {
    super(`${scope.toLowerCase()} monthly AI budget is exhausted.`);
    this.name = 'AiBudgetExceededError';
  }
}

function positiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be a positive integer no greater than ${maximum}.`);
  }
  return parsed;
}

function positiveUsd(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000) {
    throw new Error(`${name} must be a positive USD amount.`);
  }
  return parsed;
}

export function loadAiBudgetPolicy(env: NodeJS.ProcessEnv = process.env): AiBudgetPolicy {
  const policy = {
    tenantMonthlyTokens: positiveInteger(env, 'AI_TENANT_MONTHLY_TOKEN_BUDGET', 5_000_000),
    tenantMonthlyCostMicrousd: Math.round(
      positiveUsd(env, 'AI_TENANT_MONTHLY_COST_USD', 50) * MICRO_USD_PER_USD,
    ),
    userMonthlyTokens: positiveInteger(env, 'AI_USER_MONTHLY_TOKEN_BUDGET', 250_000),
    userMonthlyCostMicrousd: Math.round(
      positiveUsd(env, 'AI_USER_MONTHLY_COST_USD', 5) * MICRO_USD_PER_USD,
    ),
    maxOutputTokens: positiveInteger(env, 'AI_MAX_OUTPUT_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS, 4_096),
  } satisfies AiBudgetPolicy;

  if (policy.userMonthlyTokens > policy.tenantMonthlyTokens) {
    throw new Error('AI_USER_MONTHLY_TOKEN_BUDGET cannot exceed the tenant budget.');
  }
  if (policy.userMonthlyCostMicrousd > policy.tenantMonthlyCostMicrousd) {
    throw new Error('AI_USER_MONTHLY_COST_USD cannot exceed the tenant budget.');
  }
  return policy;
}

/**
 * UTF-8 bytes are a conservative upper bound for the supported provider
 * tokenizers. The extra framing allowance covers provider/tool serialization.
 */
export function estimateInputTokens(text: string): number {
  return Math.max(1, Buffer.byteLength(text, 'utf8') + 256);
}

export function estimateAiBudget(
  promptAndContext: string,
  maxOutputTokens: number,
  providerPrices: readonly AiPricing[],
): AiBudgetEstimate {
  if (providerPrices.length === 0) throw new Error('At least one AI price schedule is required.');
  const inputTokens = estimateInputTokens(promptAndContext);
  const outputTokens = maxOutputTokens;
  const costMicrousd = Math.max(...providerPrices.map((pricing) => Math.ceil(
    inputTokens * pricing.inputUsdPerMillionTokens
      + outputTokens * pricing.outputUsdPerMillionTokens,
  )));

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costMicrousd,
  };
}

function periodStartUtc(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

async function reserveScope(
  client: PoolClient,
  input: {
    tenantId: string;
    scopeKind: BudgetScope;
    scopeId: string;
    periodStart: string;
    estimate: AiBudgetEstimate;
    tokenLimit: number;
    costLimitMicrousd: number;
  },
): Promise<void> {
  if (input.estimate.totalTokens > input.tokenLimit || input.estimate.costMicrousd > input.costLimitMicrousd) {
    throw new AiBudgetExceededError(input.scopeKind);
  }

  const result = await client.query(
    `INSERT INTO ai_budget_usage (
       tenant_id, scope_kind, scope_id, period_start,
       reserved_tokens, reserved_cost_microusd
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (scope_kind, scope_id, period_start) DO UPDATE SET
       reserved_tokens = ai_budget_usage.reserved_tokens + EXCLUDED.reserved_tokens,
       reserved_cost_microusd = ai_budget_usage.reserved_cost_microusd + EXCLUDED.reserved_cost_microusd,
       updated_at = NOW()
     WHERE ai_budget_usage.tenant_id = EXCLUDED.tenant_id
       AND ai_budget_usage.used_tokens + ai_budget_usage.reserved_tokens + EXCLUDED.reserved_tokens <= $7
       AND ai_budget_usage.used_cost_microusd + ai_budget_usage.reserved_cost_microusd
           + EXCLUDED.reserved_cost_microusd <= $8
     RETURNING id`,
    [
      input.tenantId,
      input.scopeKind,
      input.scopeId,
      input.periodStart,
      input.estimate.totalTokens,
      input.estimate.costMicrousd,
      input.tokenLimit,
      input.costLimitMicrousd,
    ],
  );

  if (result.rowCount !== 1) throw new AiBudgetExceededError(input.scopeKind);
}

export async function reserveAiBudget(input: {
  tenantId: string;
  userId: string;
  estimate: AiBudgetEstimate;
  policy: AiBudgetPolicy;
  provider: string;
  model: string;
  agentType: string;
}): Promise<AiBudgetReservation> {
  const requestId = randomUUID();
  const periodStart = periodStartUtc();
  const startedAt = Date.now();

  await withTenant(input.tenantId, async (client) => {
    const tenant = await client.query<{ company_id: string | null }>(
      'SELECT company_id FROM tenants WHERE id = $1',
      [input.tenantId],
    );
    const companyId = tenant.rows[0]?.company_id;
    if (!companyId) throw new Error('AI governance requires the tenant to belong to a company.');

    await reserveScope(client, {
      tenantId: input.tenantId,
      scopeKind: 'TENANT',
      scopeId: input.tenantId,
      periodStart,
      estimate: input.estimate,
      tokenLimit: input.policy.tenantMonthlyTokens,
      costLimitMicrousd: input.policy.tenantMonthlyCostMicrousd,
    });
    await reserveScope(client, {
      tenantId: input.tenantId,
      scopeKind: 'USER',
      scopeId: input.userId,
      periodStart,
      estimate: input.estimate,
      tokenLimit: input.policy.userMonthlyTokens,
      costLimitMicrousd: input.policy.userMonthlyCostMicrousd,
    });

    await client.query(
      `INSERT INTO ai_token_logs (
         id, request_id, company_id, tenant_id, user_id, agent_type,
         provider, model, tokens_used, input_tokens, output_tokens,
         compute_cost_ms, query_cost_usd, request_status
       ) VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, 'RESERVED')`,
      [
        requestId,
        companyId,
        input.tenantId,
        input.userId,
        input.agentType,
        input.provider,
        input.model,
        input.estimate.totalTokens,
        input.estimate.inputTokens,
        input.estimate.outputTokens,
        (input.estimate.costMicrousd / MICRO_USD_PER_USD).toFixed(6),
      ],
    );
  });

  return {
    requestId,
    tenantId: input.tenantId,
    userId: input.userId,
    periodStart,
    estimate: input.estimate,
    provider: input.provider,
    model: input.model,
    agentType: input.agentType,
    startedAt,
  };
}

export function actualAiCostMicrousd(
  inputTokens: number,
  outputTokens: number,
  pricing: AiPricing,
): number {
  return Math.ceil(
    Math.max(0, inputTokens) * pricing.inputUsdPerMillionTokens
      + Math.max(0, outputTokens) * pricing.outputUsdPerMillionTokens,
  );
}

export async function settleAiBudget(input: {
  reservation: AiBudgetReservation;
  inputTokens?: number;
  outputTokens?: number;
  costMicrousd?: number;
  provider?: string;
  model?: string;
  status?: 'COMPLETED' | 'FAILED' | 'ABORTED';
  failureReason?: string;
}): Promise<void> {
  const reservation = input.reservation;
  const inputTokens = input.inputTokens ?? reservation.estimate.inputTokens;
  const outputTokens = input.outputTokens ?? reservation.estimate.outputTokens;
  const totalTokens = Math.max(0, inputTokens) + Math.max(0, outputTokens);
  const costMicrousd = Math.max(0, input.costMicrousd ?? reservation.estimate.costMicrousd);
  const status = input.status ?? 'COMPLETED';

  await withTenant(reservation.tenantId, async (client) => {
    const claimed = await client.query(
      `UPDATE ai_token_logs SET
         provider = $2,
         model = $3,
         tokens_used = $4,
         input_tokens = $5,
         output_tokens = $6,
         compute_cost_ms = $7,
         query_cost_usd = $8,
         request_status = $9,
         failure_reason = $10
       WHERE request_id = $1 AND tenant_id = $11 AND request_status = 'RESERVED'
       RETURNING id`,
      [
        reservation.requestId,
        input.provider ?? reservation.provider,
        input.model ?? reservation.model,
        totalTokens,
        inputTokens,
        outputTokens,
        Math.max(0, Date.now() - reservation.startedAt),
        (costMicrousd / MICRO_USD_PER_USD).toFixed(6),
        status,
        input.failureReason?.slice(0, 160) ?? null,
        reservation.tenantId,
      ],
    );
    if (claimed.rowCount !== 1) return;

    for (const [scopeKind, scopeId] of [
      ['TENANT', reservation.tenantId],
      ['USER', reservation.userId],
    ] as const) {
      await client.query(
        `UPDATE ai_budget_usage SET
           reserved_tokens = GREATEST(0, reserved_tokens - $1),
           reserved_cost_microusd = GREATEST(0, reserved_cost_microusd - $2),
           used_tokens = used_tokens + $3,
           used_cost_microusd = used_cost_microusd + $4,
           updated_at = NOW()
         WHERE tenant_id = $5 AND scope_kind = $6 AND scope_id = $7 AND period_start = $8`,
        [
          reservation.estimate.totalTokens,
          reservation.estimate.costMicrousd,
          totalTokens,
          costMicrousd,
          reservation.tenantId,
          scopeKind,
          scopeId,
          reservation.periodStart,
        ],
      );
    }
  });
}

export function aiBudgetErrorResponse(error: unknown): Response | null {
  if (!(error instanceof AiBudgetExceededError)) return null;
  return Response.json(
    {
      error: error.message,
      code: 'AI_BUDGET_EXCEEDED',
      scope: error.scope.toLowerCase(),
    },
    {
      status: 429,
      headers: { 'Retry-After': '3600' },
    },
  );
}
