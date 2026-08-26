/**
 * Shared types and pure helpers for the admin Messages surfaces.
 * Kept out of `actions.ts` because a `'use server'` module may only export
 * async functions.
 */

/** Mirrors the `msg_template_channel` enum. Do not add values that are not in the enum. */
export const MESSAGE_CHANNELS = ['SMS', 'WHATSAPP', 'EMAIL'] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const CHANNEL_LABEL: Record<MessageChannel, string> = {
    SMS: 'SMS',
    WHATSAPP: 'WhatsApp',
    EMAIL: 'Email',
};

export const CHANNEL_ICON: Record<MessageChannel, string> = {
    SMS: '📱',
    WHATSAPP: '💬',
    EMAIL: '📧',
};

/** Mirrors the `msg_template_status` enum. */
export type MessageLogStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';

export type TemplateRow = {
    id: string;
    name: string;
    channel: MessageChannel;
    subject: string | null;
    body: string;
    variables: string[];
    isActive: boolean;
    createdAt: string;
    usageCount: number;
};

export type MessageLogRow = {
    id: string;
    channel: MessageChannel;
    subject: string | null;
    message: string;
    recipients: string[];
    recipientCount: number;
    status: MessageLogStatus;
    deliveryCount: number;
    failureCount: number;
    sentAt: string | null;
    templateName: string | null;
    outboxPending: number;
    outboxSent: number;
    outboxFailed: number;
};

export type OutboxRow = {
    id: string;
    channel: string;
    status: string;
    provider: string;
    recipient: string;
    subject: string | null;
    body: string;
    attempts: number;
    maxAttempts: number;
    lastError: string | null;
    providerMessageId: string | null;
    createdAt: string;
    scheduledFor: string;
    sentAt: string | null;
    lastEventAt: string | null;
};

export type ChannelAvailability = {
    channel: MessageChannel;
    /** Resolved provider name, or 'unconfigured' when no env var names one. */
    provider: string;
    /** True when the outbox will accept a queue request on this channel. */
    configured: boolean;
    /** Why it will not, when `configured` is false. */
    reason: string | null;
};

export type MessagingOverview = {
    templates: number;
    activeTemplates: number;
    batches: number;
    recipients: number;
    queued: number;
    failed: number;
    /** Outbox rows a dispatcher has actually reported on. Zero until a worker runs. */
    dispatched: number;
};

export type RecipientOption = {
    id: string;
    label: string;
    detail: string;
    gradeId: string | null;
    email: string | null;
    phone: string | null;
};

export type GradeOption = { id: string; name: string };

export type QueueResult = {
    success: boolean;
    error?: string;
    batchId?: string;
    queued: number;
    rejected: number;
};

export function isMessageChannel(value: string): value is MessageChannel {
    return (MESSAGE_CHANNELS as readonly string[]).includes(value);
}

export function normaliseChannel(value: string): MessageChannel | null {
    const upper = value.trim().toUpperCase();
    return isMessageChannel(upper) ? upper : null;
}

/** Pulls `{{token}}` placeholders out of a template body/subject, de-duplicated, in order. */
export function extractTemplateVariables(text: string): string[] {
    const found = new Set<string>();
    for (const match of text.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
        found.add(match[1]);
    }
    return [...found];
}

/** Substitutes `{{token}}` with a supplied value; unknown tokens are left visible. */
export function applyTemplateVariables(text: string, values: Record<string, string>): string {
    return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (whole, token: string) =>
        values[token] !== undefined && values[token] !== '' ? values[token] : whole,
    );
}

/** The channel a recipient value must satisfy: email address vs phone number. */
export function recipientValueFor(option: RecipientOption, channel: MessageChannel): string | null {
    return channel === 'EMAIL' ? option.email : option.phone;
}
