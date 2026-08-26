'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { createCertificateTemplateAction, setCertificateTemplateActiveAction } from './_lib/actions';
import { CERTIFICATE_TYPES, certificateTypeLabel } from './_lib/labels';

export function NewTemplateDialog() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [type, setType] = useState<string>('BONAFIDE');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!name.trim()) {
            setError('Give the template a name registrars will recognise.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const result = await createCertificateTemplateAction({ name: name.trim(), type });
            if (!result.success) {
                setError(result.error ?? 'Could not create the template.');
                return;
            }
            setName('');
            setType('BONAFIDE');
            setOpen(false);
            toast.success('Template created');
            router.refresh();
        } catch {
            setError('Something went wrong while saving. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) setError(null); }}>
            <DialogTrigger asChild>
                <Button variant="outline">New template</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>New certificate template</DialogTitle>
                    <DialogDescription>
                        A template names a kind of certificate and fixes its numbering prefix.
                        Custom printed layouts are not part of this release — every certificate
                        prints from the standard record layout.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                            {error}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="template-name">Name *</Label>
                        <Input
                            id="template-name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            maxLength={200}
                            placeholder="e.g. Bonafide certificate (senior school)"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="template-type">Type *</Label>
                        <select
                            id="template-type"
                            value={type}
                            onChange={e => setType(e.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {CERTIFICATE_TYPES.map(t => (
                                <option key={t} value={t}>{certificateTypeLabel(t)}</option>
                            ))}
                        </select>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Saving…' : 'Create template'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function TemplateActiveToggle({
    templateId,
    isActive,
}: {
    templateId: string;
    isActive: boolean;
}) {
    const router = useRouter();
    const [pending, setPending] = useState(false);

    async function toggle() {
        setPending(true);
        try {
            const result = await setCertificateTemplateActiveAction({ templateId, isActive: !isActive });
            if (!result.success) {
                toast.error(result.error ?? 'Could not update the template.');
                return;
            }
            toast.success(isActive ? 'Template retired' : 'Template reactivated');
            router.refresh();
        } catch {
            toast.error('Something went wrong. Please try again.');
        } finally {
            setPending(false);
        }
    }

    return (
        <Button variant="ghost" size="sm" onClick={toggle} disabled={pending}>
            {pending ? 'Saving…' : isActive ? 'Retire' : 'Reactivate'}
        </Button>
    );
}
