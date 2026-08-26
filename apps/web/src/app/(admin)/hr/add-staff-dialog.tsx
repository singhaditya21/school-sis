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
import { createStaff } from '@/lib/actions/hr';
import type { DepartmentOption, DesignationOption } from '@/lib/actions/hr';
import { EMPLOYMENT_TYPE_OPTIONS, employmentTypeLabel } from './labels';

interface AddStaffDialogProps {
    departments: DepartmentOption[];
    designations: DesignationOption[];
}

export default function AddStaffDialog({ departments, designations }: AddStaffDialogProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);

        setSubmitting(true);
        setError(null);
        try {
            const result = await createStaff(formData);
            if (!result.success) {
                setError(result.error ?? 'Could not create the staff record.');
                return;
            }
            form.reset();
            setOpen(false);
            toast.success('Staff member added');
            router.refresh();
        } catch {
            setError('Something went wrong while saving. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>Add staff member</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Add staff member</DialogTitle>
                    <DialogDescription>
                        Creates the user account and the employment record. The person still needs a
                        password set before they can sign in.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="firstName">First name *</Label>
                            <Input id="firstName" name="firstName" required maxLength={100} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="lastName">Last name *</Label>
                            <Input id="lastName" name="lastName" required maxLength={100} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="email">Email *</Label>
                            <Input id="email" name="email" type="email" required />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="phone">Phone</Label>
                            <Input id="phone" name="phone" maxLength={20} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="employeeId">Employee ID *</Label>
                            <Input id="employeeId" name="employeeId" required maxLength={20} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="joiningDate">Joining date *</Label>
                            <Input id="joiningDate" name="joiningDate" type="date" required />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="departmentId">Department</Label>
                            <select
                                id="departmentId"
                                name="departmentId"
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                defaultValue=""
                            >
                                <option value="">Unassigned</option>
                                {departments.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="designationId">Designation</Label>
                            <select
                                id="designationId"
                                name="designationId"
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                defaultValue=""
                            >
                                <option value="">Unassigned</option>
                                {designations.map(d => (
                                    <option key={d.id} value={d.id}>
                                        {d.grade ? `${d.name} (${d.grade})` : d.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="employmentType">Employment type</Label>
                            <select
                                id="employmentType"
                                name="employmentType"
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                defaultValue="FULL_TIME"
                            >
                                {EMPLOYMENT_TYPE_OPTIONS.map(t => (
                                    <option key={t} value={t}>{employmentTypeLabel(t)}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="salaryBasic">Basic salary (₹ per month)</Label>
                            <Input
                                id="salaryBasic"
                                name="salaryBasic"
                                type="number"
                                min="0"
                                step="0.01"
                                defaultValue="0"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Saving…' : 'Add staff member'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
