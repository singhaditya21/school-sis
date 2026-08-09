'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { updateFeePlan, type FeePlanForEdit } from '@/lib/actions/fees';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type EditFeePlanFormProps = {
    plan: FeePlanForEdit;
};

type SaveStatus =
    | { kind: 'idle' }
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string; conflict?: boolean };

const inr = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
});

function frequencyLabel(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

export default function EditFeePlanForm({ plan }: EditFeePlanFormProps) {
    const router = useRouter();
    const [name, setName] = useState(plan.name);
    const [description, setDescription] = useState(plan.description || '');
    const [isActive, setIsActive] = useState(plan.isActive);
    const [updatedAt, setUpdatedAt] = useState(plan.updatedAt);
    const [isSaving, setIsSaving] = useState(false);
    const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSaving(true);
        setStatus({ kind: 'idle' });

        try {
            const result = await updateFeePlan({
                id: plan.id,
                name,
                description: description.trim() || null,
                isActive,
                updatedAt,
            });

            if (result.success === false) {
                setStatus({
                    kind: 'error',
                    message: result.error,
                    conflict: result.code === 'CONFLICT',
                });
                return;
            }

            setUpdatedAt(result.updatedAt);
            setStatus({ kind: 'success', message: 'Fee plan changes were saved and audited.' });
            router.refresh();
        } catch {
            setStatus({ kind: 'error', message: 'Fee plan changes were not saved. Please try again.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-6">
            <div>
                <Button asChild variant="ghost" className="mb-3 -ml-3">
                    <Link href="/fees">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Fee plans
                    </Link>
                </Button>
                <h1 className="text-3xl font-bold tracking-tight">Edit fee plan</h1>
                <p className="mt-1 text-muted-foreground">
                    {plan.academicYearName}. Concurrent changes are detected before this record is updated.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Plan details</CardTitle>
                    <CardDescription>
                        These values are persisted to the signed-in tenant and written to the audit trail.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {status.kind !== 'idle' ? (
                            <div
                                role={status.kind === 'error' ? 'alert' : 'status'}
                                aria-live="polite"
                                className={status.kind === 'error'
                                    ? 'flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800'
                                    : 'flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'}
                            >
                                {status.kind === 'error'
                                    ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                    : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                                <div>
                                    <p>{status.message}</p>
                                    {status.kind === 'error' && status.conflict ? (
                                        <Button
                                            type="button"
                                            variant="link"
                                            className="h-auto p-0 text-red-900"
                                            onClick={() => window.location.reload()}
                                        >
                                            Reload current values
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}

                        <div className="space-y-2">
                            <Label htmlFor="plan-name">Plan name</Label>
                            <Input
                                id="plan-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                required
                                maxLength={255}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="plan-description">Description</Label>
                            <Textarea
                                id="plan-description"
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                rows={4}
                                maxLength={2_000}
                            />
                        </div>
                        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                            <div>
                                <Label htmlFor="plan-active">Active plan</Label>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Inactive plans remain in history but cannot be selected for new billing runs.
                                </p>
                            </div>
                            <Switch id="plan-active" checked={isActive} onCheckedChange={setIsActive} />
                        </div>
                        <div className="flex flex-wrap gap-3 pt-2">
                            <Button type="submit" disabled={isSaving || !name.trim()}>
                                {isSaving ? 'Saving changes…' : 'Save changes'}
                            </Button>
                            <Button asChild type="button" variant="outline">
                                <Link href="/fees">Cancel</Link>
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Fee components</CardTitle>
                    <CardDescription>
                        Component amounts and schedules are shown from the database and are not changed by this form.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {plan.components.length > 0 ? (
                        <ul className="divide-y rounded-lg border">
                            {plan.components.map((component) => (
                                <li key={component.id} className="flex items-center justify-between gap-4 p-4">
                                    <div>
                                        <p className="font-medium">{component.name}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {frequencyLabel(component.frequency)}{component.isOptional ? ' · Optional' : ''}
                                        </p>
                                    </div>
                                    <p className="font-mono text-sm font-semibold">
                                        {inr.format(Number(component.amount))}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="rounded-lg border border-dashed p-6 text-center">
                            <p className="font-medium">No fee components</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                This plan has no billable components yet.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
