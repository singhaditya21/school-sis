'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
    CheckCheck,
    Copy,
    ExternalLink,
    MessageSquare,
    Send,
    Server,
    ShieldCheck,
    Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    simulateConciergeMessageAction,
    type ConciergeGuardianOption,
} from './concierge-actions';

interface ChatTurn {
    id: string;
    sender: 'guardian' | 'concierge';
    text: string;
    timestamp: string;
    actionLinks?: { label: string; href: string }[];
}

const QUICK_COMMANDS = [
    { label: 'Namaste / Menu', text: 'Hi' },
    { label: '1 · Pay Fees (UPI)', text: '1' },
    { label: '2 · Last Receipt', text: '2' },
    { label: '3 · Attendance', text: '3' },
    { label: '4 · Report Card', text: '4' },
    { label: '5 · Bus & Gate Pass', text: '5' },
] as const;

export function ConciergeSimulatorClient({
    schoolName,
    webhookUrl,
    providerState,
    guardians,
}: {
    schoolName: string;
    webhookUrl: string;
    providerState: {
        provider: string;
        available: boolean;
        reason?: string;
        webhookSecretConfigured: boolean;
        verifyTokenConfigured: boolean;
    };
    guardians: ConciergeGuardianOption[];
}) {
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [customText, setCustomText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const threadRef = useRef<HTMLDivElement | null>(null);

    const activeGuardian = guardians[selectedIdx] ?? null;

    const [turns, setTurns] = useState<ChatTurn[]>(() => [
        {
            id: 'welcome-0',
            sender: 'concierge',
            text: `Select a verified guardian and tap any WhatsApp command pill below ("Hi", "1 · Pay Fees", "4 · Report Card", "5 · Bus & Gate Pass") to run a live query against ${schoolName}'s tenant ledger.`,
            timestamp: 'Ready',
        },
    ]);

    useEffect(() => {
        if (threadRef.current) {
            threadRef.current.scrollTop = threadRef.current.scrollHeight;
        }
    }, [turns.length, isPending]);

    function sendCommand(rawText: string) {
        if (!activeGuardian || !rawText.trim()) return;
        const trimmed = rawText.trim();
        const nowLabel = new Date().toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
        });

        setError(null);
        setTurns((prev) => [
            ...prev,
            {
                id: `g-${Date.now()}`,
                sender: 'guardian',
                text: trimmed,
                timestamp: nowLabel,
            },
        ]);

        startTransition(async () => {
            const res = await simulateConciergeMessageAction({
                studentId: activeGuardian.studentId,
                guardianUserId: activeGuardian.guardianUserId,
                rawText: trimmed,
            });

            if (res.error || !res.reply) {
                setError(res.error || 'Could not resolve concierge reply.');
                return;
            }

            setTurns((prev) => [
                ...prev,
                {
                    id: `c-${Date.now()}`,
                    sender: 'concierge',
                    text: res.reply!.replyText,
                    timestamp: nowLabel,
                    actionLinks: res.reply!.actionLinks,
                },
            ]);
        });
    }

    return (
        <div className="grid gap-6 lg:grid-cols-12">
            {/* Left Column: Guardian Selector & Meta Cloud Webhook Readiness */}
            <div className="space-y-6 lg:col-span-5">
                <Card className="border-border shadow-sm">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Smartphone className="h-5 w-5 text-brass" />
                                Verified Guardian Context
                            </CardTitle>
                            <Badge
                                variant="outline"
                                className="border-brass/40 bg-accent text-accent-foreground text-xs"
                            >
                                RLS Isolated
                            </Badge>
                        </div>
                        <CardDescription>
                            Inbound WhatsApp phone numbers are matched against deterministic guardian ciphertexts and DPDP consent before any student ledger figure is returned.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {guardians.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No active students with linked guardians exist in this campus yet.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                <label
                                    htmlFor="concierge-guardian-select"
                                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                                >
                                    Active Guardian Thread
                                </label>
                                <select
                                    id="concierge-guardian-select"
                                    data-testid="concierge-guardian-select"
                                    value={selectedIdx}
                                    onChange={(e) => setSelectedIdx(Number(e.target.value))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    {guardians.map((g, idx) => (
                                        <option key={`${g.studentId}-${idx}`} value={idx}>
                                            {g.guardianName} ({g.relation}) · {g.studentName} [{g.classLabel}]
                                        </option>
                                    ))}
                                </select>
                                {activeGuardian && (
                                    <div className="rounded-lg border border-brass/30 bg-accent/35 p-3 text-xs space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Verified Phone:</span>
                                            <span className="font-mono font-semibold text-foreground">
                                                {activeGuardian.phoneMasked}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Primary Ward:</span>
                                            <span className="font-semibold text-foreground">
                                                {activeGuardian.studentName} ({activeGuardian.classLabel})
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-border shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-brass" />
                            Inbound Webhook &amp; Adapter Readiness
                        </CardTitle>
                        <CardDescription>
                            Supports official Meta Cloud API or zero-cost open-source self-hosted gateways (WAHA / Evolution API).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                        <div className="rounded-lg border border-border bg-muted/50 p-2.5 font-mono break-all text-foreground">
                            {webhookUrl}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Badge variant={providerState.available ? 'default' : 'outline'}>
                                Adapter: {providerState.provider}
                            </Badge>
                            <Badge variant={providerState.webhookSecretConfigured ? 'secondary' : 'outline'}>
                                HMAC / Secret: {providerState.webhookSecretConfigured ? 'Active' : 'Fail-Closed'}
                            </Badge>
                            <Badge variant={providerState.verifyTokenConfigured ? 'secondary' : 'outline'}>
                                Handshake Token: {providerState.verifyTokenConfigured ? 'Set' : 'Unset'}
                            </Badge>
                        </div>
                        {providerState.reason && (
                            <p className="text-muted-foreground leading-relaxed">{providerState.reason}</p>
                        )}
                    </CardContent>
                </Card>

                <Card
                    data-testid="free-whatsapp-gateway-card"
                    className="border-brass/40 bg-accent/30 shadow-sm"
                >
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Server className="h-4 w-4 text-brass" />
                                Zero-Cost Self-Hosted Gateway
                            </CardTitle>
                            <Badge
                                variant="outline"
                                className="border-brass/40 bg-card text-foreground text-[11px]"
                            >
                                ₹0 / Open-Source
                            </Badge>
                        </div>
                        <CardDescription>
                            Skip per-conversation BSP markups using <code className="font-mono">devlikeapro/waha</code> or{' '}
                            <code className="font-mono">EvolutionAPI/evolution-api</code> in Docker.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                        <pre className="rounded-lg border border-border bg-card p-3 font-mono text-[11px] overflow-x-auto text-foreground leading-relaxed">
{`WHATSAPP_PROVIDER=waha
WAHA_BASE_URL=https://waha.school.edu.in
WAHA_API_KEY=your_waha_key
WHATSAPP_WEBHOOK_SECRET=your_hmac_secret`}
                        </pre>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full gap-1.5 text-xs"
                            onClick={() => {
                                const cmd = `SCHOLARMIND_WEBHOOK_URL=${webhookUrl} docker compose -f docker-compose.whatsapp-free.yml up -d`;
                                navigator.clipboard?.writeText(cmd);
                                toast.success('Copied free WAHA Docker Compose launch command');
                            }}
                        >
                            <Copy className="h-3.5 w-3.5 text-brass" />
                            Copy Free WAHA Docker Launch Command
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Right Column: Live Interactive WhatsApp Thread Simulator */}
            <div className="lg:col-span-7">
                <Card
                    data-testid="whatsapp-concierge-simulator"
                    className="border-brass/40 shadow-md overflow-hidden flex flex-col"
                >
                    <div className="bg-primary text-primary-foreground px-5 py-4 flex items-center justify-between border-b border-brass/40">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 border border-brass/40">
                                <MessageSquare className="h-5 w-5 text-brass" />
                            </div>
                            <div>
                                <p className="font-semibold text-sm">{schoolName} · Official Concierge</p>
                                <p className="text-xs text-primary-foreground/75">
                                    Verified Business Account · Live Ledger Replies
                                </p>
                            </div>
                        </div>
                        <Badge variant="outline" className="border-brass/50 bg-white/10 text-white text-[11px]">
                            2-Way Live Preview
                        </Badge>
                    </div>

                    {/* Message Thread */}
                    <div
                        ref={threadRef}
                        data-testid="concierge-chat-thread"
                        className="p-4 sm:p-5 space-y-3.5 bg-accent/25 min-h-[340px] max-h-[460px] overflow-y-auto"
                    >
                        {turns.map((turn) => {
                            const isGuardian = turn.sender === 'guardian';
                            return (
                                <div
                                    key={turn.id}
                                    className={`flex ${isGuardian ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                            isGuardian
                                                ? 'bg-primary text-primary-foreground rounded-br-sm'
                                                : 'bg-card text-foreground border border-border rounded-bl-sm'
                                        }`}
                                    >
                                        <p className="whitespace-pre-wrap leading-relaxed break-words">
                                            {turn.text}
                                        </p>

                                        {turn.actionLinks && turn.actionLinks.length > 0 && (
                                            <div className="mt-3 pt-2.5 border-t border-border flex flex-wrap gap-2">
                                                {turn.actionLinks.map((link, lIdx) => (
                                                    <Link
                                                        key={lIdx}
                                                        href={link.href}
                                                        data-testid={`concierge-action-link-${lIdx}`}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-brass/40 bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent/80"
                                                    >
                                                        {link.label}
                                                        <ExternalLink className="h-3 w-3 text-brass" />
                                                    </Link>
                                                ))}
                                            </div>
                                        )}

                                        <div
                                            className={`mt-1.5 flex items-center justify-end gap-1 text-[10px] ${
                                                isGuardian
                                                    ? 'text-primary-foreground/75'
                                                    : 'text-muted-foreground'
                                            }`}
                                        >
                                            <span>{turn.timestamp}</span>
                                            {isGuardian && <CheckCheck className="h-3 w-3" />}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        {isPending && (
                            <div className="text-xs text-muted-foreground italic px-2">
                                Querying tenant ledger &amp; generating signed reply…
                            </div>
                        )}
                    </div>

                    {/* Quick Command Pills + Input */}
                    <CardContent className="border-t border-border bg-card p-4 space-y-3">
                        {error && (
                            <p className="text-xs font-medium text-destructive">{error}</p>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {QUICK_COMMANDS.map((cmd) => (
                                <button
                                    key={cmd.text}
                                    type="button"
                                    disabled={isPending || !activeGuardian}
                                    data-testid={`concierge-pill-${cmd.text.toLowerCase()}`}
                                    onClick={() => sendCommand(cmd.text)}
                                    className="rounded-full border border-brass/35 bg-accent/60 px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                                >
                                    {cmd.label}
                                </button>
                            ))}
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (!customText.trim()) return;
                                const msg = customText;
                                setCustomText('');
                                sendCommand(msg);
                            }}
                            className="flex items-center gap-2"
                        >
                            <Input
                                value={customText}
                                onChange={(e) => setCustomText(e.target.value)}
                                placeholder="Type a guardian message (e.g. 'Pay fees', 'Receipt', 'Report card', 'Bus')…"
                                disabled={isPending || !activeGuardian}
                            />
                            <Button
                                type="submit"
                                size="sm"
                                disabled={isPending || !activeGuardian || !customText.trim()}
                                className="shrink-0 gap-1.5"
                            >
                                <Send className="h-4 w-4" />
                                Send
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
