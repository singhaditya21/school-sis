'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { UpgradePlanButton } from '@/app/pricing/pricing-actions-client';

function UpgradeContent() {
    const searchParams = useSearchParams();
    const feature = searchParams.get('feature') || 'premium';
    const requestedPlan = searchParams.get('plan');

    const featureMap: Record<string, string> = {
        hq: 'Group HQ Command Center',
        university: 'Higher Education & Degrees',
        coaching: 'Coaching Batches & Test Series',
        international: 'International Visas & Placements',
        ai: 'Governed School Assistant & Report Copilot',
        premium: 'Premium Institutional Modules',
    };

    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return (
            <div className="min-h-screen bg-muted flex items-center justify-center">
                <p className="text-muted-foreground">Loading...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-muted flex flex-col items-center justify-center p-4">
            <div className="bg-card p-10 rounded-3xl shadow-xl max-w-3xl w-full text-center border border-border">
                <div className="w-20 h-20 bg-info-subtle rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="text-4xl">🔒</span>
                </div>

                <h1 className="text-4xl font-extrabold text-foreground mb-4 tracking-tight">
                    Upgrade to Unlock {featureMap[feature] || featureMap.premium}
                </h1>

                <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
                    Activate <strong>Campus Pro (AI_PRO)</strong> or <strong>Multi-Campus Enterprise</strong> immediately via self-serve subscription checkout to unlock governed assistant tools, custom objects, and multi-campus administration.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 text-left">
                    <div
                        className={`p-6 rounded-2xl border flex flex-col justify-between gap-6 ${
                            requestedPlan === 'AI_PRO'
                                ? 'bg-accent border-primary/40 ring-2 ring-ring ring-offset-2'
                                : 'bg-muted border-border'
                        }`}
                    >
                        <div>
                            <h3 className="font-semibold text-foreground mb-1">Campus Pro + Governed AI</h3>
                            <p className="text-sm text-muted-foreground mb-4">Annual or monthly institutional billing</p>
                            <ul className="text-sm space-y-2 text-foreground">
                                <li>✓ Governed School Assistant &amp; BI Copilot</li>
                                <li>✓ Human-approved workflow controls</li>
                                <li>✓ Per-tenant daily usage budgets &amp; audit logs</li>
                            </ul>
                        </div>
                        <UpgradePlanButton
                            planType="AI_PRO"
                            label="Activate Campus Pro"
                            variant="primary"
                        />
                    </div>

                    <div
                        className={`p-6 rounded-2xl border flex flex-col justify-between gap-6 ${
                            requestedPlan === 'ENTERPRISE' || !requestedPlan
                                ? 'bg-accent border-primary/40 ring-2 ring-ring ring-offset-2'
                                : 'bg-muted border-border'
                        }`}
                    >
                        <div>
                            <h3 className="font-semibold text-accent-foreground mb-1">Multi-Campus Enterprise</h3>
                            <p className="text-sm text-primary mb-4">Full multi-campus &amp; platform studio</p>
                            <ul className="text-sm space-y-2 text-accent-foreground">
                                <li>✓ Multi-Campus Group Overview &amp; Policies</li>
                                <li>✓ Higher Ed, Coaching &amp; Schema Studio</li>
                                <li>✓ Enterprise SSO, SCIM &amp; Webhook Integrations</li>
                            </ul>
                        </div>
                        <UpgradePlanButton
                            planType="ENTERPRISE"
                            label="Activate Enterprise"
                            variant="primary"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap justify-center gap-4">
                    <Link
                        href="/pricing"
                        className="px-6 py-3 bg-card text-foreground rounded-xl font-medium hover:bg-muted transition-colors border border-border"
                    >
                        Compare All Plans
                    </Link>
                    <Link
                        href="/dashboard"
                        className="px-6 py-3 bg-card text-foreground rounded-xl font-medium hover:bg-muted transition-colors border border-border"
                    >
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default function UpgradePaywall() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-muted flex items-center justify-center">
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            }
        >
            <UpgradeContent />
        </Suspense>
    );
}
