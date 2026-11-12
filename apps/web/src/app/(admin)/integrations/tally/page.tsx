import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import TallyExportForm from './TallyExportForm';
import { LedgerMappingEditor } from './LedgerMappingEditor';
import { getAccountingStudioDataAction } from './tally-actions';
import { ArrowRightLeft, BookOpenCheck, FileSpreadsheet, Server } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function TallyIntegrationPage() {
    const studio = await getAccountingStudioDataAction();

    return (
        <div className="max-w-6xl mx-auto p-6 sm:p-8 space-y-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent border border-brass/40">
                            <FileSpreadsheet className="w-6 h-6 text-brass" />
                        </span>
                        TallyPrime, Zoho Books &amp; ERPNext Ledger Sync
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Zero-middleware double-entry voucher sync to TallyPrime XML, Zoho Books CSV, and open-source Frappe ERPNext JSON.
                    </p>
                </div>
                <Badge
                    variant="outline"
                    className="border-brass/40 bg-accent text-accent-foreground px-3 py-1.5 uppercase tracking-widest text-xs font-bold"
                >
                    <span className="w-2 h-2 rounded-full bg-success mr-2 inline-block" />
                    Zero-Cost Accounting Bridge
                </Badge>
            </div>

            {/* Live Ledger Readiness Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-border bg-card shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Settled Receipts Ready
                            </p>
                            <p className="text-2xl font-bold text-foreground mt-1">
                                {studio.completedPaymentStats.count}
                            </p>
                        </div>
                        <BookOpenCheck className="h-6 w-6 text-brass" />
                    </CardContent>
                </Card>

                <Card className="border-border bg-card shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Reconciled Volume
                            </p>
                            <p className="text-2xl font-bold text-foreground mt-1">
                                {formatCurrency(studio.completedPaymentStats.totalAmount)}
                            </p>
                        </div>
                        <ArrowRightLeft className="h-6 w-6 text-brass" />
                    </CardContent>
                </Card>

                <Card className="border-brass/35 bg-accent/35 shadow-sm">
                    <CardContent className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Supported Targets (₹0 Add-Ons)
                        </p>
                        <p className="text-sm font-semibold text-foreground mt-1.5">
                            TallyPrime XML · Zoho Books CSV · Frappe ERPNext
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            GUID-deduplicated receipt vouchers
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column - Export & Live Audit Sync History */}
                <div className="lg:col-span-1 space-y-6">
                    <Card className="border border-border shadow-sm rounded-xl">
                        <CardHeader className="bg-muted/60 border-b border-border pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <ArrowRightLeft className="w-5 h-5 text-brass" /> Export Accounting Vouchers
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <TallyExportForm
                                defaultFromDate={studio.completedPaymentStats.earliestDate}
                                defaultToDate={studio.completedPaymentStats.latestDate}
                                appOrigin={studio.appOrigin}
                            />
                        </CardContent>
                    </Card>

                    <Card
                        data-testid="accounting-sync-history-card"
                        className="border border-border shadow-sm rounded-xl"
                    >
                        <CardHeader className="bg-muted/60 border-b border-border pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Server className="w-5 h-5 text-brass" /> Live Sync Audit Log
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {studio.syncHistory.length === 0 ? (
                                <div className="p-5 text-xs text-muted-foreground leading-relaxed">
                                    No accounting exports recorded for this campus yet. Run an export above to log an audited batch.
                                </div>
                            ) : (
                                <div className="divide-y divide-border">
                                    {studio.syncHistory.map((item) => (
                                        <div
                                            key={item.id}
                                            className="p-4 flex items-center justify-between gap-3 text-sm"
                                        >
                                            <div className="min-w-0">
                                                <p className="font-semibold text-foreground truncate">
                                                    {item.format.toUpperCase().replace('_', ' ')} ·{' '}
                                                    {item.voucherCount} Voucher{item.voucherCount !== 1 ? 's' : ''}
                                                </p>
                                                <p className="text-muted-foreground text-xs">
                                                    {item.fromDate && item.toDate
                                                        ? `${item.fromDate} → ${item.toDate}`
                                                        : new Date(item.createdAtIso).toLocaleDateString('en-IN')}
                                                </p>
                                            </div>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    item.status === 'SUCCESS'
                                                        ? 'border-success/30 bg-success-subtle text-success text-xs'
                                                        : 'border-destructive/30 bg-destructive-subtle text-destructive text-xs'
                                                }
                                            >
                                                {item.status}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column - Interactive Ledger Mapping Editor */}
                <div className="lg:col-span-2">
                    <LedgerMappingEditor initialConfig={studio.config} />
                </div>
            </div>
        </div>
    );
}
