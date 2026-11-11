'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { launchDemoSandboxAction, type DemoPersonaKey } from '@/lib/actions/demo-sandbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const PERSONA_CARDS: Array<{
    key: DemoPersonaKey;
    title: string;
    badge: string;
    subtitle: string;
    highlights: string[];
}> = [
    {
        key: 'FINANCE_LEAD',
        title: 'Finance & Operations Lead',
        badge: 'Recommended First Tour',
        subtitle: 'Explore fee collections, overdue ageing, 4-eyes approvals, WhatsApp pay links, and Tally XML sync.',
        highlights: [
            'Live ₹ fee ledger, receipts & defaulter ageing buckets',
            '1-click WhatsApp UPI payment link generator on invoices',
            'Maker-Checker action approvals & Tally Prime XML export',
        ],
    },
    {
        key: 'REGISTRAR',
        title: 'Registrar & Admissions Head',
        badge: '48h Migration Tour',
        subtitle: 'Test student registry, encrypted guardian PII, admissions pipeline, and the Legacy ERP CSV Importer.',
        highlights: [
            '48-Hour Legacy ERP Excel/CSV Migration Wizard (/settings/import)',
            'Encrypted guardian phone/email vault & sibling linking',
            'Admissions CRM, document checklists & transfer certificates',
        ],
    },
    {
        key: 'TEACHER',
        title: 'Class Teacher Portal',
        badge: 'Classroom Daily Loop',
        subtitle: 'Experience the distraction-free teacher workspace for daily roll-call attendance, homework, and marks.',
        highlights: [
            '30-second section attendance marking',
            'Homework assignments, lesson plans & digital diary',
            'Class exam gradebook & timetable view',
        ],
    },
    {
        key: 'PARENT',
        title: 'Parent / Guardian Portal',
        badge: 'Parent UPI Experience',
        subtitle: 'View sibling attendance, download verified fee receipts, and launch Razorpay UPI / Card fee checkout.',
        highlights: [
            'Multi-child fee overview (Aarav & Diya Sharma)',
            'Instant PDF receipt download & ledger transparency',
            'Online UPI / NetBanking / Card payment checkout',
        ],
    },
];

export function DemoLauncherClient() {
    const router = useRouter();
    const [activePersona, setActivePersona] = useState<DemoPersonaKey | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleLaunch(key: DemoPersonaKey) {
        setError(null);
        setActivePersona(key);
        startTransition(async () => {
            const result = await launchDemoSandboxAction(key);
            if (result.error || !result.redirectTo) {
                setError(result.error || 'Failed to launch demo workspace.');
                setActivePersona(null);
                return;
            }
            router.push(result.redirectTo);
        });
    }

    return (
        <div className="space-y-8">
            {error && (
                <div
                    role="alert"
                    data-testid="demo-launch-error"
                    className="rounded-xl border border-destructive/30 bg-destructive-subtle p-4 text-sm text-destructive-subtle-foreground"
                >
                    {error}
                </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
                {PERSONA_CARDS.map((card) => {
                    const loadingThis = isPending && activePersona === card.key;
                    return (
                        <Card
                            key={card.key}
                            className={`flex flex-col justify-between transition hover:border-primary/60 ${
                                card.key === 'FINANCE_LEAD' ? 'border-primary shadow-md' : ''
                            }`}
                        >
                            <CardHeader className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="text-xl">{card.title}</CardTitle>
                                    <Badge variant={card.key === 'FINANCE_LEAD' ? 'default' : 'secondary'}>
                                        {card.badge}
                                    </Badge>
                                </div>
                                <CardDescription>{card.subtitle}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    {card.highlights.map((item) => (
                                        <li key={item} className="flex items-start gap-2">
                                            <span aria-hidden="true" className="text-primary font-bold">
                                                ✓
                                            </span>
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>

                                <Button
                                    type="button"
                                    data-testid={`launch-demo-${card.key.toLowerCase()}`}
                                    disabled={isPending}
                                    variant={card.key === 'FINANCE_LEAD' ? 'default' : 'outline'}
                                    className="w-full"
                                    onClick={() => handleLaunch(card.key)}
                                >
                                    {loadingThis
                                        ? 'Opening live sandbox…'
                                        : `Enter as ${card.title} →`}
                                </Button>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="font-semibold text-foreground">
                        Ready to create your own isolated school workspace?
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Provision a dedicated Core SIS tenant with two-factor security in under 60 seconds.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Link
                        href="/setup"
                        className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                        Create Dedicated School Workspace →
                    </Link>
                    <Link
                        href="/login"
                        className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
                    >
                        Back to Sign In
                    </Link>
                </div>
            </div>
        </div>
    );
}
