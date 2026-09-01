'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { beginMfaEnrollment, completeMfaEnrollment } from '@/lib/actions/mfa';

/**
 * Two-factor enrolment for administrators.
 *
 * Reached immediately after onboarding, because SCHOOL_ADMIN is in
 * MFA_REQUIRED_ROLES and production MFA is mandatory — without this screen a
 * freshly-created administrator is redirected to /login?mfa=required with no way
 * forward, which is where signup used to dead-end.
 *
 * TOTP deliberately: no SMS gateway, no mail provider, nothing to pay for. The
 * administrator scans a QR with any authenticator app, and ten single-use backup
 * codes cover a lost phone.
 */
export default function MfaSetupPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
    const [secret, setSecret] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [codesAcknowledged, setCodesAcknowledged] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const result = await beginMfaEnrollment();
            if (cancelled) return;
            if (!result.success) {
                setError(result.error || 'Could not start two-factor setup.');
            } else {
                setQrCodeDataUrl(result.qrCodeDataUrl || '');
                setSecret(result.secret || '');
                setBackupCodes(result.backupCodes || []);
            }
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setSubmitting(true);

        const result = await completeMfaEnrollment(new FormData(event.currentTarget));
        if (result.success) {
            // The session is now verified, which releases the middleware gate.
            router.push('/pricing');
        } else {
            setError(result.error || 'Could not complete two-factor setup.');
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-muted py-12 px-4">
            <div className="mx-auto max-w-lg">
                <h1 className="text-2xl font-bold text-foreground">Secure your account</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Administrator accounts require two-factor authentication. Scan this code with
                    an authenticator app — Google Authenticator, 1Password, Authy or similar.
                </p>

                {error && (
                    <div
                        data-testid="mfa-error"
                        className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                    >
                        ⚠️ {error}
                    </div>
                )}

                {loading ? (
                    <p className="mt-8 text-sm text-muted-foreground">Preparing your security key…</p>
                ) : (
                    qrCodeDataUrl && (
                        <>
                            <div className="mt-6 rounded-xl border bg-white p-6 text-center">
                                <Image
                                    src={qrCodeDataUrl}
                                    alt="Two-factor authentication QR code"
                                    width={200}
                                    height={200}
                                    unoptimized
                                    className="mx-auto"
                                    data-testid="mfa-qr"
                                />
                                <p className="mt-4 text-xs text-muted-foreground">
                                    Can&apos;t scan? Enter this key manually:
                                </p>
                                <code
                                    data-testid="mfa-secret"
                                    className="mt-1 block break-all font-mono text-xs text-foreground"
                                >
                                    {secret}
                                </code>
                            </div>

                            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6">
                                <h2 className="font-semibold text-amber-900">
                                    Save these backup codes
                                </h2>
                                <p className="mt-1 text-xs text-amber-800">
                                    Each works once, if you lose your phone. They are shown now and
                                    never again — only hashes are stored.
                                </p>
                                <ul
                                    data-testid="mfa-backup-codes"
                                    className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-amber-900"
                                >
                                    {backupCodes.map((code) => (
                                        <li key={code}>{code}</li>
                                    ))}
                                </ul>
                                <label className="mt-4 flex items-center gap-2 text-sm text-amber-900">
                                    <input
                                        type="checkbox"
                                        data-testid="mfa-codes-saved"
                                        checked={codesAcknowledged}
                                        onChange={(e) => setCodesAcknowledged(e.target.checked)}
                                    />
                                    I have saved these codes somewhere safe
                                </label>
                            </div>

                            <form onSubmit={onSubmit} className="mt-6">
                                <label
                                    htmlFor="code"
                                    className="block text-sm font-medium text-foreground"
                                >
                                    Enter the 6-digit code from your app
                                </label>
                                <input
                                    id="code"
                                    name="code"
                                    required
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    pattern="[0-9]{6}"
                                    maxLength={6}
                                    data-testid="mfa-code-input"
                                    className="mt-1 h-12 w-full rounded-md border px-3 text-center font-mono text-lg tracking-widest"
                                    placeholder="000000"
                                />
                                <button
                                    type="submit"
                                    disabled={submitting || !codesAcknowledged}
                                    data-testid="mfa-activate"
                                    className="mt-4 h-12 w-full rounded-xl bg-blue-600 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                                >
                                    {submitting ? 'Verifying…' : 'Activate two-factor authentication'}
                                </button>
                            </form>
                        </>
                    )
                )}
            </div>
        </div>
    );
}
