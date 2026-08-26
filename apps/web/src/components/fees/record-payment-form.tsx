'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { recordPayment } from '@/lib/actions/mutations';
import { formatCurrency } from '@/lib/utils';

/** Kept in sync with the payment_method enum and the server-side allowlist. */
const PAYMENT_METHODS = [
    { value: 'CASH', label: 'Cash' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'UPI', label: 'UPI' },
    { value: 'BANK_TRANSFER', label: 'Bank transfer' },
    { value: 'CARD', label: 'Card' },
];

export function RecordPaymentForm({
    invoiceId,
    balanceDue,
}: {
    invoiceId: string;
    balanceDue: number;
}) {
    const router = useRouter();
    const [method, setMethod] = useState('CASH');
    const [amount, setAmount] = useState(balanceDue > 0 ? balanceDue.toFixed(2) : '');
    const [reference, setReference] = useState('');
    const [chequeNumber, setChequeNumber] = useState('');
    const [bankName, setBankName] = useState('');
    const [saving, setSaving] = useState(false);

    const settled = balanceDue <= 0;

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving) return;

        const parsed = Number(amount);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            toast.error('Enter an amount greater than zero.');
            return;
        }
        if (parsed > balanceDue) {
            toast.error(`Amount cannot exceed the balance due of ${formatCurrency(balanceDue)}.`);
            return;
        }

        setSaving(true);
        const formData = new FormData();
        formData.set('invoiceId', invoiceId);
        formData.set('amount', amount.trim());
        formData.set('method', method);
        if (reference.trim()) formData.set('reference', reference.trim());
        if (chequeNumber.trim()) formData.set('chequeNumber', chequeNumber.trim());
        if (bankName.trim()) formData.set('bankName', bankName.trim());

        try {
            const result = await recordPayment(formData);
            if (result.success && result.receiptNumber) {
                toast.success(`Payment recorded. Receipt ${result.receiptNumber}.`, { duration: 10000 });
                setReference('');
                setChequeNumber('');
                setBankName('');
                setAmount('');
                router.refresh();
            } else {
                toast.error(result.error ?? 'Could not record the payment.');
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not record the payment.');
        }
        setSaving(false);
    }

    if (settled) {
        return (
            <p className="text-sm text-muted-foreground">
                This invoice is fully paid. There is no balance left to collect.
            </p>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="record-payment-form">
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="payment-amount">Amount received (₹)</Label>
                    <Input
                        id="payment-amount"
                        data-testid="payment-amount"
                        name="amount"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={balanceDue.toFixed(2)}
                        required
                    />
                    <p className="text-xs text-muted-foreground">
                        Balance due {formatCurrency(balanceDue)}
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="payment-mode">Payment method</Label>
                    {/* Native select: the e2e suite drives this with selectOption, which Radix does not support. */}
                    <select
                        id="payment-mode"
                        data-testid="payment-mode"
                        name="method"
                        value={method}
                        onChange={(e) => setMethod(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        {PAYMENT_METHODS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {method === 'CHEQUE' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="cheque-number">Cheque number</Label>
                        <Input id="cheque-number" name="chequeNumber" value={chequeNumber}
                            onChange={(e) => setChequeNumber(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="bank-name">Bank</Label>
                        <Input id="bank-name" name="bankName" value={bankName}
                            onChange={(e) => setBankName(e.target.value)} />
                    </div>
                </div>
            ) : null}

            <div className="space-y-2">
                <Label htmlFor="payment-reference">Reference {method === 'CASH' ? '(optional)' : ''}</Label>
                <Input
                    id="payment-reference"
                    data-testid="payment-reference"
                    name="reference"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder={method === 'UPI' ? 'UPI transaction id' : 'Transaction or receipt reference'}
                />
            </div>

            <Button type="submit" data-testid="save-payment" disabled={saving}>
                {saving ? 'Recording…' : 'Record payment'}
            </Button>
        </form>
    );
}
