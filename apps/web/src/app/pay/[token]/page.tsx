import Link from 'next/link';
import { sqlFor, withTenant } from '@/lib/db';
import { verifyInvoicePaymentToken } from '@/lib/payments/payment-links';
import { isPayableInvoiceStatus, outstandingMinor } from '@/lib/payments/ledger';
import { isRazorpayConfigured } from '@/lib/payments/providers';
import { formatCurrencyPrecise } from '@/lib/format/currency';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PayLinkCheckoutClient } from './pay-link-client';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Secure School Fee Payment | ScholarMind',
    robots: { index: false, follow: false, nocache: true },
};

function formatInr(amountMinor: number): string {
    return formatCurrencyPrecise(amountMinor / 100);
}

function maskStudentDisplayName(firstName: string, lastName: string): string {
    const cleanFirst = firstName.trim();
    const cleanLast = lastName.trim();
    if (!cleanLast) return cleanFirst;
    return `${cleanFirst} ${cleanLast.charAt(0).toUpperCase()}.`;
}

export default async function PublicInvoicePaymentLinkPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const verified = verifyInvoicePaymentToken(token);

    if (verified.ok === false) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-muted p-6">
                <Card className="w-full max-w-lg border-border shadow-lg">
                    <CardHeader>
                        <Badge variant="destructive" className="w-fit mb-2">
                            Invalid or Expired Link
                        </Badge>
                        <CardTitle className="text-2xl">Fee Payment Link Unavailable</CardTitle>
                        <CardDescription>{verified.reason}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Link
                            href="/login"
                            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                        >
                            Sign in to Parent Portal →
                        </Link>
                    </CardContent>
                </Card>
            </main>
        );
    }

    const summary = await withTenant(verified.tenantId, async (client) => {
        const q = sqlFor(client);
        return q<{
            id: string;
            invoiceNumber: string;
            totalAmount: string;
            paidAmount: string | null;
            dueDate: string | Date | null;
            status: string;
            description: string | null;
            studentFirstName: string;
            studentLastName: string;
            gradeName: string | null;
            schoolName: string;
            latestReceiptNumber: string | null;
        }>`
            SELECT
                i.id,
                i.invoice_number AS "invoiceNumber",
                i.total_amount AS "totalAmount",
                i.paid_amount AS "paidAmount",
                i.due_date AS "dueDate",
                i.status,
                i.description,
                s.first_name AS "studentFirstName",
                s.last_name AS "studentLastName",
                g.name AS "gradeName",
                t.name AS "schoolName",
                (
                    SELECT r.receipt_number
                    FROM payments p
                    JOIN receipts r ON r.payment_id = p.id AND r.tenant_id = p.tenant_id
                    WHERE p.invoice_id = i.id
                      AND p.tenant_id = i.tenant_id
                      AND p.status = 'COMPLETED'
                    ORDER BY r.issued_at DESC
                    LIMIT 1
                ) AS "latestReceiptNumber"
            FROM invoices i
            JOIN students s ON s.id = i.student_id AND s.tenant_id = i.tenant_id
            LEFT JOIN grades g ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
            JOIN tenants t ON t.id = i.tenant_id
            WHERE i.id = ${verified.invoiceId}
              AND i.tenant_id = ${verified.tenantId}
              AND COALESCE(s.custom_data->>'erased', 'false') <> 'true'
            LIMIT 1
        `.maybeOne();
    });

    if (!summary) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-muted p-6">
                <Card className="w-full max-w-lg border-border shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-2xl">Invoice Not Found</CardTitle>
                        <CardDescription>
                            This fee invoice could not be located. Please contact your school fee office.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </main>
        );
    }

    const totalMinor = Math.round(Number(summary.totalAmount) * 100);
    const paidMinor = Math.round(Number(summary.paidAmount || 0) * 100);
    const balanceMinor = outstandingMinor({
        totalAmount: summary.totalAmount,
        paidAmount: summary.paidAmount,
    });
    const payable = balanceMinor > 0 && isPayableInvoiceStatus(summary.status);
    const dueDateStr = summary.dueDate ? String(summary.dueDate).slice(0, 10) : null;

    return (
        <main className="min-h-screen flex items-center justify-center bg-muted/60 p-4 sm:p-6">
            <Card className="w-full max-w-lg border-border shadow-xl overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-primary via-brass to-primary" />
                <CardHeader className="space-y-2 border-b border-border pb-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant="outline" className="border-brass/40 bg-accent/60 text-accent-foreground font-semibold">
                            Verified School Payment Link
                        </Badge>
                        <Badge variant={summary.status === 'PAID' ? 'secondary' : 'default'}>
                            {summary.status}
                        </Badge>
                    </div>
                    <CardTitle className="text-2xl">{summary.schoolName}</CardTitle>
                    <CardDescription>
                        Instant 1-tap UPI (GPay · PhonePe · Paytm), NetBanking &amp; Card checkout — no login required.
                    </CardDescription>
                </CardHeader>

                <CardContent className="pt-6 space-y-6">
                    <dl className="rounded-xl border border-border bg-muted/50 p-4 space-y-2.5 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Invoice Number</dt>
                            <dd className="font-mono font-medium text-foreground">
                                {summary.invoiceNumber}
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Student</dt>
                            <dd className="font-medium text-foreground">
                                {maskStudentDisplayName(summary.studentFirstName, summary.studentLastName)}
                                {summary.gradeName ? ` · ${summary.gradeName}` : ''}
                            </dd>
                        </div>
                        {summary.description && (
                            <div className="flex justify-between gap-4">
                                <dt className="text-muted-foreground shrink-0">Fee Head</dt>
                                <dd className="text-right text-foreground">{summary.description}</dd>
                            </div>
                        )}
                        {dueDateStr && (
                            <div className="flex justify-between">
                                <dt className="text-muted-foreground">Due Date</dt>
                                <dd className="text-foreground">{dueDateStr}</dd>
                            </div>
                        )}
                        <div className="flex justify-between border-t border-border pt-2">
                            <dt className="text-muted-foreground">Total Billed</dt>
                            <dd className="tabular-nums text-foreground">{formatInr(totalMinor)}</dd>
                        </div>
                        {paidMinor > 0 && (
                            <div className="flex justify-between">
                                <dt className="text-muted-foreground">Already Paid</dt>
                                <dd className="tabular-nums text-success">{formatInr(paidMinor)}</dd>
                            </div>
                        )}
                        <div className="flex justify-between border-t border-border pt-2.5">
                            <dt className="font-semibold text-foreground">Balance Payable</dt>
                            <dd
                                data-testid="pay-link-balance"
                                className="text-xl font-bold tabular-nums text-foreground"
                            >
                                {formatInr(balanceMinor)}
                            </dd>
                        </div>
                    </dl>

                    {summary.status === 'PAID' && (
                        <div className="rounded-xl border border-success/30 bg-success-subtle p-4 text-sm text-success-subtle-foreground space-y-1">
                            <p className="font-semibold">✓ This invoice is paid in full.</p>
                            {summary.latestReceiptNumber && (
                                <p className="text-xs">
                                    Official Receipt: <span className="font-mono font-semibold">{summary.latestReceiptNumber}</span>
                                </p>
                            )}
                        </div>
                    )}

                    <PayLinkCheckoutClient
                        token={token}
                        payable={payable}
                        razorpayConfigured={isRazorpayConfigured()}
                        balanceFormatted={formatInr(balanceMinor)}
                    />

                    <p className="text-center text-[11px] text-muted-foreground">
                        Secured by ScholarMind · Cryptographically signed for {summary.schoolName}.{' '}
                        <Link href="/login" className="underline hover:text-foreground">
                            Open full Parent Portal
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </main>
    );
}
