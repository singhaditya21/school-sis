/**
 * Push Provider — Firebase Cloud Messaging, with a dev-only mock.
 *
 *   PUSH_PROVIDER=firebase → FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *
 * `NotificationService.sendParentAlert` (packages/api) owns the Firebase Admin
 * client. This adapter is the boundary around it: it checks credentials before
 * calling, bounds the call with a deadline the SDK does not provide, coerces the
 * data payload into the string map FCM requires, and converts a throw into a
 * failed result so a push can never be recorded as sent on an exception.
 */

import type { ProviderResult } from './index';
import { logger } from '@/lib/observability/logger';
import { NotificationService } from '@/lib/services/notifications';
import { mockRuntimeIsAllowed, notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import {
    missingEnv,
    providerAvailable,
    providerUnavailable,
    resolveTimeoutMs,
    truncateError,
    withDeadline,
    type ProviderAvailability,
    type ProviderDispatch,
} from './transport';

// ─── Interface ───────────────────────────────────────────────

export type PushSendOptions = {
    /** FCM device registration token. */
    deviceToken: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
};

export interface PushProvider {
    readonly provider: string;
    availability(): ProviderAvailability;
    send(options: PushSendOptions): Promise<ProviderResult<ProviderDispatch>>;
}

const FIREBASE_ENV_VARS = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'] as const;
const PUSH_TIMEOUT_ENV = 'FIREBASE_TIMEOUT_MS';

/** FCM only accepts string values in `data`; anything else makes the SDK throw. */
function toStringData(data: Record<string, unknown> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!data) return out;
    for (const [key, value] of Object.entries(data)) {
        if (value == null) continue;
        out[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return out;
}

/** Device tokens are credentials for a handset — only ever show the tail. */
function maskToken(token: string): string {
    return token.length <= 6 ? '***' : `***${token.slice(-6)}`;
}

// ─── Unavailable (no credentials) ────────────────────────────

class UnavailablePushProvider implements PushProvider {
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
        return { success: false, error: this.detail.reason || 'Push provider is not configured.' };
    }
}

// ─── Mock (development only) ─────────────────────────────────

class MockPushProvider implements PushProvider {
    readonly provider = 'mock';

    availability(): ProviderAvailability {
        return providerAvailable('mock');
    }

    async send(options: PushSendOptions): Promise<ProviderResult<ProviderDispatch>> {
        logger.info('notification.mock_push_sent', 'Mock push accepted', {
            source: 'notifications',
            metadata: {
                deviceToken: maskToken(options.deviceToken),
                titleLength: options.title.length,
                bodyLength: options.body.length,
            },
        });
        return {
            success: true,
            data: {
                messageId: `mock_push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                deliveryState: 'ACCEPTED',
                providerStatus: 'mock',
            },
        };
    }
}

// ─── Firebase Cloud Messaging ────────────────────────────────

export function firebaseAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
    const missing = missingEnv(FIREBASE_ENV_VARS, env);
    return missing.length > 0 ? providerUnavailable('firebase', missing) : providerAvailable('firebase');
}

class FirebasePushProvider implements PushProvider {
    readonly provider = 'firebase';

    availability(): ProviderAvailability {
        return firebaseAvailability();
    }

    async send(options: PushSendOptions): Promise<ProviderResult<ProviderDispatch>> {
        const state = this.availability();
        if (!state.available) {
            return { success: false, error: state.reason || 'Firebase push is not configured.' };
        }
        if (!options.deviceToken.trim()) {
            return { success: false, error: 'Push recipient is not an FCM device token.' };
        }

        try {
            // The Admin SDK has no abort signal, so bound it here. A timeout is
            // reported as a failure: we cannot evidence that FCM took the message.
            const response = await withDeadline(
                () => NotificationService.sendParentAlert(
                    options.deviceToken.trim(),
                    options.title,
                    options.body,
                    toStringData(options.data),
                ),
                resolveTimeoutMs(PUSH_TIMEOUT_ENV),
                'Firebase Cloud Messaging',
            );

            const messageId = typeof response?.messageId === 'string' ? response.messageId.trim() : '';
            if (!response?.success || !messageId) {
                return { success: false, error: 'Firebase returned no message name for the push.' };
            }

            return {
                success: true,
                data: { messageId, deliveryState: 'ACCEPTED', providerStatus: 'fcm_accepted' },
            };
        } catch (error: unknown) {
            return {
                success: false,
                error: truncateError(error instanceof Error ? error.message : 'Firebase push failed.'),
            };
        }
    }
}

// ─── Factory ─────────────────────────────────────────────────

/** Reports whether push can leave this deployment, without constructing anything. */
export function pushAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
    const provider = notificationProviderForChannel('PUSH', env);
    switch (provider) {
        case 'firebase':
            return firebaseAvailability(env);
        case 'mock':
            return mockRuntimeIsAllowed(env)
                ? providerAvailable('mock')
                : providerUnavailable('mock', [], 'Mock push delivery is disabled in this runtime.');
        case 'unconfigured':
            return providerUnavailable('unconfigured', ['PUSH_PROVIDER'], 'No PUSH_PROVIDER is set for this deployment.');
        default:
            return providerUnavailable(
                provider,
                ['PUSH_PROVIDER'],
                `No adapter is installed for the "${provider}" push provider.`,
            );
    }
}

let _instance: PushProvider | null = null;
let _instanceKey = '';

export function getPushProvider(): PushProvider {
    const provider = notificationProviderForChannel('PUSH');
    if (_instance && _instanceKey === provider) return _instance;

    const state = pushAvailability();
    if (!state.available) {
        _instance = new UnavailablePushProvider(state);
    } else if (provider === 'firebase') {
        _instance = new FirebasePushProvider();
    } else if (provider === 'mock') {
        _instance = new MockPushProvider();
    } else {
        _instance = new UnavailablePushProvider(
            providerUnavailable(provider, ['PUSH_PROVIDER'], `Unsupported push provider: ${provider}.`),
        );
    }

    _instanceKey = provider;
    return _instance;
}

/** Test hook: drops the cached adapter so a new environment takes effect. */
export function resetPushProviderCache(): void {
    _instance = null;
    _instanceKey = '';
}
