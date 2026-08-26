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

export function resolveAiProvider(): AiProviderResolution {
    const cerebrasKey = process.env.CEREBRAS_API_KEY;
    if (cerebrasKey) {
        return {
            configured: true,
            config: {
                apiKey: cerebrasKey,
                baseURL: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
                model: process.env.CEREBRAS_MODEL || 'llama3.1-8b',
                source: 'CEREBRAS_API_KEY',
            },
        };
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        return {
            configured: true,
            config: {
                apiKey: openaiKey,
                baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                source: 'OPENAI_API_KEY',
            },
        };
    }

    return {
        configured: false,
        reason:
            'No model provider is configured for this deployment, so the assistant cannot answer. Set CEREBRAS_API_KEY or OPENAI_API_KEY to enable it. Every screen it would summarise is still available directly.',
    };
}

