import Link from 'next/link';
import { requireAuth } from '@/lib/auth/middleware';
import { getSession } from '@/lib/auth/session';
import { Badge } from '@/components/ui/badge';
import { WorkspacePricingGridClient } from './pricing-plans-client';

export const metadata = {
    title: 'Workspace Plan & Activation | ScholarMind',
};

export default async function WorkspacePricingPage() {
    const { session } = await requireAuth();
    const fullSession = await getSession();
    const currentTier = fullSession.subscriptionTier || 'CORE';

    return (
        <div className="min-h-screen bg-muted/40 py-12 px-6">
            <div className="mx-auto max-w-6xl space-y-8">
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
                            Signed in as {session.email}. Core SIS is active immediately — complete your 1-minute academic setup, import legacy ERP data, or upgrade anytime.
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
                            href="/settings/import"
                            className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
                        >
                            Import Legacy ERP CSV →
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

                <WorkspacePricingGridClient currentTier={currentTier} />
            </div>
        </div>
    );
}
