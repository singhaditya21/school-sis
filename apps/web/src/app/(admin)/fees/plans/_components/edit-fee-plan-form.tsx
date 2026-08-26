'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { saveFeePlan } from '@/lib/actions/fee-plans';
import type { FeePlanDetail } from '@/lib/actions/fee-plans';
import { ComponentDraft, ComponentRowsEditor } from './component-rows-editor';

function toDrafts(plan: FeePlanDetail): ComponentDraft[] {
    return plan.components.map((component) => ({
        key: component.id,
        id: component.id,
        name: component.name,
        // numeric(12,2) arrives as "5000.00"; trim a whole-rupee .00 so staff
        // edit the number they originally typed.
        amount: component.amount.endsWith('.00') ? component.amount.slice(0, -3) : component.amount,
        frequency: component.frequency,
        isOptional: component.isOptional,
    }));
}

/**
 * Loads from the real plan and saves the header plus the full component set
 * through one transactional server action, so components can be added, edited
 * and removed without ever leaving the plan half-updated.
 */
export function EditFeePlanForm({ plan }: { plan: FeePlanDetail }) {
    const router = useRouter();

    const [name, setName] = useState(plan.name);
    const [description, setDescription] = useState(plan.description ?? '');
    const [isActive, setIsActive] = useState(plan.isActive);
    const [components, setComponents] = useState<ComponentDraft[]>(() => toDrafts(plan));
    const [saving, setSaving] = useState(false);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving) return;

        if (!name.trim()) {
            toast.error('Enter a plan name.');
            return;
        }
        if (components.length === 0) {
            toast.error('Add at least one fee component.');
            return;
        }

        setSaving(true);
        try {
            const result = await saveFeePlan({
                planId: plan.id,
                name: name.trim(),
                description: description.trim(),
                isActive,
                components: components.map((component) => ({
                    id: component.id ?? undefined,
                    name: component.name.trim(),
                    amount: component.amount.trim(),
                    frequency: component.frequency,
                    isOptional: component.isOptional,
                })),
            });

            if (result.success) {
                toast.success(`Plan saved. ${result.componentCount} component${result.componentCount === 1 ? '' : 's'} on file.`);
                router.refresh();
            } else {
                toast.error(result.error ?? 'Could not save the fee plan.');
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not save the fee plan.');
        }
        setSaving(false);
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Plan details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="plan-name">Plan name</Label>
                        <Input
                            id="plan-name"
                            data-testid="plan-name"
                            value={name}
                            maxLength={255}
                            disabled={saving}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </div>

                    <div>
                        <Label htmlFor="plan-description">Description</Label>
                        <Textarea
                            id="plan-description"
                            value={description}
                            rows={3}
                            disabled={saving}
                            onChange={(event) => setDescription(event.target.value)}
                        />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                            <p className="text-sm font-medium">Active</p>
                            <p className="text-xs text-muted-foreground">
                                Inactive plans stay on record but should not be used for new invoices.
                            </p>
                        </div>
                        <Switch
                            checked={isActive}
                            disabled={saving}
                            data-testid="plan-active"
                            onCheckedChange={setIsActive}
                        />
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Academic year: {plan.academicYearName} · {plan.invoiceCount} invoice
                        {plan.invoiceCount === 1 ? '' : 's'} already generated from this plan.
                    </p>
                    {plan.invoiceCount > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                            Changing components does not re-price invoices already issued — only invoices
                            generated after this save use the new amounts.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <ComponentRowsEditor rows={components} onChange={setComponents} disabled={saving} />
                </CardContent>
            </Card>

            <div className="flex items-center gap-3">
                <Button type="submit" data-testid="save-plan" disabled={saving}>
                    {saving ? 'Saving…' : 'Save changes'}
                </Button>
                <Button type="button" variant="outline" asChild>
                    <Link href="/fees/plans">Back to plans</Link>
                </Button>
            </div>
        </form>
    );
}
