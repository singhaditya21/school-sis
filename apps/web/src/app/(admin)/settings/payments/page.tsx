import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, CreditCard, HelpCircle, Info, Webhook } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { StripeConnectButton } from './stripe-connect-button';
import { getPaymentsSettings, maskAccountId } from './payments-settings-data';

export const metadata = {
    title: 'Payment Processing | ScholarMind',
};

export default async function PaymentsSettingsPage() {
    const settings = await getPaymentsSettings();
    const { state, canManage } = settings;

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground dark:text-white">
                    Payment Processing
                </h1>
                <p className="text-muted-foreground mt-1">
                    Stripe Connect lets parents pay invoices online, with funds settling into the school&apos;s own
                    bank account.
                </p>
            </div>

            {/* Connection state — read back from Stripe, not inferred from the database. */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        {state === 'READY' ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                        ) : state === 'ONBOARDING_INCOMPLETE' ? (
                            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        ) : state === 'STATUS_UNAVAILABLE' ? (
                            <HelpCircle className="h-5 w-5 text-muted-foreground" />
                        ) : (
                            <CreditCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        )}
                        Stripe Connect
                        <StateBadge state={state} />
                    </CardTitle>
                    <CardDescription>
                        {settings.connectedAccountId ? (
                            <>
                                Account{' '}
                                <span className="font-mono">{maskAccountId(settings.connectedAccountId)}</span>
                            </>
                        ) : (
                            'No Stripe account is linked to this school yet.'
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {state === 'PROVIDER_NOT_CONFIGURED' && (
                        <Notice tone="neutral">
                            <p className="font-medium text-foreground dark:text-white">
                                Stripe is not configured on this deployment.
                            </p>
                            <p className="text-muted-foreground">
                                The onboarding flow needs a <code className="font-mono">STRIPE_SECRET_KEY</code> on
                                the server, and a <code className="font-mono">STRIPE_WEBHOOK_SECRET</code> for
                                payments to be reconciled back into the fee ledger. Until both are set no school can
                                be connected, so no action is offered here.
                            </p>
                        </Notice>
                    )}

                    {state === 'NOT_STARTED' && (
                        <>
                            <p className="text-sm text-muted-foreground">
                                Onboarding happens on Stripe: bank details and identity verification are entered
                                there, and this page reads the resulting status back. Nothing is charged to set it up.
                            </p>
                            {canManage ? (
                                <StripeConnectButton />
                            ) : (
                                <Notice tone="neutral">
                                    <p className="text-muted-foreground">
                                        Your role can view this page but not change payment settings. An
                                        administrator needs to start Stripe onboarding.
                                    </p>
                                </Notice>
                            )}
                        </>
                    )}

                    {state === 'ONBOARDING_INCOMPLETE' && (
                        <>
                            <Notice tone="warning">
                                <p className="font-medium text-foreground dark:text-white">
                                    Onboarding is not finished — this account cannot take payments yet.
                                </p>
                                <p className="text-muted-foreground">
                                    A Stripe account exists for this school, but Stripe has not enabled charges on
                                    it. Parents attempting to pay online will be turned away until it is completed.
                                </p>
                            </Notice>
                            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                <Capability label="Details submitted" enabled={settings.detailsSubmitted} />
                                <Capability label="Charges enabled" enabled={settings.chargesEnabled} />
                                <Capability label="Payouts enabled" enabled={settings.payoutsEnabled} />
                            </dl>
                            {settings.requirementsDue.length > 0 && (
                                <div className="text-sm">
                                    <p className="font-medium text-foreground dark:text-white mb-1">
                                        Stripe is still waiting on:
                                    </p>
                                    <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground font-mono text-xs">
                                        {settings.requirementsDue.map((req) => (
                                            <li key={req}>{req}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {canManage && <StripeConnectButton label="Continue Stripe onboarding" />}
                        </>
                    )}

                    {state === 'READY' && (
                        <>
                            <Notice tone="success">
                                <p className="font-medium text-foreground dark:text-white">
                                    Stripe confirms this account can accept charges.
                                </p>
                                <p className="text-muted-foreground">
                                    {settings.payoutsEnabled
                                        ? 'Payouts to the linked bank account are enabled.'
                                        : 'Charges are enabled, but Stripe has not enabled payouts yet — collected funds will be held until it does.'}
                                </p>
                            </Notice>
                            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                                <Capability label="Details submitted" enabled={settings.detailsSubmitted} />
                                <Capability label="Charges enabled" enabled={settings.chargesEnabled} />
                                <Capability label="Payouts enabled" enabled={settings.payoutsEnabled} />
                            </dl>
                        </>
                    )}

                    {state === 'STATUS_UNAVAILABLE' && (
                        <Notice tone="neutral">
                            <p className="font-medium text-foreground dark:text-white">
                                An account is linked, but its status could not be confirmed.
                            </p>
                            <p className="text-muted-foreground">
                                Stripe did not answer when this page asked whether the account can take payments, so
                                nothing is claimed either way. Reload to try again.
                                {settings.statusError ? ` Reported: ${settings.statusError}` : ''}
                            </p>
                        </Notice>
                    )}
                </CardContent>
            </Card>

            {/* Webhook — the half that is easy to forget and silently breaks reconciliation. */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Webhook className="h-5 w-5 text-muted-foreground" />
                        Payment webhook
                    </CardTitle>
                    <CardDescription>
                        Stripe calls back to <code className="font-mono">/api/webhooks/stripe</code> when a payment
                        succeeds. That callback is what marks the invoice paid and issues the receipt.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {settings.webhookSecretConfigured ? (
                        <Notice tone="success">
                            <p className="text-muted-foreground">
                                A signing secret is configured on this deployment, so incoming Stripe events can be
                                verified and applied to the fee ledger.
                            </p>
                        </Notice>
                    ) : (
                        <Notice tone="warning">
                            <p className="font-medium text-foreground dark:text-white">
                                No webhook signing secret is configured.
                            </p>
                            <p className="text-muted-foreground">
                                Without <code className="font-mono">STRIPE_WEBHOOK_SECRET</code>, callbacks from
                                Stripe are rejected. A parent&apos;s card can be charged and the invoice will still
                                show as unpaid, because nothing writes the payment back.
                            </p>
                        </Notice>
                    )}
                </CardContent>
            </Card>

            {/* Whatever has actually flowed through, for this tenant. */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Online payment activity</CardTitle>
                    <CardDescription>
                        Checkout sessions started from this school and provider callbacks received for it.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <section>
                        <h3 className="text-sm font-medium text-foreground dark:text-white mb-2">
                            Checkout sessions
                        </h3>
                        {settings.orders.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No online checkout has been started for this school yet.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-xs uppercase text-muted-foreground border-b border-border dark:border-gray-800">
                                        <tr>
                                            <th className="py-2 text-left">Provider</th>
                                            <th className="py-2 text-left">Status</th>
                                            <th className="py-2 text-right">Sessions</th>
                                            <th className="py-2 text-right">Value</th>
                                            <th className="py-2 text-right">Last started</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {settings.orders.map((o) => (
                                            <tr key={`${o.provider}-${o.status}`}>
                                                <td className="py-2">{o.provider}</td>
                                                <td className="py-2">
                                                    <Badge variant="outline">{o.status}</Badge>
                                                </td>
                                                <td className="py-2 text-right">{o.orderCount}</td>
                                                <td className="py-2 text-right font-mono">
                                                    {formatCurrency(Number(o.amount))}
                                                </td>
                                                <td className="py-2 text-right text-muted-foreground">
                                                    {o.lastCreatedAt ? formatDate(o.lastCreatedAt) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <section>
                        <h3 className="text-sm font-medium text-foreground dark:text-white mb-2">
                            Provider callbacks
                        </h3>
                        {settings.events.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No provider events have been received for this school yet.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-xs uppercase text-muted-foreground border-b border-border dark:border-gray-800">
                                        <tr>
                                            <th className="py-2 text-left">Provider</th>
                                            <th className="py-2 text-right">Received</th>
                                            <th className="py-2 text-right">Failed</th>
                                            <th className="py-2 text-right">Last received</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {settings.events.map((e) => (
                                            <tr key={e.provider}>
                                                <td className="py-2">{e.provider}</td>
                                                <td className="py-2 text-right">{e.total}</td>
                                                <td
                                                    className={`py-2 text-right ${e.failed > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}
                                                >
                                                    {e.failed}
                                                </td>
                                                <td className="py-2 text-right text-muted-foreground">
                                                    {e.lastReceivedAt ? formatDate(e.lastReceivedAt) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </CardContent>
            </Card>
        </div>
    );
}

function StateBadge({ state }: { state: string }) {
    const map: Record<string, { label: string; className: string }> = {
        PROVIDER_NOT_CONFIGURED: { label: 'Not configured', className: '' },
        NOT_STARTED: { label: 'Not connected', className: '' },
        ONBOARDING_INCOMPLETE: {
            label: 'Onboarding incomplete',
            className: 'border-amber-300 text-amber-700 dark:border-amber-900/60 dark:text-amber-400',
        },
        READY: {
            label: 'Accepting payments',
            className: 'border-green-300 text-green-700 dark:border-green-900/60 dark:text-green-400',
        },
        STATUS_UNAVAILABLE: { label: 'Status unknown', className: '' },
    };
    const entry = map[state] ?? { label: state, className: '' };
    return (
        <Badge variant="outline" className={`font-normal ${entry.className}`}>
            {entry.label}
        </Badge>
    );
}

function Capability({ label, enabled }: { label: string; enabled: boolean | null }) {
    return (
        <div className="rounded-lg border border-border dark:border-gray-800 p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd
                className={`text-sm font-medium mt-0.5 ${
                    enabled === true
                        ? 'text-green-700 dark:text-green-400'
                        : enabled === false
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-muted-foreground'
                }`}
            >
                {enabled === true ? 'Yes' : enabled === false ? 'Not yet' : 'Unknown'}
            </dd>
        </div>
    );
}

function Notice({
    tone,
    children,
}: {
    tone: 'neutral' | 'warning' | 'success';
    children: React.ReactNode;
}) {
    const tones = {
        neutral: 'border-border dark:border-gray-800 bg-muted dark:bg-gray-900/40',
        warning: 'border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20',
        success: 'border-green-200 dark:border-green-900/50 bg-green-50/60 dark:bg-green-950/20',
    } as const;
    const icons = {
        neutral: <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />,
        warning: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />,
        success: <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />,
    } as const;

    return (
        <div className={`rounded-lg border p-4 ${tones[tone]}`}>
            <div className="flex gap-3 text-sm space-y-0">
                {icons[tone]}
                <div className="space-y-1">{children}</div>
            </div>
        </div>
    );
}
