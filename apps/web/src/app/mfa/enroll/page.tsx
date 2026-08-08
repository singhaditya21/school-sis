'use client';

import { useEffect, useRef, useState } from 'react';
import { activateMfaEnrollment, startMfaEnrollment } from '@/lib/actions/mfa-enrollment';
import { logoutAction } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Enrollment = {
    secret: string;
    qrCodeDataUrl: string;
    backupCodes: string[];
};

export default function MfaEnrollmentPage() {
    const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [activating, setActivating] = useState(false);
    const [backupCodesSaved, setBackupCodesSaved] = useState(false);
    const enrollmentRequest = useRef<ReturnType<typeof startMfaEnrollment> | null>(null);

    useEffect(() => {
        let active = true;
        const request = enrollmentRequest.current ?? startMfaEnrollment();
        enrollmentRequest.current = request;
        void request
            .then((result) => {
                if (!active) return;
                if (result.success === true) setEnrollment(result.data);
                else setError(result.error);
                setLoading(false);
            })
            .catch(() => {
                if (!active) return;
                setError('Could not prepare MFA enrollment. Sign out and try again.');
                setLoading(false);
            });
        return () => { active = false; };
    }, []);

    async function activate() {
        setError(null);
        setActivating(true);
        const result = await activateMfaEnrollment(code);
        setActivating(false);
        if (!result.success) {
            setError(result.error || 'Could not activate MFA.');
            return;
        }
        window.location.assign(result.redirectTo || '/dashboard');
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
            <Card className="w-full max-w-2xl">
                <CardHeader>
                    <CardTitle>Secure your account</CardTitle>
                    <CardDescription>
                        Scan the QR code in an authenticator app, save the one-time backup codes, then verify a code.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {loading ? <p>Preparing secure enrollment…</p> : null}
                    {enrollment ? (
                        <>
                            <div className="grid gap-6 md:grid-cols-[220px_1fr]">
                                <img
                                    src={enrollment.qrCodeDataUrl}
                                    alt="Authenticator enrollment QR code"
                                    className="h-[220px] w-[220px] rounded-lg border bg-white p-2"
                                />
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-sm font-medium">Manual setup secret</p>
                                        <code className="mt-1 block break-all rounded bg-muted p-2 text-sm">
                                            {enrollment.secret}
                                        </code>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">One-time backup codes</p>
                                        <p className="text-xs text-muted-foreground">
                                            Store these securely. They are not shown again after this enrollment screen.
                                        </p>
                                        <div className="mt-2 grid grid-cols-2 gap-2 rounded bg-muted p-3 font-mono text-sm">
                                            {enrollment.backupCodes.map((backupCode) => (
                                                <span key={backupCode}>{backupCode}</span>
                                            ))}
                                        </div>
                                        <label className="mt-3 flex items-start gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={backupCodesSaved}
                                                onChange={(event) => setBackupCodesSaved(event.target.checked)}
                                                className="mt-1"
                                            />
                                            <span>I saved these backup codes in a secure place.</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="totp-code">6-digit authenticator code</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="totp-code"
                                        value={code}
                                        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        pattern="[0-9]{6}"
                                        maxLength={6}
                                    />
                                    <Button
                                        onClick={() => void activate()}
                                        disabled={activating || code.length !== 6 || !backupCodesSaved}
                                    >
                                        {activating ? 'Verifying…' : 'Activate MFA'}
                                    </Button>
                                </div>
                            </div>
                        </>
                    ) : null}
                    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
                    <form action={logoutAction}>
                        <Button type="submit" variant="outline">Sign out</Button>
                    </form>
                </CardContent>
            </Card>
        </main>
    );
}
