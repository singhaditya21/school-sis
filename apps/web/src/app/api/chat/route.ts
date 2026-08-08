import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/auth/api';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import {
  agentUnavailableResponse,
  ensureAgentServiceConfigured,
  forwardAgentRequest,
} from '@/lib/agents/client';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import {
  aiBudgetErrorResponse,
  estimateAiBudget,
  loadAiBudgetPolicy,
  reserveAiBudget,
  settleAiBudget,
  type AiBudgetReservation,
} from '@/lib/ai/budget';
import { loadAgentProxyMetering } from '@/lib/ai/providers';
import { assessAiPrompt } from '@/lib/ai/safety';

export const dynamic = 'force-dynamic';

const MessageSchema = z.object({
  role: z.string(),
  content: z.string().optional(),
  parts: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
  })).optional(),
});

const ChatSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(50),
});

function latestUserText(messages: z.infer<typeof ChatSchema>['messages']): string {
  const latest = [...messages].reverse().find((message) => message.role === 'user') || messages[messages.length - 1];
  if (latest.content) return latest.content;
  return latest.parts
    ?.filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text)
    .join('\n')
    .trim() || '';
}

export async function POST(req: Request) {
  let reservation: AiBudgetReservation | undefined;
  try {
    const auth = await requireApiAuth([
      'PLATFORM_ADMIN',
      'SUPER_ADMIN',
      'SCHOOL_ADMIN',
      'PRINCIPAL',
      'ACCOUNTANT',
      'ADMISSION_COUNSELOR',
      'TEACHER',
    ]);
    if (auth.ok === false) return auth.response;

    const limitError = await consumeRateLimit(`${auth.context.tenantId}:${auth.context.userId}`, {
      scope: 'ai_chat',
      maxAttempts: 20,
      degradedMaxAttempts: 1,
      endpointClass: 'ai',
      message: 'AI request limit reached. Please try again later.',
    });
    if (limitError) return NextResponse.json({ error: limitError }, { status: 429 });

    const json = await readTenantScopedJson<Record<string, unknown>>(req, auth.context.tenantId);
    if (json.ok === false) return json.response;

    const parsed = ChatSchema.safeParse(json.data);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid chat request' }, { status: 400 });
    }

    const query = latestUserText(parsed.data.messages);
    if (!query) {
      return NextResponse.json({ error: 'Missing chat message' }, { status: 400 });
    }

    const promptAssessment = assessAiPrompt(query);
    if (promptAssessment.allowed === false) {
      return NextResponse.json(
        { error: 'Prompt violates the AI safety policy.', code: 'AI_PROMPT_REJECTED' },
        { status: 400 },
      );
    }

    ensureAgentServiceConfigured('synthesis');
    const policy = loadAiBudgetPolicy();
    const metering = loadAgentProxyMetering();
    const estimate = estimateAiBudget(
      promptAssessment.prompt,
      policy.maxOutputTokens,
      [metering.pricing],
    );
    reservation = await reserveAiBudget({
      tenantId: auth.context.tenantId,
      userId: auth.context.userId,
      estimate,
      policy,
      provider: metering.provider,
      model: metering.model,
      agentType: 'SYNTHESIS_AGENT',
    });

    const response = await forwardAgentRequest(auth.context, '/api/v1/agents/synthesis/query', {
      method: 'POST',
      agentId: 'synthesis',
      body: {
        query: promptAssessment.prompt,
        tenant_id: auth.context.tenantId,
        user_id: auth.context.userId,
      },
    });
    await settleAiBudget({
      reservation,
      status: response.ok ? 'COMPLETED' : 'FAILED',
      failureReason: response.ok ? undefined : `upstream_http_${response.status}`,
    });
    return response;
  } catch (error) {
    if (reservation) {
      await settleAiBudget({
        reservation,
        status: 'FAILED',
        failureReason: error instanceof Error ? error.name : 'upstream_error',
      }).catch(() => undefined);
    }
    const budgetResponse = aiBudgetErrorResponse(error);
    if (budgetResponse) return budgetResponse;
    return agentUnavailableResponse(error);
  }
}
