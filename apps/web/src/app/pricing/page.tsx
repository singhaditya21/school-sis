import Link from 'next/link';
import { requireAuth } from '@/lib/auth/middleware';
import { getSession } from '@/lib/auth/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UpgradePlanButton } from './pricing-actions-client';

export const metadata = {
    title: 'Workspace Plan & Activation | ScholarMind',
};

const WORKSPACE_PLANS = [
    {
        id: 'CORE',
        name: 'Core SIS',
        summary: 'Admissions, student records, attendance, timetable, exams, and fee ledger.',
        features: [
            'Student & guardian registry with encrypted PII',
            'Attendance, grading, and report card workflows',
            'Fee plans, invoicing, receipts, and reconciliation',
        ],
    },
    {
        id: 'AI_PRO',
        name: 'Campus Pro + Governed AI',
        summary: 'Core SIS plus governed AI assistant, analytics, and parent communication automation.',
        features: [
            'Everything in Core SIS',
            'Governed AI Spine with approval-gated actions',
            'Executive analytics & notification automation',
        ],
    },
    {
        id: 'ENTERPRISE',
        name: 'Multi-Campus Enterprise',
        summary: 'Multi-campus command center, custom object studio, SSO/SCIM, and dedicated governance.',
        features: [
            'Multi-campus hierarchy & policy mandates',
            'Schema Studio, workflows, and Experience Portals',
            'SCIM 2.0 provisioning & OIDC/SAML SSO',
        ],
    },
] as const;

export default async function WorkspacePricingPage() {
    const { session } = await requireAuth();
    const fullSession = await getSession();
    const currentTier = fullSession.subscriptionTier || 'CORE';

    return (
        <div className="min-h-screen bg-muted/40 py-12 px-6">
            <div className="mx-auto max-w-5xl space-y-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <Badge variant="outline">
                                Two-Factor Security Active
                            </Badge>
                            <Badge variant="secondary">
                                Active Plan: {currentTier}
                            </Badge>
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">
                            Your School Workspace Is Live
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Signed in as {session.email}. Core SIS is active immediately — complete your 1-minute academic setup or upgrade anytime.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Link
                            href="/onboarding"
                            data-testid="continue-onboarding-button"
                            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                        >
                            Complete 1-Minute School Setup →
                        </Link>
                        <Link
                            href="/dashboard"
                            className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
                        >
                            Continue to Dashboard →
                        </Link>
                    </div>
                </div>

                {fullSession.tenantCode && (
                    <div className="rounded-2xl border border-primary/20 bg-card p-6 shadow-sm flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                                Save Your School Sign-In Credentials
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Staff, teachers, parents, and students use this School Code to sign in at <span className="font-mono text-foreground">/login</span>.
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="rounded-xl border border-border bg-muted px-5 py-3 text-center">
                                <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                                    School Code
                                </span>
                                <span
                                    data-testid="workspace-school-code"
                                    className="font-mono text-xl font-bold tracking-widest text-foreground"
                                >
                                    {fullSession.tenantCode}
                                </span>
                            </div>
                            {fullSession.tenantDomain && (
                                <div className="hidden md:block text-right">
                                    <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                                        Workspace Domain
                                    </span>
                                    <span className="font-mono text-sm text-foreground">
                                        {fullSession.tenantDomain}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="grid gap-6 md:grid-cols-3">
                    {WORKSPACE_PLANS.map((plan) => {
                        const isCurrent = currentTier === plan.id;
                        return (
                            <Card key={plan.id} className="flex flex-col justify-between">
                                <CardHeader>
                                    <div className="flex items-center justify-between gap-2">
                                        <CardTitle className="text-xl">{plan.name}</CardTitle>
                                        {isCurrent && (
                                            <Badge variant="secondary">Active</Badge>
                                        )}
                                    </div>
                                    <CardDescription>{plan.summary}</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <ul className="space-y-2 text-sm text-muted-foreground">
                                        {plan.features.map((feature) => (
                                            <li key={feature} className="flex items-start gap-2">
                                                <span aria-hidden="true">✓</span>
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="pt-2">
                                        {plan.id === 'CORE' ? (
                                            <Link
                                                href="/onboarding"
                                                className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                                            >
                                                {isCurrent ? 'Continue on Core SIS →' : 'Included in Plan'}
                                            </Link>
                                        ) : (
                                            <UpgradePlanButton
                                                planType={plan.id}
                                                label={isCurrent ? `${plan.name} Active` : `Upgrade to ${plan.name}`}
                                            />
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
