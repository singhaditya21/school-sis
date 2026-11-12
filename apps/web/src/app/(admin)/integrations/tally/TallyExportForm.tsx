'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, FileDown, Loader2, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import {
    buildTallyLocalBridgeCommand,
    type AccountingExportFormat,
} from '@/lib/integrations/accounting-vouchers';

const EXPORT_FORMATS: {
    id: AccountingExportFormat;
    label: string;
    subtitle: string;
    ext: string;
}[] = [
    {
        id: 'tally_xml',
        label: 'TallyPrime / ERP 9 XML',
        subtitle: 'Native <ENVELOPE> XML with GUID deduplication',
        ext: 'xml',
    },
    {
        id: 'zoho_csv',
        label: 'Zoho Books / Busy CSV',
        subtitle: 'Double-entry Receipt Journal CSV (₹0 middleware)',
        ext: 'csv',
    },
    {
        id: 'erpnext_json',
        label: 'Frappe ERPNext JSON (Open-Source)',
        subtitle: 'frappe/erpnext ₹0 open-source accounting ERP',
        ext: 'json',
    },
];

export default function TallyExportForm({
    defaultFromDate,
    defaultToDate,
    appOrigin,
}: {
    defaultFromDate?: string;
    defaultToDate?: string;
    appOrigin?: string;
}) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const today = new Date().toISOString().slice(0, 10);

    const [fromDate, setFromDate] = useState(defaultFromDate || today);
    const [toDate, setToDate] = useState(defaultToDate || today);
    const [format, setFormat] = useState<AccountingExportFormat>('tally_xml');

    const selectedMeta = EXPORT_FORMATS.find((f) => f.id === format) || EXPORT_FORMATS[0];

    const handleExport = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const response = await fetch('/api/integrations/tally/vouchers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fromDate, toDate, format }),
            });

            if (!response.ok) {
                throw new Error('Export failed');
            }

            const voucherCount = response.headers.get('x-voucher-count') || '0';
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `scholarmind_${format}_${fromDate}_to_${toDate}.${selectedMeta.ext}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            toast.success(
                `Exported ${voucherCount} completed payment voucher(s) as ${selectedMeta.label}.`,
            );
            router.refresh();
        } catch {
            toast.error(
                'Failed to generate accounting export. Please verify the date range and try again.',
            );
        } finally {
            setIsLoading(false);
        }
    };

    const bridgeCmd = buildTallyLocalBridgeCommand(
        appOrigin || 'https://school-sis-web.vercel.app',
        fromDate,
        toDate,
    );

    return (
        <form onSubmit={handleExport} className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="accountingFormat" className="text-foreground text-xs font-semibold uppercase tracking-wider">
                    Accounting Target Format
                </Label>
                <select
                    id="accountingFormat"
                    data-testid="accounting-format-select"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as AccountingExportFormat)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                    {EXPORT_FORMATS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <p className="text-xs text-muted-foreground">{selectedMeta.subtitle}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="fromDate" className="text-foreground text-xs">
                        From Date
                    </Label>
                    <Input
                        id="fromDate"
                        data-testid="accounting-from-date"
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        required
                        className="border-border"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="toDate" className="text-foreground text-xs">
                        To Date
                    </Label>
                    <Input
                        id="toDate"
                        data-testid="accounting-to-date"
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        required
                        className="border-border"
                    />
                </div>
            </div>

            <Button
                type="submit"
                disabled={isLoading}
                data-testid="download-accounting-export-btn"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center justify-center gap-2 h-11"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating {selectedMeta.ext.toUpperCase()}...
                    </>
                ) : (
                    <>
                        <FileDown className="w-4 h-4 text-brass" />
                        Download {selectedMeta.label}
                    </>
                )}
            </Button>

            <div className="rounded-lg border border-brass/35 bg-accent/35 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Terminal className="h-3.5 w-3.5 text-brass" />
                        Free localhost:9000 Tally Bridge
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            navigator.clipboard?.writeText(bridgeCmd);
                            toast.success('Copied free TallyPrime localhost:9000 XML sync command');
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                    >
                        <Copy className="h-3 w-3 text-brass" />
                        Copy CLI
                    </button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Streams XML directly into TallyPrime&apos;s built-in local HTTP server on port 9000 with ₹0 third-party plugins.
                </p>
            </div>
        </form>
    );
}
