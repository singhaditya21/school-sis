'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    computeGstBreakdown,
    estimateMonthlySubscription,
    formatCommercialAmount,
    isValidIndianGstin,
    SAAS_SAC_CODE,
    WORKSPACE_PLANS_CATALOG,
    type BillingCurrency,
} from '@/lib/billing/pricing-catalog';
import { UpgradePlanButton } from './pricing-actions-client';

export function WorkspacePricingGridClient({
    currentTier,
    initialStudentCount = 500,
}: {
    currentTier: string;
    initialStudentCount?: number;
}) {
    const [currency, setCurrency] = useState<BillingCurrency>('INR');
    const [studentCount, setStudentCount] = useState<number>(
        initialStudentCount > 0 ? initialStudentCount : 500,
    );
    const [gstin, setGstin] = useState('');

    const trimmedGstin = gstin.trim().toUpperCase();
    const gstinValid = trimmedGstin.length === 0 || isValidIndianGstin(trimmedGstin);

    return (
        <div className="space-y-6">
            {/* Commercial Controls: India INR + GST Default | International USD Toggle */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Billing Region &amp; Currency
                    </span>
                    <div
                        role="group"
                        aria-label="Billing currency selector"
                        className="inline-flex rounded-xl border border-border bg-muted p-1"
                    >
                        <button
                            type="button"
                            data-testid="currency-toggle-inr"
                            onClick={() => setCurrency('INR')}
                            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                                currency === 'INR'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            🇮🇳 India — INR (₹) + 18% GST
                        </button>
                        <button
                            type="button"
                            data-testid="currency-toggle-usd"
                            onClick={() => setCurrency('USD')}
                            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                                currency === 'USD'
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            🌍 International — USD ($)
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 max-w-xl">
                    <div className="space-y-1.5">
                        <Label htmlFor="pricing-student-estimator" className="text-xs font-semibold">
                            Estimated Active Students ({studentCount.toLocaleString('en-IN')})
                        </Label>
                        <Input
                            id="pricing-student-estimator"
                            type="number"
                            min={50}
                            max={25000}
                            step={50}
                            value={studentCount}
                            onChange={(e) => {
                                const parsed = Number(e.target.value);
                                setStudentCount(Number.isFinite(parsed) && parsed >= 50 ? Math.min(parsed, 25000) : 50);
                            }}
                        />
                    </div>

                    {currency === 'INR' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="pricing-school-gstin" className="text-xs font-semibold">
                                School / Trust GSTIN (Optional · SAC {SAAS_SAC_CODE})
                            </Label>
                            <Input
                                id="pricing-school-gstin"
                                placeholder="e.g. 07AAACB2894G1Z2"
                                maxLength={15}
                                value={gstin}
                                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                            />
                            {!gstinValid && (
                                <p className="text-[11px] text-destructive">
                                    Enter a valid 15-character Indian GSTIN or leave blank.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* 3-Tier Plan Cards */}
            <div className="grid gap-6 md:grid-cols-3">
                {WORKSPACE_PLANS_CATALOG.map((plan) => {
                    const isCurrent = currentTier === plan.id;
                    const estimate = estimateMonthlySubscription(plan.id, studentCount, {
                        applyCampusFloor: true,
                    });
                    const annualBaseInr = estimate.subtotalInr * 12;
                    const annualGst = computeGstBreakdown(annualBaseInr);

                    return (
                        <Card
                            key={plan.id}
                            className={`flex flex-col justify-between ${
                                plan.id === 'AI_PRO' ? 'border-primary shadow-md' : ''
                            }`}
                        >
                            <CardHeader className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                                    <div className="flex items-center gap-1.5">
                                        {plan.badge && !isCurrent && (
                                            <Badge variant="default">{plan.badge}</Badge>
                                        )}
                                        {isCurrent && <Badge variant="secondary">Active</Badge>}
                                    </div>
                                </div>
                                <CardDescription>{plan.summary}</CardDescription>

                                <div className="rounded-xl border border-border bg-muted/50 p-3.5 space-y-1">
                                    {currency === 'INR' ? (
                                        <>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-2xl font-bold tabular-nums text-foreground">
                                                    ₹{plan.inrPerStudentMonthly}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    / student / month + GST
                                                </span>
                                            </div>
                                            <p className="text-xs font-medium text-foreground tabular-nums">
                                                Est. {formatCommercialAmount(estimate.subtotalInr, 'INR')}/mo
                                                {' '}({formatCommercialAmount(annualGst.subtotalInr, 'INR')}/yr + 18% GST ={' '}
                                                <span className="font-semibold">
                                                    {formatCommercialAmount(annualGst.grandTotalInr, 'INR')}/yr
                                                </span>
                                                )
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                Min campus floor {formatCommercialAmount(plan.inrAnnualFloor, 'INR')}/yr · SAC {SAAS_SAC_CODE}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-2xl font-bold tabular-nums text-foreground">
                                                    ${plan.usdPerStudentMonthly}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    / student / month
                                                </span>
                                            </div>
                                            <p className="text-xs font-medium text-foreground tabular-nums">
                                                Est. {formatCommercialAmount(estimate.amountUsd, 'USD')}/mo
                                                {' '}({formatCommercialAmount(estimate.amountUsd * 12, 'USD')}/yr billed annually)
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                                Min campus floor {formatCommercialAmount(plan.usdAnnualFloor, 'USD')}/yr
                                            </p>
                                        </>
                                    )}
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    {plan.features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-2">
                                            <span aria-hidden="true" className="text-primary font-bold">
                                                ✓
                                            </span>
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
                                            variant={plan.id === 'AI_PRO' ? 'primary' : 'outline'}
                                            currency={currency}
                                            gstin={gstinValid ? trimmedGstin : ''}
                                            estimatedStudents={studentCount}
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
    );
}
