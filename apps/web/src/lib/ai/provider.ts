/**
 * Model provider resolution, and honest degradation when there is none.
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
    /** Which env var supplied the key — surfaced in the UI, never the key itself. */
    source: 'CEREBRAS_API_KEY' | 'OPENAI_API_KEY';
}

/**
 * Both branches carry both keys (one as `undefined`) because this workspace
 * compiles with `strict: false`, where a boolean discriminant does not narrow.
 */
export type AiProviderResolution =
    | { configured: true; config: AiProviderConfig; reason?: undefined }
    | { configured: false; config?: undefined; reason: string };

const NO_PROVIDER_REASON =
    'No model provider is configured for this deployment, so the assistant cannot answer. Set CEREBRAS_API_KEY or OPENAI_API_KEY to enable it. Every screen it would summarise is still available directly.';

/**
 * Every configured provider, in priority order (Cerebras first, then OpenAI). This
 * is the single source both `resolveAiProvider` (the primary) and
 * `resolveAiProviderChain` (primary + fallbacks) read from, so their ordering can
 * never drift apart.
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

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        providers.push({
            apiKey: openaiKey,
            baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            source: 'OPENAI_API_KEY',
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
 * The ordered provider chain the runtime tries in turn. With both keys set, a
 * transient failure of the primary (rate limit, timeout, provider outage) falls
 * back to the secondary within the same turn — but only when the failed attempt
 * ran no tools, so a fallback can never duplicate a read or an approval request.
 */
export function resolveAiProviderChain(): AiProviderChain {
    const chain = collectConfiguredProviders();
    return chain.length > 0 ? { configured: true, chain } : { configured: false, reason: NO_PROVIDER_REASON };
}

