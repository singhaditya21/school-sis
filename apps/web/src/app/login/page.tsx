'use client';

import { Suspense, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { Building2, GraduationCap, KeyRound, Network, ShieldCheck } from 'lucide-react';
import { loginActionV2 } from '@/lib/actions/auth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" className="w-full" disabled={pending} data-testid="login-button">
            {pending ? 'Signing in…' : 'Sign in securely'}
        </Button>
    );
}

function LoginForm() {
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);
    const [schoolCode, setSchoolCode] = useState('');
    const [loginMode, setLoginMode] = useState<'school' | 'platform'>('school');
    const [mfaRequired, setMfaRequired] = useState(false);
    const mfaActivationCommitted = searchParams.get('mfa') === 'enabled';

    const changeMode = (mode: 'school' | 'platform') => {
        setLoginMode(mode);
        setError(null);
        setMfaRequired(false);
    };

    async function handleSubmit(formData: FormData) {
        setError(null);
        formData.set('loginMode', loginMode);

        const result = await loginActionV2(formData);
        if (result?.error) {
            setError(result.error);
            setMfaRequired(Boolean(result.mfaRequired));
        }
    }

    return (
        <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="space-y-3">
                <div className="flex items-center gap-3 lg:hidden">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <GraduationCap className="size-5" aria-hidden="true" />
                    </span>
                    <span className="text-lg font-semibold">ScholarMind</span>
                </div>
                <div>
                    <CardTitle className="text-2xl">Welcome back</CardTitle>
                    <CardDescription className="mt-1">
                        Use the account and organization context issued by your administrator.
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {mfaActivationCommitted ? (
                    <div role="status" className="rounded-lg border border-success/30 bg-success-muted p-3 text-sm text-success">
                        MFA was activated. Your secure session could not be renewed, so sign in again with your authenticator code.
                    </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1" aria-label="Sign-in context">
                    <Button
                        type="button"
                        variant={loginMode === 'school' ? 'default' : 'ghost'}
                        onClick={() => changeMode('school')}
                        aria-pressed={loginMode === 'school'}
                    >
                        <Building2 className="mr-2 size-4" aria-hidden="true" />
                        School staff
                    </Button>
                    <Button
                        type="button"
                        variant={loginMode === 'platform' ? 'default' : 'ghost'}
                        onClick={() => changeMode('platform')}
                        aria-pressed={loginMode === 'platform'}
                    >
                        <Network className="mr-2 size-4" aria-hidden="true" />
                        Platform admin
                    </Button>
                </div>

                <form action={handleSubmit} className="space-y-4">
                    {loginMode === 'school' ? (
                        <div className="space-y-2">
                            <Label htmlFor="schoolCode">School code</Label>
                            <Input
                                id="schoolCode"
                                name="schoolCode"
                                value={schoolCode}
                                onChange={(event) => setSchoolCode(event.target.value.toUpperCase())}
                                autoComplete="organization"
                                className="uppercase"
                                required
                            />
                            <p className="text-xs text-muted-foreground">Your school administrator provides this code.</p>
                        </div>
                    ) : null}

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            aria-invalid={Boolean(error)}
                            data-testid="email-input"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            minLength={8}
                            required
                            aria-invalid={Boolean(error)}
                            data-testid="password-input"
                        />
                    </div>

                    {mfaRequired ? (
                        <div className="space-y-2">
                            <Label htmlFor="mfaCode">Authenticator or recovery code</Label>
                            <div className="relative">
                                <KeyRound className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                                <Input
                                    id="mfaCode"
                                    name="mfaCode"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    pattern="(?:[0-9]{6}|[0-9A-Fa-f]{10}|[0-9A-Fa-f]{5}-[0-9A-Fa-f]{5})"
                                    maxLength={11}
                                    className="pl-9"
                                    aria-describedby="mfa-code-help"
                                    required
                                />
                            </div>
                            <p id="mfa-code-help" className="text-xs text-muted-foreground">
                                Enter six digits from your authenticator, or one unused recovery code.
                            </p>
                        </div>
                    ) : null}

                    {error ? (
                        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" data-testid="login-error">
                            {error}
                        </div>
                    ) : null}

                    <SubmitButton />
                </form>
            </CardContent>
            <CardFooter className="flex-col gap-4 text-center text-xs text-muted-foreground">
                <Separator />
                <p>Access is limited by your role, tenant, enabled capabilities, and provider readiness.</p>
            </CardFooter>
        </Card>
    );
}

export default function LoginPage() {
    return (
        <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-2">
            <aside className="hidden border-r bg-muted/30 p-12 lg:flex lg:flex-col lg:justify-between">
                <div className="space-y-12">
                    <div className="flex items-center gap-3">
                        <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                            <GraduationCap className="size-6" aria-hidden="true" />
                        </span>
                        <div>
                            <p className="text-xl font-semibold">ScholarMind</p>
                            <p className="text-sm text-muted-foreground">Governed education operations</p>
                        </div>
                    </div>

                    <div className="max-w-lg space-y-4">
                        <h1 className="text-4xl font-semibold tracking-tight">Secure access starts with verified context.</h1>
                        <p className="text-lg text-muted-foreground">
                            ScholarMind binds every enabled workflow to an authenticated actor, tenant, permission, and capability decision.
                        </p>
                    </div>

                    <div className="max-w-lg space-y-4">
                        <div className="flex gap-3 rounded-xl border bg-card p-4">
                            <Building2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                            <div>
                                <p className="font-medium">Tenant-bound access</p>
                                <p className="text-sm text-muted-foreground">School records and mutations remain scoped to the signed-in tenant.</p>
                            </div>
                        </div>
                        <div className="flex gap-3 rounded-xl border bg-card p-4">
                            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                            <div>
                                <p className="font-medium">Fail-closed capabilities</p>
                                <p className="text-sm text-muted-foreground">Unavailable or unconfigured workflows cannot be reached through direct URLs.</p>
                            </div>
                        </div>
                        <div className="flex gap-3 rounded-xl border bg-card p-4">
                            <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                            <div>
                                <p className="font-medium">MFA for privileged roles</p>
                                <p className="text-sm text-muted-foreground">Authenticator verification protects administrative and financial access.</p>
                            </div>
                        </div>
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">ScholarMind managed SaaS</p>
            </aside>

            <main className="flex items-center justify-center px-4 py-10 sm:px-8">
                <Suspense fallback={<div className="text-sm text-muted-foreground">Loading secure sign-in…</div>}>
                    <LoginForm />
                </Suspense>
            </main>
        </div>
    );
}
