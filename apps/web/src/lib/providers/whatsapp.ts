/**
 * WhatsApp Provider — Meta WhatsApp Cloud API + Open-Source Self-Hosted Gateways (WAHA & Evolution API).
 *
 * Option A — Official Meta Cloud API:
 *   WHATSAPP_PROVIDER=meta_cloud   (aliases: meta, whatsapp_cloud, cloud_api)
 *   WHATSAPP_PHONE_NUMBER_ID       the Cloud API phone number id
 *   WHATSAPP_ACCESS_TOKEN          a system-user token with whatsapp_business_messaging
 *
 * Option B — Open-Source WAHA (devlikeapro/waha — ₹0/$0 self-hosted Docker):
 *   WHATSAPP_PROVIDER=waha         (alias: whatsapp_http_api)
 *   WAHA_BASE_URL                  e.g. https://waha.school.edu.in or http://localhost:3000
 *   WAHA_API_KEY                   optional X-Api-Key header configured on WAHA
 *   WAHA_SESSION                   optional session name, default 'default'
 *
 * Option C — Open-Source Evolution API (EvolutionAPI/evolution-api — ₹0/$0 self-hosted):
 *   WHATSAPP_PROVIDER=evolution    (alias: evolution_api)
 *   EVOLUTION_BASE_URL             e.g. https://evo.school.edu.in
 *   EVOLUTION_API_KEY              apikey header configured on Evolution API
 *   EVOLUTION_INSTANCE             instance name, e.g. 'scholarmind-campus'
 *
 * Optional (Meta Cloud):
 *   WHATSAPP_API_VERSION           Graph API version, default v21.0
 *   WHATSAPP_DEFAULT_TEMPLATE      template used when a message names none
 *   WHATSAPP_DEFAULT_LANGUAGE      template language code, default 'en'
 *   WHATSAPP_ALLOW_FREEFORM=true   permit plain-text replies inside the 24-hour
 *                                  customer-service window
 */

import type { ProviderResult } from './index';
import { logger } from '@/lib/observability/logger';
import { mockRuntimeIsAllowed, notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import {
    asRecord,
    maskPhone,
    missingEnv,
    normalizeToE164Digits,
    providerAvailable,
    providerFetch,
    providerUnavailable,
    readArray,
    readString,
    resolveTimeoutMs,
    truncateError,
    type ProviderAvailability,
    type ProviderDispatch,
} from './transport';

// ─── Interface ───────────────────────────────────────────────

export type WhatsAppSendOptions = {
    to: string;
    /** Plain-text rendering of the message; used as the single body variable or text body. */
    body: string;
    /** The notification's `payload` jsonb, which may carry template instructions. */
    payload?: Record<string, unknown>;
};

export interface WhatsAppProvider {
    readonly provider: string;
    availability(): ProviderAvailability;
    send(options: WhatsAppSendOptions): Promise<ProviderResult<ProviderDispatch>>;
}

/** Canonical adapter names plus the spellings a deployment might actually use. */
export const META_CLOUD_PROVIDER_ALIASES = ['meta_cloud', 'meta', 'whatsapp_cloud', 'cloud_api'] as const;
export const WAHA_PROVIDER_ALIASES = ['waha', 'whatsapp_http_api'] as const;
export const EVOLUTION_PROVIDER_ALIASES = ['evolution', 'evolution_api'] as const;

export function isMetaCloudProvider(provider: string): boolean {
    return (META_CLOUD_PROVIDER_ALIASES as readonly string[]).includes(provider);
}

export function isWahaProvider(provider: string): boolean {
    return (WAHA_PROVIDER_ALIASES as readonly string[]).includes(provider);
}

export function isEvolutionProvider(provider: string): boolean {
    return (EVOLUTION_PROVIDER_ALIASES as readonly string[]).includes(provider);
}

export function isSelfHostedWhatsAppProvider(provider: string): boolean {
    return isWahaProvider(provider) || isEvolutionProvider(provider);
}

// ─── Template shaping ────────────────────────────────────────

const MAX_PARAM_CHARS = 1024;

/**
 * Meta rejects template variables containing newlines, tabs, or runs of four or
 * more spaces, so a body pasted from a rich editor must be flattened first.
 */
function sanitizeParameter(value: string): string {
    const flat = value.replace(/\s+/g, ' ').trim();
    return flat.length > MAX_PARAM_CHARS ? `${flat.slice(0, MAX_PARAM_CHARS - 1)}…` : flat;
}

function toParameterList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((entry): entry is string | number => typeof entry === 'string' || typeof entry === 'number')
        .map((entry) => sanitizeParameter(String(entry)))
        .filter((entry) => entry.length > 0);
}

type WhatsAppTemplateSpec = {
    name: string;
    languageCode: string;
    headerParameters: string[];
    bodyParameters: string[];
};

/**
 * Resolves the template to use from the notification payload, falling back to the
 * deployment default. Returns null when nothing names a template.
 */
export function resolveTemplateSpec(
    body: string,
    payload: Record<string, unknown> | undefined,
    env: NodeJS.ProcessEnv = process.env,
): WhatsAppTemplateSpec | null {
    const scoped = asRecord(payload?.whatsapp) || {};

    // `payload.template` is deliberately NOT consulted: the `send-whatsapp` worker
    // task already uses that key for the message text, and reading it as a template
    // name would send the body as its own variable.
    const name = readString(scoped, 'templateName')
        || readString(scoped, 'template')
        || readString(payload, 'templateName')
        || (env.WHATSAPP_DEFAULT_TEMPLATE || '').trim()
        || null;
    if (!name) return null;

    const languageCode = readString(scoped, 'languageCode')
        || readString(payload, 'languageCode')
        || (env.WHATSAPP_DEFAULT_LANGUAGE || '').trim()
        || 'en';

    const bodyParameters = toParameterList(scoped.bodyParameters ?? payload?.bodyParameters);

    return {
        name,
        languageCode,
        headerParameters: toParameterList(scoped.headerParameters ?? payload?.headerParameters),
        // With no explicit variables the rendered body is the single {{1}} value —
        // which is how the fee/attendance reminders are authored today.
        bodyParameters: bodyParameters.length > 0 ? bodyParameters : [sanitizeParameter(body)].filter(Boolean),
    };
}

/** Builds the exact Cloud API request body. Pure, so it can be asserted on directly. */
export function buildTemplateMessage(toDigits: string, spec: WhatsAppTemplateSpec): Record<string, unknown> {
    const components: Record<string, unknown>[] = [];
    if (spec.headerParameters.length > 0) {
        components.push({
            type: 'header',
            parameters: spec.headerParameters.map((text) => ({ type: 'text', text })),
        });
    }
    if (spec.bodyParameters.length > 0) {
        components.push({
            type: 'body',
            parameters: spec.bodyParameters.map((text) => ({ type: 'text', text })),
        });
    }

    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toDigits,
        type: 'template',
        template: {
            name: spec.name,
            language: { code: spec.languageCode },
            ...(components.length > 0 ? { components } : {}),
        },
    };
}

export function buildTextMessage(toDigits: string, body: string): Record<string, unknown> {
    return {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toDigits,
        type: 'text',
        text: { preview_url: false, body },
    };
}

function freeformRequested(payload: Record<string, unknown> | undefined): boolean {
    const scoped = asRecord(payload?.whatsapp);
    const type = readString(scoped, 'messageType') || readString(payload, 'whatsappMessageType');
    return type?.toLowerCase() === 'text';
}

// ─── Unavailable (no credentials) ────────────────────────────

class UnavailableWhatsAppProvider implements WhatsAppProvider {
    readonly provider: string;
    private readonly detail: ProviderAvailability;

    constructor(detail: ProviderAvailability) {
        this.provider = detail.provider;
        this.detail = detail;
    }

    availability(): ProviderAvailability {
        return this.detail;
    }

    async send(): Promise<ProviderResult<ProviderDispatch>> {
        return { success: false, error: this.detail.reason || 'WhatsApp provider is not configured.' };
    }
}

// ─── Mock (development only) ─────────────────────────────────

class MockWhatsAppProvider implements WhatsAppProvider {
    readonly provider = 'mock';

    availability(): ProviderAvailability {
        return providerAvailable('mock');
    }

    async send(options: WhatsAppSendOptions): Promise<ProviderResult<ProviderDispatch>> {
        logger.info('notification.mock_whatsapp_sent', 'Mock WhatsApp accepted', {
            source: 'notifications',
            metadata: {
                recipient: maskPhone(options.to),
                bodyLength: options.body.length,
                template: resolveTemplateSpec(options.body, options.payload)?.name || null,
            },
        });
        return {
            success: true,
            data: {
                messageId: `mock_whatsapp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                deliveryState: 'ACCEPTED',
                providerStatus: 'mock',
            },
        };
    }
}

// ─── Meta WhatsApp Cloud API ─────────────────────────────────

const WHATSAPP_TIMEOUT_ENV = 'WHATSAPP_TIMEOUT_MS';
const DEFAULT_API_VERSION = 'v21.0';

export function metaCloudAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
    const missing = missingEnv(['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN'], env);
    return missing.length > 0 ? providerUnavailable('meta_cloud', missing) : providerAvailable('meta_cloud');
}

export function wahaAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
    const missing = missingEnv(['WAHA_BASE_URL'], env);
    return missing.length > 0 ? providerUnavailable('waha', missing) : providerAvailable('waha');
}

export function evolutionAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
    const missing = missingEnv(['EVOLUTION_BASE_URL', 'EVOLUTION_API_KEY', 'EVOLUTION_INSTANCE'], env);
    return missing.length > 0 ? providerUnavailable('evolution', missing) : providerAvailable('evolution');
}

class MetaCloudWhatsAppProvider implements WhatsAppProvider {
    readonly provider: string;

    /** Keeps the configured spelling so the outbox `provider` column matches the env. */
    constructor(configuredName: string) {
        this.provider = configuredName;
    }

    availability(): ProviderAvailability {
        const state = metaCloudAvailability();
        return state.available ? providerAvailable(this.provider) : { ...state, provider: this.provider };
    }

    async send(options: WhatsAppSendOptions): Promise<ProviderResult<ProviderDispatch>> {
        const state = this.availability();
        if (!state.available) {
            return { success: false, error: state.reason || 'WhatsApp Cloud API is not configured.' };
        }

        const normalized = normalizeToE164Digits(options.to);
        if ('error' in normalized) return { success: false, error: normalized.error };

        const allowFreeform = (process.env.WHATSAPP_ALLOW_FREEFORM || '').trim().toLowerCase() === 'true';
        let message: Record<string, unknown>;
        let shape: string;

        if (freeformRequested(options.payload) && allowFreeform) {
            if (!options.body.trim()) return { success: false, error: 'WhatsApp text message has an empty body.' };
            message = buildTextMessage(normalized.digits, options.body);
            shape = 'text';
        } else {
            const spec = resolveTemplateSpec(options.body, options.payload);
            if (!spec) {
                return {
                    success: false,
                    error:
                        'No WhatsApp template named for this message. Meta requires an approved template for '
                        + 'business-initiated messages — set WHATSAPP_DEFAULT_TEMPLATE or pass payload.whatsapp.templateName.',
                };
            }
            if (spec.bodyParameters.length === 0 && spec.headerParameters.length === 0 && !options.body.trim()) {
                return { success: false, error: 'WhatsApp template message has no body text to substitute.' };
            }
            message = buildTemplateMessage(normalized.digits, spec);
            shape = `template:${spec.name}`;
        }

        const version = (process.env.WHATSAPP_API_VERSION || '').trim() || DEFAULT_API_VERSION;
        const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

        try {
            const response = await providerFetch(
                `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/messages`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${(process.env.WHATSAPP_ACCESS_TOKEN || '').trim()}`,
                    },
                    body: JSON.stringify(message),
                },
                resolveTimeoutMs(WHATSAPP_TIMEOUT_ENV),
            );

            if (!response.ok) {
                const error = asRecord(asRecord(response.json)?.error);
                const detail = (error && readString(error, 'message')) || response.safeText;
                const code = error && error.code != null ? String(error.code) : String(response.status);
                return {
                    success: false,
                    error: truncateError(`WhatsApp Cloud API rejected the message (code ${code}): ${detail}`),
                };
            }

            const first = asRecord(readArray(response.json, 'messages')[0]);
            const messageId = first ? readString(first, 'id') : null;
            if (!messageId) {
                // A 200 without a wamid means we cannot evidence that Meta took custody.
                return {
                    success: false,
                    error: 'WhatsApp Cloud API returned 200 without a message id.',
                };
            }

            const messageStatus = (first && readString(first, 'message_status')) || 'accepted';
            return {
                success: true,
                data: {
                    messageId,
                    // Only the statuses webhook can promote this to DELIVERED.
                    deliveryState: 'ACCEPTED',
                    providerStatus: `whatsapp_${messageStatus}:${shape.split(':')[0]}`,
                },
            };
        } catch (error: unknown) {
            return {
                success: false,
                error: truncateError(error instanceof Error ? error.message : 'WhatsApp Cloud API send failed.'),
            };
        }
    }
}

// ─── Open-Source Self-Hosted WAHA (devlikeapro/waha) ─────────

class WahaWhatsAppProvider implements WhatsAppProvider {
    readonly provider: string;

    constructor(configuredName: string) {
        this.provider = configuredName;
    }

    availability(): ProviderAvailability {
        const state = wahaAvailability();
        return state.available ? providerAvailable(this.provider) : { ...state, provider: this.provider };
    }

    async send(options: WhatsAppSendOptions): Promise<ProviderResult<ProviderDispatch>> {
        const state = this.availability();
        if (!state.available) {
            return { success: false, error: state.reason || 'WAHA gateway is not configured.' };
        }

        const normalized = normalizeToE164Digits(options.to);
        if ('error' in normalized) return { success: false, error: normalized.error };
        if (!options.body.trim()) return { success: false, error: 'WhatsApp text message has an empty body.' };

        const baseUrl = (process.env.WAHA_BASE_URL || '').trim().replace(/\/+$/, '');
        const apiKey = (process.env.WAHA_API_KEY || '').trim();
        const session = (process.env.WAHA_SESSION || '').trim() || 'default';

        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (apiKey) headers['X-Api-Key'] = apiKey;

            const response = await providerFetch(
                `${baseUrl}/api/sendText`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        session,
                        chatId: `${normalized.digits}@c.us`,
                        text: options.body,
                    }),
                },
                resolveTimeoutMs(WHATSAPP_TIMEOUT_ENV),
            );

            if (!response.ok) {
                const jsonObj = asRecord(response.json);
                const detail = (jsonObj && (readString(jsonObj, 'message') || readString(jsonObj, 'error'))) || response.safeText;
                return {
                    success: false,
                    error: truncateError(`WAHA gateway rejected the message (HTTP ${response.status}): ${detail}`),
                };
            }

            const jsonObj = asRecord(response.json);
            const keyObj = asRecord(jsonObj?.key);
            const idObj = asRecord(jsonObj?.id);
            const messageId =
                (jsonObj && readString(jsonObj, 'id'))
                || (idObj && readString(idObj, '_serialized'))
                || (keyObj && readString(keyObj, 'id'))
                || null;

            if (!messageId) {
                return {
                    success: false,
                    error: 'WAHA gateway returned 200 without a message id.',
                };
            }

            return {
                success: true,
                data: {
                    messageId,
                    deliveryState: 'ACCEPTED',
                    providerStatus: 'waha_accepted:text',
                },
            };
        } catch (error: unknown) {
            return {
                success: false,
                error: truncateError(error instanceof Error ? error.message : 'WAHA gateway send failed.'),
            };
        }
    }
}

// ─── Open-Source Self-Hosted Evolution API ───────────────────

class EvolutionWhatsAppProvider implements WhatsAppProvider {
    readonly provider: string;

    constructor(configuredName: string) {
        this.provider = configuredName;
    }

    availability(): ProviderAvailability {
        const state = evolutionAvailability();
        return state.available ? providerAvailable(this.provider) : { ...state, provider: this.provider };
    }

    async send(options: WhatsAppSendOptions): Promise<ProviderResult<ProviderDispatch>> {
        const state = this.availability();
        if (!state.available) {
            return { success: false, error: state.reason || 'Evolution API gateway is not configured.' };
        }

        const normalized = normalizeToE164Digits(options.to);
        if ('error' in normalized) return { success: false, error: normalized.error };
        if (!options.body.trim()) return { success: false, error: 'WhatsApp text message has an empty body.' };

        const baseUrl = (process.env.EVOLUTION_BASE_URL || '').trim().replace(/\/+$/, '');
        const apiKey = (process.env.EVOLUTION_API_KEY || '').trim();
        const instance = (process.env.EVOLUTION_INSTANCE || '').trim();

        try {
            const response = await providerFetch(
                `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        apikey: apiKey,
                    },
                    body: JSON.stringify({
                        number: normalized.digits,
                        text: options.body,
                    }),
                },
                resolveTimeoutMs(WHATSAPP_TIMEOUT_ENV),
            );

            if (!response.ok) {
                const jsonObj = asRecord(response.json);
                const detail = (jsonObj && (readString(jsonObj, 'message') || readString(jsonObj, 'error'))) || response.safeText;
                return {
                    success: false,
                    error: truncateError(`Evolution API rejected the message (HTTP ${response.status}): ${detail}`),
                };
            }

            const jsonObj = asRecord(response.json);
            const keyObj = asRecord(jsonObj?.key);
            const messageId =
                (keyObj && readString(keyObj, 'id'))
                || (jsonObj && readString(jsonObj, 'id'))
                || null;

            if (!messageId) {
                return {
                    success: false,
                    error: 'Evolution API returned 200 without a message id.',
                };
            }

            return {
                success: true,
                data: {
                    messageId,
                    deliveryState: 'ACCEPTED',
                    providerStatus: 'evolution_accepted:text',
                },
            };
        } catch (error: unknown) {
            return {
                success: false,
                error: truncateError(error instanceof Error ? error.message : 'Evolution API send failed.'),
            };
        }
    }
}

// ─── Factory ─────────────────────────────────────────────────

/** Reports whether WhatsApp can leave this deployment, without constructing anything. */
export function whatsAppAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
    const provider = notificationProviderForChannel('WHATSAPP', env);
    if (isMetaCloudProvider(provider)) {
        const state = metaCloudAvailability(env);
        return state.available ? providerAvailable(provider) : { ...state, provider };
    }
    if (isWahaProvider(provider)) {
        const state = wahaAvailability(env);
        return state.available ? providerAvailable(provider) : { ...state, provider };
    }
    if (isEvolutionProvider(provider)) {
        const state = evolutionAvailability(env);
        return state.available ? providerAvailable(provider) : { ...state, provider };
    }
    if (provider === 'mock') {
        return mockRuntimeIsAllowed(env)
            ? providerAvailable('mock')
            : providerUnavailable('mock', [], 'Mock WhatsApp delivery is disabled in this runtime.');
    }
    if (provider === 'unconfigured') {
        return providerUnavailable(
            'unconfigured',
            ['WHATSAPP_PROVIDER', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN'],
            'No WHATSAPP_PROVIDER is set for this deployment.',
        );
    }
    return providerUnavailable(
        provider,
        ['WHATSAPP_PROVIDER'],
        `No adapter is installed for the "${provider}" WhatsApp provider. Use WHATSAPP_PROVIDER=meta_cloud, waha, or evolution.`,
    );
}

let _instance: WhatsAppProvider | null = null;
let _instanceKey = '';

export function getWhatsAppProvider(): WhatsAppProvider {
    const provider = notificationProviderForChannel('WHATSAPP');
    if (_instance && _instanceKey === provider) return _instance;

    const state = whatsAppAvailability();
    if (!state.available) {
        _instance = new UnavailableWhatsAppProvider(state);
    } else if (isMetaCloudProvider(provider)) {
        _instance = new MetaCloudWhatsAppProvider(provider);
    } else if (isWahaProvider(provider)) {
        _instance = new WahaWhatsAppProvider(provider);
    } else if (isEvolutionProvider(provider)) {
        _instance = new EvolutionWhatsAppProvider(provider);
    } else if (provider === 'mock') {
        _instance = new MockWhatsAppProvider();
    } else {
        _instance = new UnavailableWhatsAppProvider(
            providerUnavailable(provider, ['WHATSAPP_PROVIDER'], `Unsupported WhatsApp provider: ${provider}.`),
        );
    }

    _instanceKey = provider;
    return _instance;
}

/** Test hook: drops the cached adapter so a new environment takes effect. */
export function resetWhatsAppProviderCache(): void {
    _instance = null;
    _instanceKey = '';
}
