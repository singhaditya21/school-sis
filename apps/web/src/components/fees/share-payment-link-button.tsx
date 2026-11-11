'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Copy, Check, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateWhatsAppPaymentLinkAction } from '@/lib/actions/payments';

export function SharePaymentLinkButton({
    invoiceId,
    compact = false,
}: {
    invoiceId: string;
    compact?: boolean;
}) {
    const [isPending, startTransition] = useTransition();
    const [copied, setCopied] = useState(false);
    const [generated, setGenerated] = useState<{
        paymentUrl: string;
        whatsappShareUrl: string;
        guardianPhoneMasked: string | null;
    } | null>(null);

    function handleGenerate(mode: 'copy' | 'whatsapp') {
        startTransition(async () => {
            const res = await generateWhatsAppPaymentLinkAction(invoiceId);
            if (res.error || !res.paymentUrl || !res.whatsappShareUrl) {
                toast.error(res.error || 'Unable to generate payment link.');
                return;
            }
            const next = {
                paymentUrl: res.paymentUrl,
                whatsappShareUrl: res.whatsappShareUrl,
                guardianPhoneMasked: res.guardianPhoneMasked ?? null,
            };
            setGenerated(next);

            if (mode === 'copy') {
                try {
                    await navigator.clipboard.writeText(res.paymentUrl);
                    setCopied(true);
                    toast.success('1-click UPI payment link copied to clipboard!');
                    setTimeout(() => setCopied(false), 2500);
                } catch {
                    toast.info(`Payment link ready: ${res.paymentUrl}`);
                }
            } else {
                window.open(res.whatsappShareUrl, '_blank', 'noopener,noreferrer');
            }
        });
    }

    if (compact) {
        return (
            <button
                type="button"
                disabled={isPending}
                onClick={() => handleGenerate('whatsapp')}
                data-testid={`whatsapp-pay-link-${invoiceId}`}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-success transition-colors inline-flex disabled:opacity-50"
                title="Send 1-click UPI payment link on WhatsApp"
                aria-label="Send 1-click UPI payment link on WhatsApp"
            >
                <MessageCircle className="w-4 h-4" />
            </button>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
                <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={isPending}
                    data-testid="send-whatsapp-pay-link"
                    onClick={() => handleGenerate('whatsapp')}
                    className="gap-2"
                >
                    <MessageCircle className="w-4 h-4" />
                    {isPending ? 'Preparing link…' : 'Send UPI Link on WhatsApp'}
                </Button>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    data-testid="copy-upi-pay-link"
                    onClick={() => handleGenerate('copy')}
                    className="gap-2"
                >
                    {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy 1-Click Payment Link'}
                </Button>
            </div>

            {generated && (
                <div className="rounded-lg border border-border bg-muted/60 p-3 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                            Signed 14-day parent UPI / NetBanking / Card link
                        </span>
                        {generated.guardianPhoneMasked && (
                            <span className="text-muted-foreground">
                                Guardian: {generated.guardianPhoneMasked}
                            </span>
                        )}
                    </div>
                    <p
                        data-testid="generated-pay-link-url"
                        className="font-mono text-[11px] break-all text-primary"
                    >
                        {generated.paymentUrl}
                    </p>
                </div>
            )}
        </div>
    );
}
