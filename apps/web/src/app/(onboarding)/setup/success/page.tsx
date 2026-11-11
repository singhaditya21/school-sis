import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { requireAuth } from '@/lib/auth/middleware';
import { getSession } from '@/lib/auth/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const metadata = {
    title: 'Subscription Activated | ScholarMind',
};

export default async function SetupSuccessPage() {
    await requireAuth();
    const session = await getSession();

    return (
        <div className="min-h-screen bg-muted/40 flex items-center justify-center py-12 px-6">
            <Card className="max-w-xl w-full shadow-xl border-border">
                <CardHeader className="text-center space-y-3">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success">
                        <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <Badge variant="outline" className="mx-auto w-fit">
                        Subscription Confirmed
                    </Badge>
                    <CardTitle className="text-2xl font-bold">
                        Your workspace subscription is active
                    </CardTitle>
                    <CardDescription>
                        Billing synchronization completes automatically via verified Stripe webhook events.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {session.tenantCode && (
                        <div className="rounded-xl border border-border bg-muted/60 p-4 text-center">
                            <p className="text-xs uppercase tracking-wider text-muted-foreground">
                                Your School Sign-In Code
                            </p>
                            <p
                                className="mt-1 font-mono text-2xl font-bold tracking-widest text-foreground"
                                data-testid="workspace-school-code"
                            >
                                {session.tenantCode}
                            </p>
                            {session.tenantDomain && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {session.tenantDomain}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Link
                            href="/onboarding"
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                        >
                            Configure Academic Year &amp; Classes
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                            href="/dashboard"
                            className="inline-flex flex-1 items-center justify-center rounded-lg border border-border bg-background px-5 py-3 text-sm font-medium text-foreground hover:bg-muted"
                        >
                            Open Dashboard
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
