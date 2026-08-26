'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { createFeePlan } from '@/lib/actions/mutations';
import {
    ComponentDraft,
    ComponentRowsEditor,
    newComponentDraft,
} from './component-rows-editor';

export interface AcademicYearOption {
    id: string;
    name: string;
    isCurrent: boolean;
}

/**
 * Creates the plan and its components in a single server action call, so a
 * school never ends up with a saved plan that cannot be invoiced.
 * Component rows are posted as parallel repeated fields; `componentIsOptional`
 * is sent explicitly as 'true'/'false' so unchecked rows keep their position.
 */
export function NewFeePlanForm({ academicYears }: { academicYears: AcademicYearOption[] }) {
    const router = useRouter();

    const currentYear = academicYears.find((year) => year.isCurrent);
    const [name, setName] = useState('');
    const [academicYearId, setAcademicYearId] = useState(currentYear?.id ?? '');
    const [description, setDescription] = useState('');
    const [components, setComponents] = useState<ComponentDraft[]>(() => [newComponentDraft()]);
    const [saving, setSaving] = useState(false);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (saving) return;

        if (!name.trim()) {
            toast.error('Enter a plan name.');
            return;
        }
        if (!academicYearId) {
            toast.error('Select an academic year.');
            return;
        }
        if (components.length === 0) {
            toast.error('Add at least one fee component.');
            return;
        }

        const formData = new FormData();
        formData.set('name', name.trim());
        formData.set('academicYearId', academicYearId);
        if (description.trim()) formData.set('description', description.trim());
        for (const component of components) {
            formData.append('componentName', component.name.trim());
            formData.append('componentAmount', component.amount.trim());
            formData.append('componentFrequency', component.frequency);
            formData.append('componentIsOptional', component.isOptional ? 'true' : 'false');
        }

        setSaving(true);
        try {
            const result = await createFeePlan(formData);
            if (result.success && result.feePlanId) {
                toast.success(`Fee plan created with ${components.length} component${components.length === 1 ? '' : 's'}.`);
                router.push(`/fees/plans/${result.feePlanId}/edit`);
                router.refresh();
                return;
            }
            toast.error(result.error ?? 'Could not create the fee plan.');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not create the fee plan.');
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
                            placeholder="e.g. Class 1-5 Annual Fee"
                            disabled={saving}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </div>

                    <div>
                        <Label>Academic year</Label>
                        <Select value={academicYearId} onValueChange={setAcademicYearId} disabled={saving}>
                            <SelectTrigger data-testid="academic-year-select">
                                <SelectValue placeholder="Select an academic year" />
                            </SelectTrigger>
                            <SelectContent>
                                {academicYears.map((year) => (
                                    <SelectItem key={year.id} value={year.id}>
                                        {year.name}
                                        {year.isCurrent ? ' (current)' : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {academicYears.length === 0 && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                                No academic years exist yet. Create one before adding a fee plan.
                            </p>
                        )}
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
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <ComponentRowsEditor rows={components} onChange={setComponents} disabled={saving} />
                </CardContent>
            </Card>

            <div className="flex items-center gap-3">
                <Button type="submit" data-testid="save-plan" disabled={saving || academicYears.length === 0}>
                    {saving ? 'Creating…' : 'Create fee plan'}
                </Button>
                <Button type="button" variant="outline" asChild>
                    <Link href="/fees/plans">Cancel</Link>
                </Button>
            </div>
        </form>
    );
}
