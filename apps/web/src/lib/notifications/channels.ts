/**
 * The single source of truth for "can this deployment actually send on this channel".
 *
 * `lib/integrations/runtime-mode` answers *which* provider is selected; the adapters
 * in `lib/providers` answer whether that provider has what it needs. This module
 * joins the two so the outbox, the worker, and the messaging UI all agree — and so a
 * channel can never be offered in the UI that `enqueueNotification` would refuse.
 */

import { notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import { emailAvailability } from '@/lib/providers/email';
import { pushAvailability } from '@/lib/providers/push';
import { smsAvailability } from '@/lib/providers/sms';
import { whatsAppAvailability } from '@/lib/providers/whatsapp';
import { META_CLOUD_PROVIDER_ALIASES } from '@/lib/providers/whatsapp';
import type { ProviderAvailability } from '@/lib/providers/transport';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH' | 'IN_APP';

/**
 * Provider identifiers each channel has a real adapter for. `mock` appears only
 * where `mockRuntimeIsAllowed()` permits it, which is never in production.
 */
export const SUPPORTED_NOTIFICATION_PROVIDERS: Record<NotificationChannel, readonly string[]> = {
  EMAIL: ['smtp', 'resend', 'mock'],
  SMS: ['msg91', 'twilio', 'mock'],
  WHATSAPP: [...META_CLOUD_PROVIDER_ALIASES, 'mock'],
  PUSH: ['firebase', 'mock'],
  IN_APP: ['database'],
};

/** The same table with the development-only entries removed. */
export const LIVE_NOTIFICATION_PROVIDERS: Record<NotificationChannel, readonly string[]> = {
  EMAIL: ['smtp', 'resend'],
  SMS: ['msg91', 'twilio'],
  WHATSAPP: [...META_CLOUD_PROVIDER_ALIASES],
  PUSH: ['firebase'],
  IN_APP: ['database'],
};

export function channelHasAdapter(channel: NotificationChannel, provider: string): boolean {
  return SUPPORTED_NOTIFICATION_PROVIDERS[channel]?.includes(provider) ?? false;
}

export type ChannelReadiness = ProviderAvailability & {
  channel: NotificationChannel;
};

/**
 * Reports whether `channel` can dispatch right now, and why not when it cannot.
 * Pure with respect to the database — safe to call from a page, an action, or a
 * readiness probe.
 */
export function describeChannelReadiness(
  channel: NotificationChannel,
  env: NodeJS.ProcessEnv = process.env,
): ChannelReadiness {
  switch (channel) {
    case 'EMAIL':
      return { channel, ...emailAvailability(env) };
    case 'SMS':
      return { channel, ...smsAvailability(env) };
    case 'WHATSAPP':
      return { channel, ...whatsAppAvailability(env) };
    case 'PUSH':
      return { channel, ...pushAvailability(env) };
    case 'IN_APP':
      return {
        channel,
        provider: 'database',
        available: true,
        reason: null,
        missing: [],
      };
    default:
      return {
        channel,
        provider: notificationProviderForChannel(channel, env),
        available: false,
        reason: `Unsupported notification channel: ${String(channel)}.`,
        missing: [],
      };
  }
}
