'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Mail, Lock, User, ArrowRight, AlertTriangle } from 'lucide-react';
import { ScholarMindCrest } from '@/components/brand/ScholarMindCrest';
import { setupSchoolWorkspace } from '@/lib/actions/onboarding';
import { normalizeWorkspaceCode } from '@/lib/auth/platform-owner';

export default function SetupWorkspacePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [domainInput, setDomainInput] = useState('');
    const previewCode = normalizeWorkspaceCode(domainInput);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        
        try {
            const res = await setupSchoolWorkspace(formData);
            if (res.error) {
                setError(res.error);
                setLoading(false);
            } else {
                // Created the workspace and signed in. Administrators must enrol
                // in two-factor before anything else: SCHOOL_ADMIN is in
                // MFA_REQUIRED_ROLES, so every other route redirects to
                // /login?mfa=required until enrolment completes. The enrolment
                // page sends them on to /pricing for checkout.
                router.push('/mfa/setup');
            }
        } catch (err: unknown) {
            setError((err as { message?: string }).message || 'An unexpected error occurred.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <div className="h-1.5 w-full bg-gradient-to-r from-primary via-brass to-primary" />
            <div className="flex-1 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <ScholarMindCrest size="md" />
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground tracking-tight">
                    Onboard your school
                </h2>
                <p className="mt-2 text-center text-sm text-muted-foreground">
                    Set up your dedicated workspace in seconds.
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
                <Card className="border-0 shadow-2xl ring-1 ring-border">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl">Workspace Details</CardTitle>
                        <CardDescription>We'll provision an isolated database for your data.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            
                            {error && (
                                <div className="p-3 bg-destructive-subtle border border-destructive/30 rounded-lg text-sm text-destructive-subtle-foreground flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="schoolName" className="block text-sm font-medium text-foreground">Official School Name</label>
                                    <div className="mt-1 relative rounded-md shadow-sm">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Building2 className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <Input
                                            type="text"
                                            name="schoolName"
                                            id="schoolName"
                                            required
                                            className="pl-10 block w-full sm:text-sm h-11"
                                            placeholder="St. Jude's Academy"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="adminFirstName" className="block text-sm font-medium text-foreground">Admin First Name</label>
                                        <div className="mt-1 relative rounded-md">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <User className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                            <Input required type="text" name="adminFirstName" className="pl-10 h-11" placeholder="John" />
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="adminLastName" className="block text-sm font-medium text-foreground">Admin Last Name</label>
                                        <Input required type="text" name="adminLastName" className="mt-1 h-11" placeholder="Doe" />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-foreground">Admin Email Address</label>
                                    <div className="mt-1 relative rounded-md">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Mail className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <Input required type="email" name="email" className="pl-10 h-11" placeholder="admin@stjudes.edu" />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="domain" className="block text-sm font-medium text-foreground">Workspace Subdomain &amp; School Code</label>
                                    <div className="mt-1 relative rounded-md flex">
                                        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-border bg-muted text-muted-foreground sm:text-sm">
                                            https://
                                        </span>
                                        <Input
                                            required
                                            id="domain"
                                            type="text"
                                            name="domain"
                                            value={domainInput}
                                            onChange={(e) => setDomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                            className="flex-1 rounded-none h-11"
                                            placeholder="stjudes"
                                        />
                                        <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-border bg-muted text-muted-foreground sm:text-sm">
                                            .scholarmind.app
                                        </span>
                                    </div>
                                    <p className="mt-1.5 text-xs text-muted-foreground">
                                        Staff &amp; parent sign-in School Code:{' '}
                                        <span className="font-mono font-semibold text-foreground" data-testid="setup-school-code-preview">
                                            {previewCode || 'STJUDES'}
                                        </span>
                                    </p>
                                </div>

                                <div>
                                    <label htmlFor="password" className="block text-sm font-medium text-foreground">Secure Password</label>
                                    <div className="mt-1 relative rounded-md">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Lock className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <Input required id="password" type="password" name="password" className="pl-10 h-11" placeholder="Minimum 12 characters" minLength={12} />
                                    </div>
                                </div>
                            </div>

                            <Button 
                                type="submit" 
                                disabled={loading}
                                data-testid="setup-submit-button"
                                className="w-full flex justify-center py-6 border border-transparent rounded-xl shadow-sm text-md font-semibold text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-all"
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                        Provisioning Database...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        Create Workspace &amp; Continue <ArrowRight className="w-5 h-5" />
                                    </span>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
                <p className="mt-6 text-center text-sm text-muted-foreground">
                    Already have a school workspace?{' '}
                    <Link href="/login" className="font-semibold text-primary hover:underline">
                        Sign in →
                    </Link>
                </p>
                <p className="mt-4 text-center text-xs text-muted-foreground max-w-sm mx-auto">
                    By proceeding, you agree to ScholarMind&apos;s Terms of Service and Data Processing Addendum.
                </p>
            </div>
            </div>
        </div>
    );
}
