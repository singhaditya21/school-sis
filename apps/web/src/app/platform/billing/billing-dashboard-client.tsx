'use client';

import { useState } from 'react';
import {
    formatCommercialAmount,
    SAAS_SAC_CODE,
    type BillingCurrency,
} from '@/lib/billing/pricing-catalog';

export interface PlatformBillingInvoiceItem {
    id: string;
    rawId: string;
    school: string;
    students: number;
    amount: number;
    subtotalInr: number;
    gstInr: number;
    totalWithGstInr: number;
    amountUsd: number;
    status: string;
    date: string;
    tier: string;
}

export function PlatformBillingDashboardClient({
    invoices,
}: {
    invoices: PlatformBillingInvoiceItem[];
}) {
    const [currency, setCurrency] = useState<BillingCurrency>('INR');

    const activeInvoices = invoices.filter((i) => i.status === 'PAID' || i.status === 'ACTIVE');
    const pastDue = invoices.filter((i) => i.status === 'PAST_DUE' || i.status === 'UNPAID');

    const totalMrrBase = activeInvoices.reduce(
        (sum, inv) => sum + (currency === 'INR' ? inv.subtotalInr : inv.amountUsd),
        0,
    );
    const totalGstInr = activeInvoices.reduce((sum, inv) => sum + inv.gstInr, 0);
    const totalArrBase = totalMrrBase * 12;

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
                        Platform Billing &amp; GST Ledger
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Manage subscriptions, platform MRR/ARR, GST tax schedules (SAC {SAAS_SAC_CODE}), and tier assignments across all entities.
                    </p>
                </div>

                <div
                    role="group"
                    aria-label="Billing display currency"
                    className="inline-flex rounded-xl border border-border bg-muted p-1 self-start"
                >
                    <button
                        type="button"
                        data-testid="platform-billing-inr"
                        onClick={() => setCurrency('INR')}
                        className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                            currency === 'INR'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        🇮🇳 INR (₹) + GST
                    </button>
                    <button
                        type="button"
                        data-testid="platform-billing-usd"
                        onClick={() => setCurrency('USD')}
                        className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                            currency === 'USD'
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        🌍 USD ($)
                    </button>
                </div>
            </div>

            {/* Revenue Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-card p-6 rounded-2xl border border-border shadow-sm relative overflow-hidden">
                    <div className="absolute right-0 top-0 w-24 h-24 bg-accent rounded-bl-[100px] z-0" />
                    <div className="relative z-10">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Platform MRR (Est)
                        </p>
                        <span className="text-3xl font-bold tabular-nums text-foreground">
                            {formatCommercialAmount(totalMrrBase, currency)}
                        </span>
                        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                            ARR Run-Rate: {formatCommercialAmount(totalArrBase, currency)}
                        </p>
                    </div>
                </div>

                <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        {currency === 'INR' ? `Monthly GST (18% · SAC ${SAAS_SAC_CODE})` : 'Tax Regime'}
                    </p>
                    <span className="text-3xl font-bold tabular-nums text-foreground">
                        {currency === 'INR' ? formatCommercialAmount(totalGstInr, 'INR') : 'Export / Zero-Rated'}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                        {currency === 'INR'
                            ? `Gross Collectible: ${formatCommercialAmount(totalMrrBase + totalGstInr, 'INR')}`
                            : 'LUT / International SaaS Invoice'}
                    </p>
                </div>

                <div className="bg-success-subtle p-6 rounded-2xl border border-success/30 shadow-sm">
                    <p className="text-xs font-semibold text-success uppercase tracking-wider mb-2">
                        Active / Paid Accounts
                    </p>
                    <span className="text-3xl font-bold tabular-nums text-success-subtle-foreground">
                        {activeInvoices.length}
                    </span>
                    <span className="text-sm text-success ml-2">workspaces</span>
                </div>

                <div className="bg-destructive-subtle p-6 rounded-2xl border border-destructive/30 shadow-sm">
                    <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-2">
                        Past Due
                    </p>
                    <span className="text-3xl font-bold tabular-nums text-destructive-subtle-foreground">
                        {pastDue.length}
                    </span>
                    <span className="text-sm text-destructive ml-2">outstanding</span>
                </div>
            </div>

            {/* Invoice Table */}
            <div>
                <h2 className="text-2xl font-bold text-foreground mb-5">Recent Invoices &amp; Subscriptions</h2>
                <div className="bg-card border border-border rounded-2xl shadow-sm overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-muted border-b border-border">
                                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase">Invoice</th>
                                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase">School / Trust</th>
                                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase">Tier</th>
                                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase text-right">Active Students</th>
                                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase text-right">Subtotal / Mo</th>
                                {currency === 'INR' && (
                                    <th className="p-4 text-xs font-semibold text-muted-foreground uppercase text-right">18% GST</th>
                                )}
                                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase text-right">Total / Mo</th>
                                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase">Renewal</th>
                                <th className="p-4 text-xs font-semibold text-muted-foreground uppercase text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {invoices.map((inv) => {
                                const baseAmount = currency === 'INR' ? inv.subtotalInr : inv.amountUsd;
                                const grandTotal = currency === 'INR' ? inv.totalWithGstInr : inv.amountUsd;
                                return (
                                    <tr key={inv.rawId} className="hover:bg-muted transition-colors">
                                        <td className="p-4 font-mono text-xs text-primary font-medium">{inv.id}</td>
                                        <td className="p-4 font-medium text-foreground">{inv.school}</td>
                                        <td className="p-4">
                                            <span
                                                className={`px-3 py-1 text-xs font-bold rounded-full ${
                                                    inv.tier === 'ENTERPRISE'
                                                        ? 'bg-info-subtle text-info-subtle-foreground'
                                                        : inv.tier === 'AI_PRO'
                                                            ? 'bg-accent text-accent-foreground'
                                                            : 'bg-muted text-foreground'
                                                }`}
                                            >
                                                {inv.tier}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right tabular-nums text-sm text-muted-foreground">
                                            {inv.students.toLocaleString('en-IN')}
                                        </td>
                                        <td className="p-4 text-right tabular-nums font-medium text-foreground">
                                            {formatCommercialAmount(baseAmount, currency)}
                                        </td>
                                        {currency === 'INR' && (
                                            <td className="p-4 text-right tabular-nums text-sm text-muted-foreground">
                                                {formatCommercialAmount(inv.gstInr, 'INR')}
                                            </td>
                                        )}
                                        <td className="p-4 text-right tabular-nums font-semibold text-foreground">
                                            {formatCommercialAmount(grandTotal, currency)}
                                        </td>
                                        <td className="p-4 text-sm text-muted-foreground">{inv.date}</td>
                                        <td className="p-4 text-center">
                                            <span
                                                className={`px-3 py-1 text-xs font-bold rounded-full ${
                                                    inv.status === 'PAID' || inv.status === 'ACTIVE'
                                                        ? 'bg-success-subtle text-success-subtle-foreground'
                                                        : 'bg-destructive-subtle text-destructive-subtle-foreground'
                                                }`}
                                            >
                                                {inv.status}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
