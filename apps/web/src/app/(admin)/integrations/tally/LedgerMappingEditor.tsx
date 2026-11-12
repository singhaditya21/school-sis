'use client';

import { useState, useTransition } from 'react';
import { Check, Pencil, Save, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
    AccountingLedgerConfig,
    PaymentLedgerMethodKey,
} from '@/lib/integrations/accounting-vouchers';
import { saveAccountingLedgerConfigAction } from './tally-actions';

const METHOD_ROWS: { key: PaymentLedgerMethodKey; label: string; hint: string }[] = [
    { key: 'CASH', label: 'CASH', hint: 'Counter cash receipts' },
    { key: 'CARD', label: 'CARD', hint: 'POS & debit/credit card settlements' },
    { key: 'UPI', label: 'UPI', hint: 'UPI QR & intent settlements' },
    { key: 'BANK_TRANSFER', label: 'BANK_TRANSFER', hint: 'NEFT / RTGS / IMPS credits' },
    { key: 'CHEQUE', label: 'CHEQUE', hint: 'Cleared bank cheques & demand drafts' },
    { key: 'ONLINE', label: 'ONLINE_GATEWAY', hint: 'Razorpay / Stripe gateway settlements' },
];

export function LedgerMappingEditor({
    initialConfig,
}: {
    initialConfig: AccountingLedgerConfig;
}) {
    const [config, setConfig] = useState<AccountingLedgerConfig>(initialConfig);
    const [isEditing, setIsEditing] = useState(false);
    const [isPending, startTransition] = useTransition();

    function handleSave() {
        startTransition(async () => {
            const res = await saveAccountingLedgerConfigAction(config);
            if (res.error || !res.config) {
                toast.error(res.error || 'Could not save ledger mappings.');
                return;
            }
            setConfig(res.config);
            setIsEditing(false);
            toast.success('Saved institutional Tally / Zoho / ERPNext ledger mappings');
        });
    }

    return (
        <Card className="border border-border shadow-sm rounded-xl h-full">
            <CardHeader className="bg-card border-b border-border pb-4 flex flex-row flex-wrap items-center justify-between gap-3">
                <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-brass" />
                        Chart of Accounts &amp; Ledger Mapping
                    </CardTitle>
                    <CardDescription className="mt-1">
                        Map ScholarMind fee payment channels to exact TallyPrime, Zoho Books, or Frappe ERPNext ledger heads.
                    </CardDescription>
                </div>
                {isEditing ? (
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => {
                                setConfig(initialConfig);
                                setIsEditing(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={isPending}
                            data-testid="save-ledger-mappings-btn"
                            onClick={handleSave}
                            className="gap-1.5"
                        >
                            <Save className="h-3.5 w-3.5" />
                            {isPending ? 'Saving…' : 'Save Mappings'}
                        </Button>
                    </div>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="edit-ledger-mappings-btn"
                        onClick={() => setIsEditing(true)}
                        className="gap-1.5"
                    >
                        <Pencil className="h-3.5 w-3.5 text-brass" />
                        Edit Mappings
                    </Button>
                )}
            </CardHeader>

            <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-brass/30 bg-accent/35 p-4">
                    <div className="space-y-1.5">
                        <Label
                            htmlFor="tallyCompanyName"
                            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                            Target Company (`SVCURRENTCOMPANY`)
                        </Label>
                        {isEditing ? (
                            <Input
                                id="tallyCompanyName"
                                data-testid="tally-company-name-input"
                                value={config.tallyCompanyName}
                                onChange={(e) =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        tallyCompanyName: e.target.value,
                                    }))
                                }
                            />
                        ) : (
                            <p className="font-semibold text-sm text-foreground">
                                {config.tallyCompanyName}
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label
                            htmlFor="receivableLedgerPrefix"
                            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                            Credit Income / Fee Ledger Prefix
                        </Label>
                        {isEditing ? (
                            <Input
                                id="receivableLedgerPrefix"
                                value={config.receivableLedgerPrefix}
                                onChange={(e) =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        receivableLedgerPrefix: e.target.value,
                                    }))
                                }
                            />
                        ) : (
                            <p className="font-semibold text-sm text-foreground">
                                {config.receivableLedgerPrefix} - &lt;Grade&gt;
                            </p>
                        )}
                    </div>
                </div>

                <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                    <div className="grid grid-cols-12 bg-muted/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <div className="col-span-5">ScholarMind Payment Channel</div>
                        <div className="col-span-7">Target Accounting Ledger Name</div>
                    </div>

                    {METHOD_ROWS.map((row) => (
                        <div
                            key={row.key}
                            className="grid grid-cols-12 items-center gap-3 px-4 py-3 bg-card"
                        >
                            <div className="col-span-5">
                                <div className="font-mono text-xs font-semibold text-foreground">
                                    {row.label}
                                </div>
                                <div className="text-[11px] text-muted-foreground">{row.hint}</div>
                            </div>
                            <div className="col-span-7">
                                {isEditing ? (
                                    <Input
                                        data-testid={`ledger-input-${row.key}`}
                                        value={config.ledgerMappings[row.key]}
                                        onChange={(e) =>
                                            setConfig((prev) => ({
                                                ...prev,
                                                ledgerMappings: {
                                                    ...prev.ledgerMappings,
                                                    [row.key]: e.target.value,
                                                },
                                            }))
                                        }
                                    />
                                ) : (
                                    <div className="inline-flex items-center gap-2 rounded-lg border border-brass/30 bg-accent/50 px-3 py-1.5 text-sm font-medium text-foreground">
                                        <Check className="h-3.5 w-3.5 text-brass" />
                                        <span>{config.ledgerMappings[row.key]}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
