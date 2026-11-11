'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
    IndianRupee,
    BarChart3,
    ShieldCheck,
    Building2,
    Globe,
    Sparkles,
    Check,
} from 'lucide-react';
import { loginActionV2 } from '@/lib/actions/auth';
import {
    isPermanentPlatformAdminEmail,
    PERMANENT_PLATFORM_ADMIN_EMAIL,
} from '@/lib/auth/platform-owner';
import { ScholarMindCrest } from '@/components/brand/ScholarMindCrest';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { APP_NAME, APP_TAGLINE, VALUE_PROPS, TRUST_BADGES } from '@/lib/constants';

const VALUE_PROP_ICONS = [IndianRupee, BarChart3, ShieldCheck, Building2] as const;

function SubmitButton({ pending }: { pending: boolean }) {
    return (
        <Button type="submit" className="w-full font-semibold" disabled={pending} data-testid="login-button">
            {pending ? (
                <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Signing in...
                </span>
            ) : (
                'Sign in to Workspace'
            )}
        </Button>
    );
}

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null);
    const [schoolCode, setSchoolCode] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [loginMode, setLoginMode] = useState<'school' | 'platform'>('school');
    const [mfaRequired, setMfaRequired] = useState(false);
    const [isPending, startTransition] = useTransition();

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        const formData = new FormData(e.currentTarget);
        formData.set('loginMode', loginMode);

        startTransition(async () => {
            const result = await loginActionV2(formData);
            if (result?.error) {
                setError(result.error);
                setMfaRequired(Boolean(result.mfaRequired));
            }
        });
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="h-1 w-full bg-gradient-to-r from-primary via-brass to-primary" />

            <div className="relative flex min-h-[calc(100vh-4px)]">
                {/* Left Panel — Oxford Navy Institutional Editorial Column */}
                <div className="hidden lg:flex lg:w-1/2 xl:w-[54%] bg-primary text-primary-foreground flex-col justify-between p-10 xl:p-14 relative overflow-hidden">
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 opacity-[0.06]"
                        style={{
                            backgroundImage:
                                'radial-gradient(hsl(var(--brass)) 1px, transparent 1px)',
                            backgroundSize: '24px 24px',
                        }}
                    />

                    <div className="relative z-10">
                        <div className="flex items-center gap-3.5 mb-12">
                            <ScholarMindCrest size="lg" variant="midnight" />
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight text-primary-foreground">
                                    {APP_NAME}
                                </h1>
                                <p className="text-xs uppercase tracking-widest text-primary-foreground/70 font-semibold">
                                    Institutional Operating System
                                </p>
                            </div>
                        </div>

                        <div className="max-w-lg mb-10">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brass/20 border border-brass/40 text-xs font-semibold tracking-wider uppercase text-primary-foreground mb-5">
                                Academic Heritage · Fintech Precision
                            </span>
                            <h2 className="text-4xl xl:text-5xl font-bold text-primary-foreground mb-4 leading-[1.12]">
                                {loginMode === 'platform'
                                    ? 'Global SaaS Command Center'
                                    : 'Financial Governance & Campus Intelligence'}
                            </h2>
                            <p className="text-base xl:text-lg text-primary-foreground/80 leading-relaxed">
                                {loginMode === 'platform'
                                    ? 'Oversee every tenant institution, ARR performance, and security posture from a single audited control plane.'
                                    : 'Unify admissions, student records, encrypted guardian communications, and audited ₹ fee reconciliation across your institution.'}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-8">
                            {VALUE_PROPS.map((prop, i) => {
                                const Icon = VALUE_PROP_ICONS[i % VALUE_PROP_ICONS.length];
                                return (
                                    <div
                                        key={prop.title}
                                        className="flex items-start gap-3.5 p-4 rounded-xl bg-primary-foreground/[0.06] border border-primary-foreground/12"
                                    >
                                        <div className="w-9 h-9 rounded-lg bg-brass/20 border border-brass/40 flex items-center justify-center shrink-0">
                                            <Icon className="w-4 h-4 text-brass" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-sm text-primary-foreground">
                                                {prop.title}
                                            </h3>
                                            <p className="text-xs text-primary-foreground/75 mt-0.5 leading-relaxed">
                                                {prop.description}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {TRUST_BADGES.map((badge) => (
                                <Badge
                                    key={badge}
                                    variant="secondary"
                                    className="bg-primary-foreground/10 hover:bg-primary-foreground/15 text-primary-foreground border border-primary-foreground/15 font-medium"
                                >
                                    <Check className="w-3 h-3 mr-1 text-brass" />
                                    {badge}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    {/* Live Ledger Snapshot Card */}
                    <div className="relative z-10 mt-8 p-5 rounded-2xl bg-primary-foreground/[0.07] border border-brass/30">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[11px] font-bold text-primary-foreground/75 uppercase tracking-widest">
                                Verified Treasury Telemetry
                            </p>
                            <span className="text-[11px] font-mono text-brass font-semibold">
                                RLS · AES-256-GCM
                            </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <p className="text-2xl font-bold tabular-nums text-primary-foreground">₹12.4L</p>
                                <p className="text-xs text-primary-foreground/70">Ageing Arrears</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold tabular-nums text-brass">₹8.2L</p>
                                <p className="text-xs text-primary-foreground/70">Due This Week</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold tabular-nums text-primary-foreground">99.5%</p>
                                <p className="text-xs text-primary-foreground/70">Ledger Match</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel — Warm Ivory Daylight Sign-In Card */}
                <div className="flex-1 flex items-center justify-center p-6 lg:p-10 bg-muted/40">
                    <div className="w-full max-w-md">
                        <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
                            <ScholarMindCrest size="md" />
                            <h1 className="text-xl font-bold text-foreground">{APP_NAME}</h1>
                        </div>

                        <Card className="shadow-lg border-border">
                            <CardHeader className="space-y-1.5 pb-4">
                                <CardTitle className="text-2xl font-bold text-center">
                                    Welcome back
                                </CardTitle>
                                <CardDescription className="text-center">
                                    {loginMode === 'platform'
                                        ? 'Sign in to your Platform Command Center'
                                        : 'Sign in to access your institution workspace'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex rounded-xl bg-muted p-1 mb-6 border border-border">
                                    <button
                                        type="button"
                                        onClick={() => setLoginMode('school')}
                                        className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                                            loginMode === 'school'
                                                ? 'bg-card text-foreground shadow-sm border border-border'
                                                : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        <Building2 className="w-4 h-4" />
                                        School Staff
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLoginMode('platform')}
                                        className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                                            loginMode === 'platform'
                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        <Globe className="w-4 h-4" />
                                        Platform Admin
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <input type="hidden" name="loginMode" value={loginMode} />

                                    {loginMode === 'school' && (
                                        <div className="space-y-2">
                                            <Label htmlFor="schoolCode">School Workspace Code</Label>
                                            <Input
                                                id="schoolCode"
                                                name="schoolCode"
                                                type="text"
                                                placeholder="e.g. DPSN or DEMO-CAMPUS"
                                                value={schoolCode}
                                                onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                                                required
                                                className="uppercase font-mono"
                                                aria-describedby="schoolCode-hint"
                                            />
                                            <p id="schoolCode-hint" className="text-xs text-muted-foreground">
                                                Provided by your institution registrar or onboarding email
                                            </p>
                                        </div>
                                    )}

                                    {loginMode === 'school' && <Separator className="my-4" />}

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Work Email</Label>
                                            <Input
                                                id="email"
                                                name="email"
                                                type="email"
                                                value={email}
                                                placeholder={
                                                    loginMode === 'platform'
                                                        ? PERMANENT_PLATFORM_ADMIN_EMAIL
                                                        : 'you@school.edu.in'
                                                }
                                                onChange={(e) => {
                                                    const nextEmail = e.target.value;
                                                    setEmail(nextEmail);
                                                    if (
                                                        isPermanentPlatformAdminEmail(nextEmail) &&
                                                        loginMode !== 'platform'
                                                    ) {
                                                        setLoginMode('platform');
                                                    }
                                                }}
                                                required
                                                autoComplete="email"
                                                aria-invalid={error ? 'true' : 'false'}
                                                data-testid="email-input"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="password">Password</Label>
                                            <Input
                                                id="password"
                                                name="password"
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="••••••••"
                                                required
                                                autoComplete="current-password"
                                                aria-invalid={error ? 'true' : 'false'}
                                                data-testid="password-input"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Forgot your password? Contact your school administrator to reset credentials.
                                            </p>
                                        </div>
                                        {mfaRequired && (
                                            <div className="space-y-2">
                                                <Label htmlFor="mfaCode">Authenticator or backup code</Label>
                                                <Input
                                                    id="mfaCode"
                                                    name="mfaCode"
                                                    type="text"
                                                    value={mfaCode}
                                                    onChange={(e) => setMfaCode(e.target.value)}
                                                    autoComplete="one-time-code"
                                                    maxLength={12}
                                                    placeholder="123456 or XXXXX-XXXXX"
                                                    required
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center space-x-2">
                                        <Checkbox id="remember" name="remember" />
                                        <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                                            Remember me for 30 days
                                        </Label>
                                    </div>

                                    {error && (
                                        <div
                                            className="p-3 rounded-lg bg-destructive-subtle border border-destructive/20"
                                            data-testid="login-error"
                                        >
                                            <p className="text-sm font-medium text-destructive-subtle-foreground">
                                                {error}
                                            </p>
                                        </div>
                                    )}

                                    <SubmitButton pending={isPending} />
                                </form>
                            </CardContent>
                            <CardFooter className="flex-col gap-3 pt-0">
                                <Separator />
                                <div className="w-full rounded-xl border border-brass/35 bg-accent/70 p-3.5 text-center">
                                    <p className="text-xs text-muted-foreground mb-1">
                                        Evaluating ScholarMind for your school or education trust?
                                    </p>
                                    <Link
                                        href="/demo"
                                        data-testid="explore-live-demo-link"
                                        className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-primary hover:underline"
                                    >
                                        <Sparkles className="w-3.5 h-3.5 text-brass" />
                                        Launch 1-Click Interactive Demo Campus →
                                    </Link>
                                </div>
                                <p className="text-sm text-center text-muted-foreground">
                                    New school or institution?{' '}
                                    <Link
                                        href="/setup"
                                        className="font-semibold text-primary hover:underline"
                                        data-testid="setup-workspace-link"
                                    >
                                        Start automated workspace setup →
                                    </Link>
                                </p>
                                <p className="text-xs text-center text-muted-foreground">
                                    {APP_TAGLINE}
                                </p>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
