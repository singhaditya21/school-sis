'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { MetadataField, upsertRecord } from '@/lib/actions/metadata-engine';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/** Shape of the FORM layout schema stored in metadata_layouts. */
type MetadataFormLayout = { sections?: { title?: string; fields?: string[] }[] };

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
    initialData: Record<string, any>,
    layout?: MetadataFormLayout
}) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const { register, handleSubmit, formState: { errors } } = useForm({
        defaultValues: initialData
    });

    const onSubmit = async (data: Record<string, unknown>) => {
        setIsSaving(true);
        try {
            // Success redirects and never returns. A flat `{ success: false }`
            // carries the real validation or permission message.
            // Only send fields this role may write; read-only fields are rendered
            // disabled and must not appear in the payload at all, or the server's
            // field-permission check rejects the whole write.
            const writable: Record<string, unknown> = {};
            for (const field of fields) {
                if (field.canWrite === false) continue;
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
            // Check if the error is actually a redirect signal caught by client
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('NEXT_REDIRECT') || errorMsg.includes('redirect')) {
                return;
            }
            toast.error('Failed to save record.');
            setIsSaving(false);
        }
    };

    // Order the inputs the way the FORM layout declares, so a metadata-defined
    // module has a deliberate field order instead of insertion order.
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
        <form onSubmit={handleSubmit(onSubmit)}>
            <Card>
                <CardHeader>
                    <CardTitle>Record Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {orderedFields.map(field => {
                            if (field.apiName === 'id' || field.apiName === 'tenant_id') return null;

                            // Prefill explicitly rather than relying on the form
                            // library's defaultValues: the record comes from the
                            // metadata engine as strings/booleans, and every input
                            // here is uncontrolled.
                            const raw = initialData[field.apiName];
                            const initialValue = raw === null || raw === undefined ? '' : String(raw);
                            
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

                            return (
                                <div key={field.apiName} className="space-y-2">
                                    <Label className="flex gap-1" htmlFor={field.apiName}>
                                        {field.label} {field.isRequired && <span className="text-red-500">*</span>}
                                        {field.isCustom && <span className="text-xs text-blue-500 ml-2">(Custom)</span>}
                                    </Label>
                                    
                                    {field.dataType === 'PICKLIST' ? (
                                        <select 
                                            id={field.apiName}
                                            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                                            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                                        <p className="text-xs text-red-500">This field is required</p>
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
