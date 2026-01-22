'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction } from '@/lib/actions/auth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Separator } from '@/components/ui/separator';
import { APP_NAME, APP_TAGLINE, VALUE_PROPS, TRUST_BADGES, DEMO_CREDENTIALS } from '@/lib/constants';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
                <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Signing in...
                </span>
            ) : (
                'Sign in'
            )}
        </Button>
    );
}

export default function LoginPage() {
    const [error, setError] = useState<string | null>(null);
    const [schoolCode, setSchoolCode] = useState('GREENWOOD');

    async function handleSubmit(formData: FormData) {
        setError(null);
        const result = await loginAction(formData);
        if (result?.error) {
            setError(result.error);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950">
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiM5NDk0OTQiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyem0wLTRoLTEydjJoMTJ2LTJ6bTAtNGgtMTJ2MmgxMnYtMnptMC00aC0xMnYyaDEydi0yem0tMTgtNHYyaDEydi0ySDEyem0xOCAwaC0xMnYyaDEydi0yem0wIDR2LTJIMTh2MmgxMnoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-50" />

            <div className="relative flex min-h-screen">
                {/* Left Panel - Brand & Value Props (hidden on mobile) */}
                <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col justify-between p-8 xl:p-12">
                    <div>
                        {/* Logo */}
                        <div className="flex items-center gap-3 mb-12">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                                <span className="text-white text-2xl">🎓</span>
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{APP_NAME}</h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400">School Management Platform</p>
                            </div>
                        </div>

                        {/* Hero Text */}
                        <div className="max-w-md mb-10">
                            <h2 className="text-4xl xl:text-5xl font-bold text-gray-900 dark:text-white mb-4 leading-tight">
                                Fees-First Intelligence for Modern Schools
                            </h2>
                            <p className="text-lg text-gray-600 dark:text-gray-300">
                                Streamline fee collections, automate reminders, and gain actionable insights into your school&apos;s financial health.
                            </p>
                        </div>

                        {/* Value Props */}
                        <div className="space-y-4 mb-8">
                            {VALUE_PROPS.map((prop, i) => (
                                <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-white/60 dark:bg-slate-800/40 backdrop-blur-sm border border-gray-200/50 dark:border-slate-700/50">
                                    <span className="text-2xl">{prop.icon}</span>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 dark:text-white">{prop.title}</h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">{prop.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Trust Badges */}
                        <div className="flex flex-wrap gap-2">
                            {TRUST_BADGES.map((badge, i) => (
                                <Badge key={i} variant="secondary" className="bg-white/80 dark:bg-slate-800 text-gray-700 dark:text-gray-300">
                                    ✓ {badge}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    {/* Preview Card */}
                    <div className="mt-8 p-6 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-slate-700/50 shadow-xl">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">Live Insights Preview</p>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <p className="text-2xl font-bold text-red-600 dark:text-red-400">₹12.4L</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Overdue</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">₹8.2L</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Due this week</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-green-600 dark:text-green-400">78%</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Collection rate</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel - Login Form */}
                <div className="flex-1 flex items-center justify-center p-6 lg:p-8">
                    <div className="w-full max-w-md">
                        {/* Mobile Logo */}
                        <div className="flex items-center justify-center gap-3 mb-8 lg:hidden">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                                <span className="text-white text-xl">🎓</span>
                            </div>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{APP_NAME}</h1>
                        </div>

                        <Card className="shadow-xl border-gray-200/50 dark:border-slate-700/50">
                            <CardHeader className="space-y-1 pb-4">
                                <CardTitle className="text-2xl font-bold text-center">Welcome back</CardTitle>
                                <CardDescription className="text-center">
                                    Sign in to access your school dashboard
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form action={handleSubmit} className="space-y-4">
                                    {/* Tenant Field */}
                                    <div className="space-y-2">
                                        <Label htmlFor="schoolCode">School Code</Label>
                                        <Input
                                            id="schoolCode"
                                            name="schoolCode"
                                            type="text"
                                            placeholder="Enter your school code"
                                            value={schoolCode}
                                            onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                                            required
                                            className="uppercase"
                                            aria-describedby="schoolCode-hint"
                                        />
                                        <p id="schoolCode-hint" className="text-xs text-muted-foreground">
                                            Contact your school administrator for the code
                                        </p>
                                    </div>

                                    <Separator className="my-4" />

                                    {/* Auth Tabs */}
                                    <Tabs defaultValue="password" className="w-full">
                                        <TabsList className="grid w-full grid-cols-2">
                                            <TabsTrigger value="password">Password</TabsTrigger>
                                            <TabsTrigger value="otp">OTP</TabsTrigger>
                                        </TabsList>

                                        {/* Password Tab */}
                                        <TabsContent value="password" className="space-y-4 mt-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="email">Email</Label>
                                                <Input
                                                    id="email"
                                                    name="email"
                                                    type="email"
                                                    placeholder="you@school.edu"
                                                    required
                                                    autoComplete="email"
                                                    aria-invalid={error ? 'true' : 'false'}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label htmlFor="password">Password</Label>
                                                    <a href="/forgot-password" className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                                                        Forgot password?
                                                    </a>
                                                </div>
                                                <Input
                                                    id="password"
                                                    name="password"
                                                    type="password"
                                                    placeholder="••••••••"
                                                    required
                                                    autoComplete="current-password"
                                                    aria-invalid={error ? 'true' : 'false'}
                                                />
                                            </div>
                                        </TabsContent>

                                        {/* OTP Tab */}
                                        <TabsContent value="otp" className="space-y-4 mt-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="otp-email">Email or Phone</Label>
                                                <Input
                                                    id="otp-email"
                                                    name="otpEmail"
                                                    type="text"
                                                    placeholder="you@school.edu or +91 98765..."
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <Input
                                                    id="otp"
                                                    name="otp"
                                                    type="text"
                                                    placeholder="Enter OTP"
                                                    maxLength={6}
                                                    className="flex-1"
                                                />
                                                <Button type="button" variant="outline" className="shrink-0">
                                                    Send OTP
                                                </Button>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                OTP will be sent to your registered email or phone
                                            </p>
                                        </TabsContent>
                                    </Tabs>

                                    {/* Remember Me */}
                                    <div className="flex items-center space-x-2">
                                        <Checkbox id="remember" name="remember" />
                                        <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                                            Remember me for 30 days
                                        </Label>
                                    </div>

                                    {/* Error Message */}
                                    {error && (
                                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                                        </div>
                                    )}

                                    {/* Submit Button */}
                                    <SubmitButton />
                                </form>

                                {/* Demo Credentials */}
                                <Accordion type="single" collapsible className="mt-6">
                                    <AccordionItem value="demo" className="border-dashed">
                                        <AccordionTrigger className="text-sm text-muted-foreground hover:no-underline">
                                            Demo Credentials
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <div className="space-y-2 pt-2">
                                                {DEMO_CREDENTIALS.map((cred, i) => (
                                                    <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/50 text-xs">
                                                        <Badge variant="outline" className="text-xs">{cred.role}</Badge>
                                                        <span className="font-mono">{cred.email}</span>
                                                        <span className="text-muted-foreground">{cred.password}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                </Accordion>
                            </CardContent>
                            <CardFooter className="flex-col gap-4 pt-0">
                                <Separator />
                                <p className="text-xs text-center text-muted-foreground">
                                    {APP_TAGLINE}
                                </p>
                                <div className="flex gap-4 text-xs text-muted-foreground">
                                    <a href="/privacy" className="hover:underline">Privacy Policy</a>
                                    <a href="/terms" className="hover:underline">Terms of Service</a>
                                </div>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
