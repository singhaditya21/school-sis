'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FormEvent, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { completeMfaEnrollment, startMfaEnrollment } from '@/lib/actions/mfa-enrollment';

type EnrollmentDetails = {
    secret: string;
    qrCodeDataUrl: string;
    backupCodes: string[];
};

export function MfaEnrollmentClient({ accountEmail }: { accountEmail: string }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [details, setDetails] = useState<EnrollmentDetails | null>(null);
    const [code, setCode] = useState('');
    const [error, setError] = useState('');

    const beginEnrollment = () => {
        setError('');
        startTransition(async () => {
            const result = await startMfaEnrollment();
            if (result.success === false) {
                setError(result.error);
                return;
            }
            setDetails(result);
        });
    };

    const verifyEnrollment = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        startTransition(async () => {
            const result = await completeMfaEnrollment(code);
            if (result.success === false) {
                setError(result.error);
                return;
            }
            router.replace(result.redirectTo);
            router.refresh();
        });
    };

    return (
        <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:py-16">
            <div className="mx-auto max-w-2xl">
                <Card>
                    <CardHeader>
                        <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <ShieldCheck className="size-6" aria-hidden="true" />
                        </div>
                        <CardTitle>Protect your ScholarMind account</CardTitle>
                        <CardDescription>
                            Multi-factor authentication is required for {accountEmail}. Set it up before accessing school data.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {error ? (
                            <div role="alert" className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                <span>{error}</span>
                            </div>
                        ) : null}

                        {!details ? (
                            <div className="space-y-4">
                                <div className="flex gap-3 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                                    <KeyRound className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
                                    <p>
                                        You will need an authenticator app. Starting setup creates a new secret and one-time backup codes for this account.
                                    </p>
                                </div>
                                <Button type="button" onClick={beginEnrollment} disabled={isPending}>
                                    {isPending ? 'Starting setup…' : 'Start secure setup'}
                                </Button>
                            </div>
                        ) : (
                            <form className="space-y-6" onSubmit={verifyEnrollment}>
                                <section aria-labelledby="authenticator-heading" className="space-y-4">
                                    <div>
                                        <h2 id="authenticator-heading" className="font-semibold">1. Add ScholarMind to your authenticator</h2>
                                        <p className="mt-1 text-sm text-muted-foreground">Scan the QR code, or enter the setup key manually.</p>
                                    </div>
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                        <div className="w-fit rounded-lg border bg-white p-3">
                                            <Image
                                                src={details.qrCodeDataUrl}
                                                alt="QR code for ScholarMind multi-factor authentication"
                                                width={192}
                                                height={192}
                                                unoptimized
                                            />
                                        </div>
                                        <div className="min-w-0 space-y-2">
                                            <p className="text-sm font-medium">Manual setup key</p>
                                            <code className="block break-all rounded-md bg-muted p-3 font-mono text-sm">{details.secret}</code>
                                        </div>
                                    </div>
                                </section>

                                <section aria-labelledby="backup-heading" className="space-y-3">
                                    <div>
                                        <h2 id="backup-heading" className="font-semibold">2. Save your backup codes</h2>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            Store these in a secure password manager. Each code works once and will not be shown again after setup.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-4 sm:grid-cols-5">
                                        {details.backupCodes.map((backupCode) => (
                                            <code key={backupCode} className="font-mono text-sm">{backupCode}</code>
                                        ))}
                                    </div>
                                </section>

                                <section aria-labelledby="verify-heading" className="space-y-3">
                                    <div>
                                        <h2 id="verify-heading" className="font-semibold">3. Verify setup</h2>
                                        <p className="mt-1 text-sm text-muted-foreground">Enter the current six-digit code from your app.</p>
                                    </div>
                                    <div className="max-w-xs space-y-2">
                                        <Label htmlFor="totp-code">Authenticator code</Label>
                                        <Input
                                            id="totp-code"
                                            name="totpCode"
                                            value={code}
                                            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            pattern="[0-9]{6}"
                                            maxLength={6}
                                            required
                                            aria-describedby="totp-help"
                                        />
                                        <p id="totp-help" className="text-xs text-muted-foreground">Codes refresh approximately every 30 seconds.</p>
                                    </div>
                                </section>

                                <Button type="submit" disabled={isPending || code.length !== 6}>
                                    <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
                                    {isPending ? 'Verifying…' : 'Verify and continue'}
                                </Button>
                            </form>
                        )}
                    </CardContent>
                </Card>
            </div>
        </main>
    );
}
