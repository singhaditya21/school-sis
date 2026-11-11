import Link from 'next/link';
import { requireAuth } from '@/lib/auth/middleware';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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

    return (
        <div className="min-h-screen bg-muted/40 py-12 px-6">
            <div className="mx-auto max-w-5xl space-y-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <Badge variant="outline" className="mb-2">
                            Two-Factor Security Active
                        </Badge>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">
                            Select Your Workspace Plan
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Signed in as {session.email}. Continue with Core SIS immediately or request an enterprise activation.
                        </p>
                    </div>
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                    >
                        Continue to Dashboard →
                    </Link>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                    {WORKSPACE_PLANS.map((plan) => (
                        <Card key={plan.id} className="flex flex-col justify-between">
                            <CardHeader>
                                <CardTitle className="text-xl">{plan.name}</CardTitle>
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
                                    <Link
                                        href={plan.id === 'CORE' ? '/dashboard' : `/upgrade?plan=${plan.id}`}
                                        className="inline-flex w-full items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                                    >
                                        {plan.id === 'CORE' ? 'Start on Core SIS' : `Configure ${plan.name}`}
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
