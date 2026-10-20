'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import {
    MetadataField,
    getLookupOptions,
    upsertRecord,
} from '@/lib/actions/metadata-engine';
import {
    evaluateMetadataFormula,
    evaluateMetadataVisibilityRule,
    isVirtualMetadataField,
    type DynamicVisibilityOperator,
} from '@/lib/metadata/platform';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, ExternalLink, Hash, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/** Shape of the FORM layout schema stored in metadata_layouts. */
type MetadataFormLayout = {
    sections?: {
        title?: string;
        fields?: string[];
        visibilityRule?: {
            field?: string;
            operator?: DynamicVisibilityOperator | string;
            value?: string;
        };
    }[];
};

export default function GenericFormClient({ 
    objectName, 
    recordId,
    fields, 
    initialData,
    layout
}: { 
    objectName: string, 
    recordId?: string,
    fields: MetadataField[], 
    initialData: Record<string, unknown>,
    layout?: MetadataFormLayout
}) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [lookupOptionsByTarget, setLookupOptionsByTarget] = useState<
        Record<string, { id: string; label: string }[]>
    >({});
    const [lookupSearch, setLookupSearch] = useState<Record<string, string>>({});

    const { register, handleSubmit, watch, formState: { errors } } = useForm({
        defaultValues: initialData
    });

    const watchedValues = watch();

    useEffect(() => {
        const lookupTargets = Array.from(
            new Set(
                fields
                    .filter(
                        f =>
                            f.validationRules?.fieldSubType === 'LOOKUP' &&
                            Boolean(f.validationRules?.lookupTargetObject),
                    )
                    .map(f => String(f.validationRules!.lookupTargetObject)),
            ),
        );
        if (lookupTargets.length === 0) return;

        let cancelled = false;
        Promise.all(
            lookupTargets.map(async target => {
                const opts = await getLookupOptions(target);
                return [target, opts] as const;
            }),
        ).then(entries => {
            if (cancelled) return;
            const next: Record<string, { id: string; label: string }[]> = {};
            for (const [target, opts] of entries) {
                next[target] = opts;
            }
            setLookupOptionsByTarget(next);
        });

        return () => {
            cancelled = true;
        };
    }, [fields]);

    const onSubmit = async (data: Record<string, unknown>) => {
        setIsSaving(true);
        try {
            const writable: Record<string, unknown> = {};
            for (const field of fields) {
                if (field.canWrite === false) continue;
                if (isVirtualMetadataField(field)) continue;
                if (Object.prototype.hasOwnProperty.call(data, field.apiName)) {
                    writable[field.apiName] = data[field.apiName];
                }
            }
            const result = await upsertRecord(objectName, writable, recordId);
            if (result && result.success === false) {
                toast.error(result.error);
                setIsSaving(false);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('NEXT_REDIRECT') || errorMsg.includes('redirect')) {
                return;
            }
            toast.error('Failed to save record.');
            setIsSaving(false);
        }
    };

    const currentFormValues: Record<string, unknown> = {
        ...initialData,
        ...watchedValues,
    };

    // Filter out fields belonging to sections hidden by Dynamic Form visibility rules
    const hiddenBySectionFields = new Set<string>();
    if (Array.isArray(layout?.sections)) {
        for (const section of layout.sections) {
            if (
                section.visibilityRule &&
                !evaluateMetadataVisibilityRule(section.visibilityRule, currentFormValues)
            ) {
                for (const fname of section.fields ?? []) {
                    hiddenBySectionFields.add(fname);
                }
            }
        }
    }

    const layoutOrder: string[] = Array.isArray(layout?.sections)
        ? layout.sections.flatMap(section => section.fields ?? [])
        : [];
    const orderedFields = layoutOrder.length > 0
        ? [
            ...layoutOrder
                .map(name => fields.find(f => f.apiName === name))
                .filter((f): f is MetadataField => Boolean(f)),
            ...fields.filter(f => !layoutOrder.includes(f.apiName)),
        ]
        : fields;

    return (
        <form onSubmit={handleSubmit(onSubmit)} data-testid="dynamic-metadata-form">
            <Card>
                <CardHeader>
                    <CardTitle>Record Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {orderedFields.map(field => {
                            if (field.apiName === 'id' || field.apiName === 'tenant_id') return null;
                            if (hiddenBySectionFields.has(field.apiName)) return null;

                            if (
                                field.validationRules?.visibilityWhenField &&
                                !evaluateMetadataVisibilityRule(
                                    {
                                        field: field.validationRules.visibilityWhenField,
                                        operator: field.validationRules.visibilityWhenOperator,
                                        value: field.validationRules.visibilityWhenValue,
                                    },
                                    currentFormValues,
                                )
                            ) {
                                return null;
                            }

                            const raw = initialData[field.apiName];
                            const initialValue = raw === null || raw === undefined ? '' : String(raw);
                            const subType = field.validationRules?.fieldSubType;

                            if (subType === 'AUTO_NUMBER') {
                                return (
                                    <div key={field.apiName} className="space-y-2">
                                        <Label className="flex items-center gap-1.5" htmlFor={field.apiName}>
                                            <Hash className="w-3.5 h-3.5 text-primary" />
                                            {field.label}
                                            <span className="ml-1 text-xs font-mono text-primary">
                                                (Auto-Number)
                                            </span>
                                        </Label>
                                        <Input
                                            id={field.apiName}
                                            disabled
                                            readOnly
                                            value={
                                                initialValue ||
                                                `Auto-generated (${field.validationRules?.autoNumberPrefix || 'REC-{YYYY}-{0000}'})`
                                            }
                                            className="bg-muted/60 font-mono"
                                        />
                                    </div>
                                );
                            }

                            if (subType === 'ROLLUP_SUMMARY') {
                                return (
                                    <div key={field.apiName} className="space-y-2">
                                        <Label className="flex items-center gap-1.5" htmlFor={field.apiName}>
                                            <Calculator className="w-3.5 h-3.5 text-primary" />
                                            {field.label}
                                            <span className="ml-1 text-xs font-mono text-primary">
                                                (Roll-Up: {field.validationRules?.rollupAggregate || 'COUNT'} on {field.validationRules?.rollupChildObject})
                                            </span>
                                        </Label>
                                        <Input
                                            id={field.apiName}
                                            disabled
                                            readOnly
                                            value={initialValue || '0'}
                                            className="bg-muted/60 font-mono"
                                        />
                                    </div>
                                );
                            }

                            if (subType === 'FORMULA' && field.validationRules?.formulaExpression) {
                                const computed = evaluateMetadataFormula(
                                    field.validationRules.formulaExpression,
                                    { ...initialData, ...watchedValues },
                                );
                                return (
                                    <div key={field.apiName} className="space-y-2">
                                        <Label className="flex items-center gap-1.5" htmlFor={field.apiName}>
                                            <Calculator className="w-3.5 h-3.5 text-info" />
                                            {field.label}
                                            <span className="ml-1 text-xs font-mono text-info">
                                                (Formula: {field.validationRules.formulaExpression})
                                            </span>
                                        </Label>
                                        <Input
                                            id={field.apiName}
                                            disabled
                                            readOnly
                                            value={computed === null ? '—' : String(computed)}
                                            className="bg-muted/60 font-mono"
                                        />
                                    </div>
                                );
                            }

                            if (field.canWrite === false) {
                                return (
                                    <div key={field.apiName} className="space-y-2">
                                        <Label className="flex gap-1" htmlFor={field.apiName}>
                                            {field.label}
                                            <span className="ml-2 text-xs text-muted-foreground">(read only)</span>
                                        </Label>
                                        <Input
                                            id={field.apiName}
                                            disabled
                                            readOnly
                                            defaultValue={initialValue}
                                        />
                                    </div>
                                );
                            }

                            if (subType === 'LOOKUP' && field.validationRules?.lookupTargetObject) {
                                const targetObj = field.validationRules.lookupTargetObject;
                                const allOpts = lookupOptionsByTarget[targetObj] ?? [];
                                const search = (lookupSearch[field.apiName] || '').toLowerCase();
                                const filteredOpts = search
                                    ? allOpts.filter(o => o.label.toLowerCase().includes(search))
                                    : allOpts;
                                const currentLookupId = String(
                                    watchedValues[field.apiName] ?? initialValue ?? '',
                                );

                                return (
                                    <div key={field.apiName} className="space-y-2">
                                        <Label className="flex items-center gap-1.5" htmlFor={field.apiName}>
                                            <Link2 className="w-3.5 h-3.5 text-primary" />
                                            {field.label}{' '}
                                            {field.isRequired && <span className="text-destructive">*</span>}
                                            <span className="text-xs font-mono text-primary ml-1">
                                                (Lookup → {targetObj})
                                            </span>
                                        </Label>
                                        <div className="space-y-1.5">
                                            <Input
                                                type="text"
                                                placeholder={`Filter ${targetObj} records…`}
                                                value={lookupSearch[field.apiName] || ''}
                                                onChange={e =>
                                                    setLookupSearch(prev => ({
                                                        ...prev,
                                                        [field.apiName]: e.target.value,
                                                    }))
                                                }
                                                className="h-8 text-xs"
                                            />
                                            <select
                                                id={field.apiName}
                                                className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                defaultValue={initialValue}
                                                {...register(field.apiName, { required: field.isRequired })}
                                            >
                                                <option value="">Select {targetObj} record…</option>
                                                {filteredOpts.map(opt => (
                                                    <option key={opt.id} value={opt.id}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                            {currentLookupId && (
                                                <Link
                                                    href={`/app/${targetObj}/${currentLookupId}`}
                                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                                >
                                                    Open linked {targetObj} record{' '}
                                                    <ExternalLink className="w-3 h-3" />
                                                </Link>
                                            )}
                                        </div>
                                        {errors[field.apiName] && (
                                            <p className="text-xs text-destructive">This field is required</p>
                                        )}
                                    </div>
                                );
                            }

                            return (
                                <div key={field.apiName} className="space-y-2">
                                    <Label className="flex gap-1" htmlFor={field.apiName}>
                                        {field.label} {field.isRequired && <span className="text-destructive">*</span>}
                                        {field.isCustom && <span className="text-xs text-primary ml-2">(Custom)</span>}
                                    </Label>
                                    
                                    {field.dataType === 'PICKLIST' ? (
                                        <select 
                                            id={field.apiName}
                                            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            defaultValue={initialValue}
                                            {...register(field.apiName, { required: field.isRequired })}
                                        >
                                            <option value="">Select...</option>
                                            {field.picklistOptions?.map((opt: string) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    ) : field.dataType === 'BOOLEAN' ? (
                                        <select
                                            id={field.apiName}
                                            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            defaultValue={initialValue}
                                            {...register(field.apiName, { required: field.isRequired })}
                                        >
                                            <option value="">Select...</option>
                                            <option value="true">Yes</option>
                                            <option value="false">No</option>
                                        </select>
                                    ) : (
                                        <Input 
                                            id={field.apiName}
                                            type={field.dataType === 'NUMBER' || field.dataType === 'CURRENCY' ? 'number' : field.dataType === 'DATE' ? 'date' : 'text'}
                                            step={field.dataType === 'CURRENCY' ? '0.01' : undefined}
                                            defaultValue={initialValue}
                                            {...register(field.apiName, { required: field.isRequired })}
                                        />
                                    )}
                                    {errors[field.apiName] && (
                                        <p className="text-xs text-destructive">This field is required</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t p-4 bg-muted">
                    <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Record
                    </Button>
                </CardFooter>
            </Card>
        </form>
    );
}
