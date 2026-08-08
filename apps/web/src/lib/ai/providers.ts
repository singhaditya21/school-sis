import type { LanguageModel } from 'ai';
import type { AiPricing } from '@/lib/ai/budget';

export type CopilotProviderConfig = Readonly<{
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  pricing: AiPricing;
}>;

export type CopilotProviderPlan = Readonly<{
  primary: CopilotProviderConfig;
  fallback?: CopilotProviderConfig;
}>;

export type AgentProxyMetering = Readonly<{
  provider: string;
  model: string;
  pricing: AiPricing;
}>;

function positivePrice(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 10_000) {
    throw new Error(`${name} must be a positive USD-per-million-token price.`);
  }
  return value;
}

export function loadCopilotProviderPlan(env: NodeJS.ProcessEnv = process.env): CopilotProviderPlan {
  const primaryKey = env.CEREBRAS_API_KEY;
  if (!primaryKey) throw new Error('Copilot provider is not configured.');

  const primary: CopilotProviderConfig = {
    name: 'cerebras',
    apiKey: primaryKey,
    baseUrl: env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
    model: env.COPILOT_PRIMARY_MODEL || 'llama3.1-8b',
    pricing: {
      inputUsdPerMillionTokens: positivePrice(env, 'COPILOT_PRIMARY_INPUT_USD_PER_MILLION', 1),
      outputUsdPerMillionTokens: positivePrice(env, 'COPILOT_PRIMARY_OUTPUT_USD_PER_MILLION', 1),
    },
  };

  const fallbackParts = [
    env.COPILOT_FALLBACK_API_KEY,
    env.COPILOT_FALLBACK_BASE_URL,
    env.COPILOT_FALLBACK_MODEL,
  ];
  const configuredFallbackParts = fallbackParts.filter(Boolean).length;
  if (configuredFallbackParts > 0 && configuredFallbackParts < fallbackParts.length) {
    throw new Error(
      'Copilot fallback requires COPILOT_FALLBACK_API_KEY, COPILOT_FALLBACK_BASE_URL, and COPILOT_FALLBACK_MODEL.',
    );
  }

  const fallback = configuredFallbackParts === fallbackParts.length
    ? {
      name: env.COPILOT_FALLBACK_PROVIDER_NAME || 'openai-compatible-fallback',
      apiKey: fallbackParts[0]!,
      baseUrl: fallbackParts[1]!,
      model: fallbackParts[2]!,
      pricing: {
        inputUsdPerMillionTokens: positivePrice(env, 'COPILOT_FALLBACK_INPUT_USD_PER_MILLION', 5),
        outputUsdPerMillionTokens: positivePrice(env, 'COPILOT_FALLBACK_OUTPUT_USD_PER_MILLION', 5),
      },
    }
    : undefined;

  return { primary, fallback };
}

export function loadAgentProxyMetering(env: NodeJS.ProcessEnv = process.env): AgentProxyMetering {
  return {
    provider: env.AGENT_PROVIDER_NAME || 'external-agent-service',
    model: env.AGENT_MODEL_NAME || 'upstream-managed',
    pricing: {
      inputUsdPerMillionTokens: positivePrice(env, 'AGENT_INPUT_USD_PER_MILLION', 5),
      outputUsdPerMillionTokens: positivePrice(env, 'AGENT_OUTPUT_USD_PER_MILLION', 5),
    },
  };
}

type ProviderSelection = {
  name: string;
  model: string;
  usedFallback: boolean;
};

export type FallbackModel = Readonly<{
  model: LanguageModel;
  selection: () => ProviderSelection;
}>;

function statusCodeFrom(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as {
    statusCode?: unknown;
    status?: unknown;
    response?: { status?: unknown };
    cause?: unknown;
  };
  for (const value of [candidate.statusCode, candidate.status, candidate.response?.status]) {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
  }
  return candidate.cause && candidate.cause !== error ? statusCodeFrom(candidate.cause) : null;
}

export function isRetryableProviderFailure(error: unknown): boolean {
  const statusCode = statusCodeFrom(error);
  if (statusCode !== null) {
    return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
  }
  if (!(error instanceof Error)) return false;
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();
  return error instanceof TypeError
    || name.includes('timeout')
    || name.includes('network')
    || /\b(?:econnreset|econnrefused|etimedout|enotfound|socket hang up)\b/.test(message);
}

/**
 * The AI SDK waits for provider response headers inside doStream/doGenerate.
 * Retrying at this boundary therefore falls back only before response bytes are
 * exposed to the caller; an interrupted mid-stream response is never replayed.
 */
export function createFallbackLanguageModel(input: {
  primary: { model: LanguageModel; name: string; modelId: string };
  fallback?: { model: LanguageModel; name: string; modelId: string };
  onFallback?: (error: unknown) => void;
}): FallbackModel {
  let selection: ProviderSelection = {
    name: input.primary.name,
    model: input.primary.modelId,
    usedFallback: false,
  };

  if (!input.fallback) {
    return { model: input.primary.model, selection: () => selection };
  }

  const primary = input.primary.model;
  const fallback = input.fallback;
  if (typeof primary === 'string' || typeof fallback.model === 'string') {
    throw new Error('Fallback models must be resolved language-model instances.');
  }

  const proxy = new Proxy(primary as object, {
    get(target, property, receiver) {
      if (property !== 'doStream' && property !== 'doGenerate') {
        return Reflect.get(target, property, receiver);
      }

      const primaryMethod = Reflect.get(target, property, receiver);
      const fallbackMethod = Reflect.get(fallback.model as object, property, fallback.model);
      if (typeof primaryMethod !== 'function' || typeof fallbackMethod !== 'function') {
        return primaryMethod;
      }

      return async (...args: unknown[]) => {
        selection = {
          name: input.primary.name,
          model: input.primary.modelId,
          usedFallback: false,
        };
        try {
          return await Reflect.apply(primaryMethod, target, args);
        } catch (error) {
          if (!isRetryableProviderFailure(error)) throw error;
          input.onFallback?.(error);
          selection = {
            name: fallback.name,
            model: fallback.modelId,
            usedFallback: true,
          };
          return Reflect.apply(fallbackMethod, fallback.model as object, args);
        }
      };
    },
  }) as LanguageModel;

  return { model: proxy, selection: () => selection };
}
