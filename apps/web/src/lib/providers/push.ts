import { mockRuntimeIsAllowed, notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import { logger } from '@/lib/observability/logger';
import { NotificationService } from '@/lib/services/notifications';
import type { ProviderResult } from './index';

export interface PushProvider {
    send(options: {
        token: string;
        title: string;
        body: string;
        data?: Record<string, unknown>;
    }): Promise<ProviderResult<{ messageId: string }>>;
}

function requireFirebaseConfiguration(): void {
    for (const name of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'] as const) {
        if (!process.env[name]?.trim()) throw new Error(`${name} is required for Firebase push delivery.`);
    }
}

class FirebasePushProvider implements PushProvider {
    constructor() {
        requireFirebaseConfiguration();
    }

    async send(options: {
        token: string;
        title: string;
        body: string;
        data?: Record<string, unknown>;
    }): Promise<ProviderResult<{ messageId: string }>> {
        try {
            const result = await NotificationService.sendParentAlert(
                options.token,
                options.title,
                options.body,
                options.data,
            );
            if (!result.success) {
                return {
                    success: false,
                    error: 'Firebase did not accept the push notification.',
                    outcome: 'REJECTED',
                };
            }
            if (!result.messageId) {
                return {
                    success: false,
                    error: 'Firebase accepted the push notification without a message id.',
                    outcome: 'UNKNOWN',
                };
            }
            return { success: true, data: { messageId: result.messageId } };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Firebase push delivery failed.',
                outcome: 'UNKNOWN',
            };
        }
    }
}

class MockPushProvider implements PushProvider {
    async send(options: {
        token: string;
        title: string;
        body: string;
    }): Promise<ProviderResult<{ messageId: string }>> {
        logger.info('notification.mock_push_sent', 'Mock push notification accepted', {
            source: 'notifications',
            metadata: {
                recipientLength: options.token.length,
                titleLength: options.title.length,
                bodyLength: options.body.length,
            },
        });
        return {
            success: true,
            data: { messageId: `mock_push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` },
        };
    }
}

let instance: PushProvider | null = null;

export function getPushProvider(): PushProvider {
    if (instance) return instance;

    const provider = notificationProviderForChannel('PUSH');
    if (provider === 'firebase') instance = new FirebasePushProvider();
    else if (provider === 'mock' && mockRuntimeIsAllowed()) instance = new MockPushProvider();
    else if (provider === 'unconfigured') throw new Error('Push provider is not configured.');
    else throw new Error(`Unsupported push provider: ${provider}.`);

    return instance;
}
