import { redirect } from 'next/navigation';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import { getStripeClient } from '@/lib/payments/providers';

/**
 * Payment-processing settings.
 *
 * The trap this page has to avoid: `tenants.stripe_connect_account_id` is
 * written the moment a Connect account is *created*, which is before the school
 * has submitted anything to Stripe. A non-null column therefore means "an
 * account exists", not "payments work". Onboarding status is read back from
 * Stripe so the page can tell the difference instead of announcing success.
 */

/** Bound the Stripe round-trip so a slow provider cannot hang the page. */
const STRIPE_STATUS_TIMEOUT_MS = 8000;

export type StripeOnboardingState =
    /** No STRIPE_SECRET_KEY on this deployment — the Connect flow cannot run at all. */
    | 'PROVIDER_NOT_CONFIGURED'
    /** Provider configured, no Connect account created for this school yet. */
    | 'NOT_STARTED'
    /** Account exists but Stripe has not enabled charges on it yet. */
    | 'ONBOARDING_INCOMPLETE'
    /** Stripe confirms the account can take charges. */
    | 'READY'
    /** Account exists but Stripe could not be reached to confirm its state. */
    | 'STATUS_UNAVAILABLE';

export type ProviderOrderSummary = {
    provider: string;
    status: string;
    orderCount: number;
    amount: string;
    lastCreatedAt: Date | string | null;
};

export type ProviderEventSummary = {
    provider: string;
    total: number;
    failed: number;
    lastReceivedAt: Date | string | null;
};

export type PaymentsSettings = {
    canManage: boolean;
    /** Server-side credential presence. Never the values themselves. */
    secretKeyConfigured: boolean;
    webhookSecretConfigured: boolean;
    connectedAccountId: string | null;
    state: StripeOnboardingState;
    detailsSubmitted: boolean | null;
    chargesEnabled: boolean | null;
    payoutsEnabled: boolean | null;
    /** Stripe's own list of what it is still waiting for. */
    requirementsDue: string[];
    /** Why the status could not be read, when `state` is STATUS_UNAVAILABLE. */
    statusError: string | null;
    orders: ProviderOrderSummary[];
    events: ProviderEventSummary[];
};

/** A Connect account id is not a secret, but it does not need to be shown whole. */
export function maskAccountId(accountId: string): string {
    if (accountId.length <= 12) return accountId;
    return `${accountId.slice(0, 8)}…${accountId.slice(-4)}`;
}

function isStripeSecretConfigured(): boolean {
    // Mirrors requirePaymentSecret('STRIPE_SECRET_KEY', 16) in lib/payments/providers.
    return (process.env.STRIPE_SECRET_KEY ?? '').length >= 16;
}

function isStripeWebhookSecretConfigured(): boolean {
    return (process.env.STRIPE_WEBHOOK_SECRET ?? '').length >= 16;
}

async function requireSettingsRead(): Promise<{ tenantId: string; canManage: boolean }> {
    const { tenantId, session } = await requireAuth();
    const role = session.role as UserRole;
    if (!hasPermission(role, 'settings:read')) {
        redirect('/unauthorized');
    }
    return { tenantId, canManage: hasPermission(role, 'settings:write') };
}

export async function getPaymentsSettings(): Promise<PaymentsSettings> {
    const { tenantId, canManage } = await requireSettingsRead();

    const tenantResult = await pool.query<{ stripeConnectAccountId: string | null }>(
        `SELECT stripe_connect_account_id AS "stripeConnectAccountId"
         FROM tenants
         WHERE id = $1`,
        [tenantId],
    );
    const connectedAccountId = tenantResult.rows[0]?.stripeConnectAccountId ?? null;

    const [orders, events] = await Promise.all([
        getProviderOrders(tenantId),
        getProviderEvents(tenantId),
    ]);

    const secretKeyConfigured = isStripeSecretConfigured();
    const base = {
        canManage,
        secretKeyConfigured,
        webhookSecretConfigured: isStripeWebhookSecretConfigured(),
        connectedAccountId,
        detailsSubmitted: null,
        chargesEnabled: null,
        payoutsEnabled: null,
        requirementsDue: [] as string[],
        statusError: null as string | null,
        orders,
        events,
    };

    if (!secretKeyConfigured) {
        return { ...base, state: 'PROVIDER_NOT_CONFIGURED' };
    }
    if (!connectedAccountId) {
        return { ...base, state: 'NOT_STARTED' };
    }

    try {
        const stripe = getStripeClient();
        const account = await stripe.accounts.retrieve(
            connectedAccountId,
            {},
            { timeout: STRIPE_STATUS_TIMEOUT_MS },
        );

        const chargesEnabled = account.charges_enabled === true;
        const detailsSubmitted = account.details_submitted === true;

        return {
            ...base,
            state: chargesEnabled && detailsSubmitted ? 'READY' : 'ONBOARDING_INCOMPLETE',
            detailsSubmitted,
            chargesEnabled,
            payoutsEnabled: account.payouts_enabled === true,
            requirementsDue: account.requirements?.currently_due ?? [],
        };
    } catch (error) {
        return {
            ...base,
            state: 'STATUS_UNAVAILABLE',
            statusError: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

async function getProviderOrders(tenantId: string): Promise<ProviderOrderSummary[]> {
    const { rows } = await pool.query<ProviderOrderSummary>(
        `SELECT
            provider,
            status,
            COUNT(*)::int             AS "orderCount",
            COALESCE(SUM(amount), 0)  AS amount,
            MAX(created_at)           AS "lastCreatedAt"
         FROM payment_orders
         WHERE tenant_id = $1
         GROUP BY provider, status
         ORDER BY provider, status`,
        [tenantId],
    );
    return rows;
}

async function getProviderEvents(tenantId: string): Promise<ProviderEventSummary[]> {
    const { rows } = await pool.query<ProviderEventSummary>(
        `SELECT
            provider,
            COUNT(*)::int                                       AS total,
            COUNT(*) FILTER (WHERE status = 'FAILED')::int      AS failed,
            MAX(received_at)                                    AS "lastReceivedAt"
         FROM payment_provider_events
         WHERE tenant_id = $1
         GROUP BY provider
         ORDER BY provider`,
        [tenantId],
    );
    return rows;
}
