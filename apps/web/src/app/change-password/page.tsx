'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { changeTemporaryPassword } from '@/lib/actions/password';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Updating password…' : 'Set new password'}
        </Button>
    );
}

export default function ChangePasswordPage() {
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(formData: FormData) {
        setError(null);
        const result = await changeTemporaryPassword({
            currentPassword: String(formData.get('currentPassword') || ''),
            newPassword: String(formData.get('newPassword') || ''),
            confirmPassword: String(formData.get('confirmPassword') || ''),
        });
        if (!result.success) {
            setError(result.error || 'Unable to update your password.');
            return;
        }
        window.location.assign(result.redirectTo || '/dashboard');
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Choose a permanent password</CardTitle>
                    <CardDescription>
                        Your administrator-issued password is temporary. Replace it before accessing school data.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="currentPassword">Temporary password</Label>
                            <Input
                                id="currentPassword"
                                name="currentPassword"
                                type="password"
                                autoComplete="current-password"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">New password</Label>
                            <Input
                                id="newPassword"
                                name="newPassword"
                                type="password"
                                autoComplete="new-password"
                                minLength={12}
                                maxLength={128}
                                required
                            />
                            <p className="text-xs text-muted-foreground">Use at least 12 characters.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm new password</Label>
                            <Input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                autoComplete="new-password"
                                minLength={12}
                                maxLength={128}
                                required
                            />
                        </div>
                        {error ? (
                            <p role="alert" className="text-sm text-destructive">{error}</p>
                        ) : null}
                        <SubmitButton />
                    </form>
                </CardContent>
            </Card>
        </main>
    );
}
