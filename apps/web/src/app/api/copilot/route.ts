import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { pool, runWithTenantContext } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth/api';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
  actualAiCostMicrousd,
  aiBudgetErrorResponse,
  estimateAiBudget,
  loadAiBudgetPolicy,
  reserveAiBudget,
  settleAiBudget,
  type AiBudgetReservation,
} from '@/lib/ai/budget';
import { createFallbackLanguageModel, loadCopilotProviderPlan } from '@/lib/ai/providers';
import {
  assessAiPrompt,
  buildCopilotSystemPrompt,
  buildTenantMetadataCatalog,
  validateGroundedReportAst,
  type MetadataCatalogRow,
} from '@/lib/ai/safety';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const COPILOT_ROLES = [
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'PRINCIPAL',
  'ACCOUNTANT',
  'ADMISSION_COUNSELOR',
  'TEACHER',
] as const;

const DEFAULT_METADATA_ROLES = ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'] as const;

const CopilotRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
});

const ReportAstSchema = z.object({
  baseObject: z.string().trim().min(1).max(100),
  chartType: z.enum(['BAR', 'PIE', 'LINE', 'DATATABLE']),
  aggregations: z.array(z.object({
    function: z.enum(['COUNT', 'SUM', 'AVG']),
    field: z.string().trim().min(1).max(100),
  })).max(20).optional(),
  filters: z.array(z.object({
    field: z.string().trim().min(1).max(100),
    operator: z.enum(['=', '>', '<', '>=', '<=', '!=', 'ILIKE']),
    value: z.string().max(500),
  })).max(20).optional(),
});

function safeFailureReason(error: unknown): string {
  if (!(error instanceof Error)) return 'provider_error';
  return error.name.slice(0, 160) || 'provider_error';
}

export async function POST(req: Request) {
  let reservation: AiBudgetReservation | undefined;
  try {
    const auth = await requireApiAuth(COPILOT_ROLES);
    if (auth.ok === false) return auth.response;

    const limitError = await consumeRateLimit(`${auth.context.tenantId}:${auth.context.userId}`, {
      scope: 'ai_copilot',
      maxAttempts: 10,
      degradedMaxAttempts: 1,
      endpointClass: 'ai',
      message: 'AI request limit reached. Please try again later.',
    });
    if (limitError) return NextResponse.json({ error: limitError }, { status: 429 });

    const json = await readTenantScopedJson(req, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = CopilotRequestSchema.safeParse(json.data);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid prompt' }, { status: 400 });
    }
    const promptAssessment = assessAiPrompt(parsed.data.prompt);
    if (promptAssessment.allowed === false) {
      logger.warn('ai.prompt_blocked', 'Copilot prompt was rejected by the safety policy', {
        tenantId: auth.context.tenantId,
        actorUserId: auth.context.userId,
        source: 'ai-copilot',
        metadata: { category: promptAssessment.category },
      });
      return NextResponse.json(
        { error: 'Prompt violates the AI safety policy.', code: 'AI_PROMPT_REJECTED' },
        { status: 400 },
      );
    }

    const providerPlan = loadCopilotProviderPlan();
    const policy = loadAiBudgetPolicy();
    const tenantId = auth.context.tenantId;
    const schemaRows = await runWithTenantContext(tenantId, async () => {
      const result = await pool.query<MetadataCatalogRow>(
        `SELECT
           o.tenant_id,
           o.api_name AS object_name,
           COALESCE(
             json_agg(f.api_name ORDER BY f.api_name) FILTER (WHERE f.id IS NOT NULL),
             '[]'::json
           ) AS fields
         FROM metadata_objects o
         LEFT JOIN metadata_fields f
           ON f.object_id = o.id
          AND f.status = 'ACTIVE'
          AND (
            $2 = ANY($3::text[])
            OR EXISTS (
              SELECT 1 FROM field_permissions fp
              WHERE fp.field_id = f.id AND fp.role = $2 AND fp.can_read = TRUE
            )
          )
         WHERE o.tenant_id = $1 AND o.status = 'PUBLISHED'
         GROUP BY o.id, o.tenant_id, o.api_name
         ORDER BY o.api_name`,
        [tenantId, auth.context.role, [...DEFAULT_METADATA_ROLES]],
      );
      return result.rows;
    });
    const catalog = buildTenantMetadataCatalog(schemaRows, tenantId);
    const systemPrompt = buildCopilotSystemPrompt(catalog);
    const estimate = estimateAiBudget(
      `${systemPrompt}\n${promptAssessment.prompt}`,
      policy.maxOutputTokens,
      [providerPlan.primary.pricing, ...(providerPlan.fallback ? [providerPlan.fallback.pricing] : [])],
    );
    reservation = await reserveAiBudget({
      tenantId,
      userId: auth.context.userId,
      estimate,
      policy,
      provider: providerPlan.primary.name,
      model: providerPlan.primary.model,
      agentType: 'REPORT_COPILOT',
    });

    const primaryProvider = createOpenAI({
      apiKey: providerPlan.primary.apiKey,
      baseURL: providerPlan.primary.baseUrl,
    });
    const fallbackProvider = providerPlan.fallback
      ? createOpenAI({
        apiKey: providerPlan.fallback.apiKey,
        baseURL: providerPlan.fallback.baseUrl,
      })
      : undefined;
    const fallbackModel = createFallbackLanguageModel({
      primary: {
        model: primaryProvider(providerPlan.primary.model),
        name: providerPlan.primary.name,
        modelId: providerPlan.primary.model,
      },
      fallback: providerPlan.fallback && fallbackProvider
        ? {
          model: fallbackProvider(providerPlan.fallback.model),
          name: providerPlan.fallback.name,
          modelId: providerPlan.fallback.model,
        }
        : undefined,
      onFallback: (error) => {
        logger.warn('ai.provider_fallback', 'Copilot primary provider failed before streaming; using fallback', {
          tenantId,
          actorUserId: auth.context.userId,
          source: 'ai-copilot',
          metadata: { errorType: safeFailureReason(error) },
        });
      },
    });

    const result = streamText({
      model: fallbackModel.model,
      system: systemPrompt,
      prompt: promptAssessment.prompt,
      temperature: 0,
      maxOutputTokens: policy.maxOutputTokens,
      maxRetries: 0,
      tools: {
        generateReportAst: tool({
          description: 'Create a read-only report AST grounded in the supplied tenant catalog.',
          inputSchema: ReportAstSchema,
          execute: async (config) => {
            const grounded = validateGroundedReportAst(config, catalog);
            if (grounded.ok === false) {
              return { success: false, error: grounded.error };
            }
            return {
              success: true,
              configuration: grounded.configuration,
            };
          },
        }),
      },
      onEnd: async ({ usage }) => {
        const selected = fallbackModel.selection();
        const selectedPricing = selected.usedFallback
          ? providerPlan.fallback!.pricing
          : providerPlan.primary.pricing;
        const inputTokens = usage.inputTokens ?? estimate.inputTokens;
        const outputTokens = usage.outputTokens ?? estimate.outputTokens;
        await settleAiBudget({
          reservation: reservation!,
          inputTokens,
          outputTokens,
          costMicrousd: actualAiCostMicrousd(inputTokens, outputTokens, selectedPricing),
          provider: selected.name,
          model: selected.model,
        });
      },
      onError: async ({ error }) => {
        await settleAiBudget({
          reservation: reservation!,
          status: 'FAILED',
          failureReason: safeFailureReason(error),
        });
      },
      onAbort: async () => {
        await settleAiBudget({
          reservation: reservation!,
          status: 'ABORTED',
          failureReason: 'client_aborted',
        });
      },
    });

    return result.toTextStreamResponse({
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (reservation) {
      await settleAiBudget({
        reservation,
        status: 'FAILED',
        failureReason: safeFailureReason(error),
      }).catch(() => undefined);
    }
    const budgetResponse = aiBudgetErrorResponse(error);
    if (budgetResponse) return budgetResponse;
    const status = error instanceof Error && error.message.toLowerCase().includes('configured') ? 503 : 500;
    logger.error('ai.copilot_failed', 'Copilot request failed', {
      source: 'ai-copilot',
      metadata: { errorType: safeFailureReason(error) },
    });
    return NextResponse.json(
      { error: status === 503 ? 'Copilot provider is not configured' : 'Failed to process request' },
      { status },
    );
  }
}
