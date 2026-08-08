import { mockRuntimeIsAllowed, notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import { logger } from '@/lib/observability/logger';
import type { ProviderResult } from './index';
import { providerFailureOutcomeForHttpStatus } from './outcome';

export interface WhatsAppProvider {
    send(to: string, message: string): Promise<ProviderResult<{ messageId: string }>>;
}

function asWhatsAppAddress(value: string): string {
    const trimmed = value.trim();
    return trimmed.startsWith('whatsapp:') ? trimmed : `whatsapp:${trimmed}`;
}

function requiredEnvironment(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required for Twilio WhatsApp delivery.`);
    return value;
}

function requiredHttpsUrl(name: string): string {
    const value = requiredEnvironment(name);
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${name} must be a valid HTTPS URL.`);
    }
    if (parsed.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`);
    return parsed.toString();
}

class TwilioWhatsAppProvider implements WhatsAppProvider {
    private readonly accountSid = requiredEnvironment('TWILIO_ACCOUNT_SID');
    private readonly authToken = requiredEnvironment('TWILIO_AUTH_TOKEN');
    private readonly fromNumber = asWhatsAppAddress(requiredEnvironment('TWILIO_WHATSAPP_FROM_NUMBER'));
    private readonly statusCallback = requiredHttpsUrl('NOTIFICATION_TWILIO_STATUS_CALLBACK_URL');

    async send(to: string, message: string): Promise<ProviderResult<{ messageId: string }>> {
        try {
            const response = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        To: asWhatsAppAddress(to),
                        From: this.fromNumber,
                        Body: message,
                        StatusCallback: this.statusCallback,
                    }).toString(),
                },
            );

            const payload = await response.json() as { sid?: unknown; message?: unknown };
            if (!response.ok) {
                return {
                    success: false,
                    error: typeof payload.message === 'string' ? payload.message : 'Twilio WhatsApp send failed.',
                    outcome: providerFailureOutcomeForHttpStatus(response.status),
                };
            }
            if (typeof payload.sid !== 'string' || !payload.sid.trim()) {
                return {
                    success: false,
                    error: 'Twilio accepted the request without a message SID.',
                    outcome: 'UNKNOWN',
                };
            }

            return { success: true, data: { messageId: payload.sid } };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Twilio WhatsApp send failed.',
                outcome: 'UNKNOWN',
            };
        }
    }
}

class MockWhatsAppProvider implements WhatsAppProvider {
    async send(to: string, message: string): Promise<ProviderResult<{ messageId: string }>> {
        logger.info('notification.mock_whatsapp_sent', 'Mock WhatsApp notification accepted', {
            source: 'notifications',
            metadata: { recipientLength: to.length, messageLength: message.length },
        });
        return {
            success: true,
            data: { messageId: `mock_whatsapp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` },
        };
    }
}

let instance: WhatsAppProvider | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
    if (instance) return instance;

    const provider = notificationProviderForChannel('WHATSAPP');
    if (provider === 'twilio') instance = new TwilioWhatsAppProvider();
    else if (provider === 'mock' && mockRuntimeIsAllowed()) instance = new MockWhatsAppProvider();
    else if (provider === 'unconfigured') throw new Error('WhatsApp provider is not configured.');
    else throw new Error(`Unsupported WhatsApp provider: ${provider}.`);

    return instance;
}
