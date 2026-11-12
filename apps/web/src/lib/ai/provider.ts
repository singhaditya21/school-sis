/**
 * Model provider resolution, and honest degradation when there is none.
 *
 * Supports both zero-cost open-weight / free-tier OpenAI-compatible providers
 * (Cerebras, Groq Llama 3.3, Google Gemini Free Tier, self-hosted Ollama) and OpenAI.
 *
 * If no provider is configured the assistant says exactly that. It does not fall
 * back to a canned answer, a keyword matcher, or a "best guess" — a school
 * information system that invents an attendance figure is worse than one that
 * says it cannot answer.
 *
 * This module stays free of the AI SDK import on purpose: provider *policy* is
 * plain configuration that any surface (or test) can read without pulling an ESM
 * model client in. The client itself is built in runtime.ts.
 */
export interface AiProviderConfig {
    apiKey: string;
    baseURL: string;
    model: string;
    /** Which env var supplied the provider — surfaced in the UI, never the key itself. */
    source:
        | 'CEREBRAS_API_KEY'
        | 'GROQ_API_KEY'
        | 'GEMINI_API_KEY'
        | 'OPENAI_API_KEY'
        | 'OLLAMA_BASE_URL';
}

/**
 * Both branches carry both keys (one as `undefined`) because this workspace
 * compiles with `strict: false`, where a boolean discriminant does not narrow.
 */
export type AiProviderResolution =
    | { configured: true; config: AiProviderConfig; reason?: undefined }
    | { configured: false; config?: undefined; reason: string };

const NO_PROVIDER_REASON =
    'No model provider is configured for this deployment, so the assistant cannot answer. Set CEREBRAS_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, OLLAMA_BASE_URL, or OPENAI_API_KEY to enable it. Every screen it would summarise is still available directly.';

/**
 * Every configured provider, in priority order:
 *  1. Cerebras (`CEREBRAS_API_KEY` — ultra-low latency free developer tier)
 *  2. Groq (`GROQ_API_KEY` — free tier open-weight `llama-3.3-70b-versatile`)
 *  3. Google Gemini (`GEMINI_API_KEY` — Google AI Studio free tier OpenAI-compatible API)
 *  4. OpenAI (`OPENAI_API_KEY`)
 *  5. Self-Hosted Ollama (`OLLAMA_BASE_URL` — `ollama/ollama` ₹0/$0 local open-weight models, zero external key)
 */
function collectConfiguredProviders(): AiProviderConfig[] {
    const providers: AiProviderConfig[] = [];

    const cerebrasKey = process.env.CEREBRAS_API_KEY;
    if (cerebrasKey) {
        providers.push({
            apiKey: cerebrasKey,
            baseURL: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
            model: process.env.CEREBRAS_MODEL || 'llama3.1-8b',
            source: 'CEREBRAS_API_KEY',
        });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
        providers.push({
            apiKey: groqKey,
            baseURL: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
            source: 'GROQ_API_KEY',
        });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
        providers.push({
            apiKey: geminiKey,
            baseURL:
                process.env.GEMINI_BASE_URL ||
                'https://generativelanguage.googleapis.com/v1beta/openai/',
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
            source: 'GEMINI_API_KEY',
        });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        providers.push({
            apiKey: openaiKey,
            baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            source: 'OPENAI_API_KEY',
        });
    }

    const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || '').trim();
    if (ollamaBaseUrl) {
        providers.push({
            apiKey: process.env.OLLAMA_API_KEY || 'ollama',
            baseURL: ollamaBaseUrl,
            model: process.env.OLLAMA_MODEL || 'llama3.2',
            source: 'OLLAMA_BASE_URL',
        });
    }

    return providers;
}

export function resolveAiProvider(): AiProviderResolution {
    const [primary] = collectConfiguredProviders();
    return primary ? { configured: true, config: primary } : { configured: false, reason: NO_PROVIDER_REASON };
}

export type AiProviderChain =
    | { configured: true; chain: AiProviderConfig[]; reason?: undefined }
    | { configured: false; chain?: undefined; reason: string };

/**
 * The ordered provider chain the runtime tries in turn. With multiple providers set,
 * a transient failure of the primary (rate limit, timeout, provider outage) falls
 * back to the next provider within the same turn — but only when the failed attempt
 * ran no tools, so a fallback can never duplicate a read or an approval request.
 */
export function resolveAiProviderChain(): AiProviderChain {
    const chain = collectConfiguredProviders();
    return chain.length > 0 ? { configured: true, chain } : { configured: false, reason: NO_PROVIDER_REASON };
}
