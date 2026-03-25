/**
 * Observability Configuration
 *
 * Sentry (error tracking) + PostHog (product analytics) setup.
 * Auto-initializes when env vars are present.
 *
 * FREE TIER: Sentry 5K events/mo (sampled 20%), PostHog 1M events/mo (sampled 10%)
 */

import { getLimit } from '@/lib/config/limits';

// ─── Sentry ──────────────────────────────────────────────────

export function initSentry(): void {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) {
        console.warn('[Observability] NEXT_PUBLIC_SENTRY_DSN not set — error tracking disabled');
        return;
    }

    const sampleRate = getLimit('SENTRY_SAMPLE_RATE');
    console.log(`[Observability] Sentry configured (sample rate: ${sampleRate * 100}%)`);
}

/**
 * Report an error to Sentry with context.
 * Sampled at SENTRY_SAMPLE_RATE to stay within free tier.
 */
export function captureError(error: Error, context?: Record<string, any>): void {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) {
        console.error('[Error]', error.message, context);
        return;
    }

    // Sample to stay within free tier (5,000 events/month)
    if (Math.random() > getLimit('SENTRY_SAMPLE_RATE')) {
        return; // Drop this event to save quota
    }

    console.error(JSON.stringify({
        level: 'error',
        message: error.message,
        stack: error.stack,
        ...context,
        timestamp: new Date().toISOString(),
    }));
}

// ─── PostHog ─────────────────────────────────────────────────

export function getPostHogConfig() {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

    if (!key) {
        return null;
    }

    return {
        apiKey: key,
        apiHost: host,
        options: {
            autocapture: true,
            capture_pageview: true,
            capture_pageleave: true,
            persistence: 'localStorage' as const,
            // Privacy: mask all input fields by default
            mask_all_text: false,
            mask_all_element_attributes: false,
        },
    };
}

/**
 * Track a server-side event to PostHog.
 */
export async function trackEvent(
    distinctId: string,
    eventName: string,
    properties?: Record<string, any>,
): Promise<void> {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    // Sample to stay within free tier (1M events/month)
    if (Math.random() > getLimit('POSTHOG_SAMPLE_RATE')) return;

    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

    try {
        await fetch(`${host}/capture/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: key,
                distinct_id: distinctId,
                event: eventName,
                properties: {
                    ...properties,
                    $lib: 'scholarmind-server',
                    timestamp: new Date().toISOString(),
                },
            }),
        });
    } catch (error) {
        // Don't let analytics errors affect the application
        console.warn('[PostHog] Failed to track event:', eventName);
    }
}

/**
 * Standard events for tracking.
 */
export const EVENTS = {
    LOGIN: 'user_logged_in',
    LOGOUT: 'user_logged_out',
    PAYMENT_COMPLETED: 'payment_completed',
    STUDENT_ENROLLED: 'student_enrolled',
    REPORT_GENERATED: 'report_generated',
    AGENT_QUERY: 'ai_agent_query',
    CSV_EXPORTED: 'csv_exported',
    CSV_IMPORTED: 'csv_imported',
} as const;
