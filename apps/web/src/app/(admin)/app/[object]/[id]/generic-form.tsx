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
    layout?: any
}) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const { register, handleSubmit, formState: { errors } } = useForm({
        defaultValues: initialData
    });

    const onSubmit = async (data: Record<string, any>) => {
        setIsSaving(true);
        try {
            await upsertRecord(objectName, data, recordId);
        } catch (error) {
            // Check if the error is actually a redirect signal caught by client
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('NEXT_REDIRECT') || errorMsg.includes('redirect')) {
                return;
            }
            console.error('Save failed:', error);
            toast.error('Failed to save record.');
            setIsSaving(false);
        }
    };

    // Very basic layout rendering - in a real app this reads the JSON schema for grouped tabs/sections
    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <Card>
                <CardHeader>
                    <CardTitle>Record Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {fields.map(field => {
                            if (field.apiName === 'id' || field.apiName === 'tenant_id') return null;
                            
                            return (
                                <div key={field.apiName} className="space-y-2">
                                    <Label className="flex gap-1" htmlFor={field.apiName}>
                                        {field.label} {field.isRequired && <span className="text-red-500">*</span>}
                                        {field.isCustom && <span className="text-xs text-blue-500 ml-2">(Custom)</span>}
                                    </Label>
                                    
                                    {field.dataType === 'PICKLIST' ? (
                                        <select 
                                            id={field.apiName}
                                            className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            {...register(field.apiName, { required: field.isRequired })}
                                        >
                                            <option value="">Select...</option>
                                            {field.picklistOptions?.map((opt: string) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <Input 
                                            id={field.apiName}
                                            type={field.dataType === 'NUMBER' ? 'number' : field.dataType === 'DATE' ? 'date' : 'text'}
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
                <CardFooter className="flex justify-between border-t p-4 bg-slate-50">
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
