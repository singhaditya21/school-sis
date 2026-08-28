'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Save } from 'lucide-react';
import { updateSchoolProfileAction, type SchoolProfile, type SchoolProfileInput } from './actions';
import { INSTITUTION_TYPES, INSTITUTION_TYPE_LABELS } from './constants';

function toFormState(profile: SchoolProfile): SchoolProfileInput {
    return {
        name: profile.name ?? '',
        institutionType: profile.institutionType ?? 'K12',
        logoUrl: profile.logoUrl ?? '',
        address: profile.address ?? '',
        city: profile.city ?? '',
        state: profile.state ?? '',
        pincode: profile.pincode ?? '',
        phone: profile.phone ?? '',
        email: profile.email ?? '',
        website: profile.website ?? '',
        affiliationBoard: profile.affiliationBoard ?? '',
        affiliationNumber: profile.affiliationNumber ?? '',
        udiseCode: profile.udiseCode ?? '',
    };
}

export default function SchoolProfileForm({ profile }: { profile: SchoolProfile }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [form, setForm] = useState<SchoolProfileInput>(() => toFormState(profile));
    const [saved, setSaved] = useState<SchoolProfileInput>(() => toFormState(profile));
    const [invalidField, setInvalidField] = useState<keyof SchoolProfileInput | null>(null);

    const isDirty = (Object.keys(form) as (keyof SchoolProfileInput)[]).some(
        (key) => form[key] !== saved[key],
    );

    const set = (key: keyof SchoolProfileInput) => (value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setInvalidField((current) => (current === key ? null : current));
    };

    const handleSave = () => {
        startTransition(async () => {
            const result = await updateSchoolProfileAction(form);

            if (!result.success) {
                setInvalidField(result.field ?? null);
                toast.error(result.error || 'Could not save the school profile.');
                return;
            }

            setSaved(form);
            setInvalidField(null);
            toast.success('School profile saved.');
            router.refresh();
        });
    };

    const handleReset = () => {
        setForm(saved);
        setInvalidField(null);
    };

    const fieldClass = (key: keyof SchoolProfileInput) =>
        invalidField === key ? 'border-red-400 focus-visible:ring-red-400' : undefined;

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <CardTitle>School Profile</CardTitle>
                        <CardDescription>
                            Stored on this school&apos;s tenant record and used across documents,
                            certificates and communications.
                        </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                        <Badge variant="outline" className="font-mono">
                            {profile.code}
                        </Badge>
                        <span>
                            {profile.domain
                                ? `Domain: ${profile.domain}`
                                : 'No custom domain configured'}
                        </span>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="school-name">School Name</Label>
                        <Input
                            id="school-name"
                            value={form.name}
                            className={fieldClass('name')}
                            onChange={(e) => set('name')(e.target.value)}
                            placeholder="Your school's name"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="institution-type">Institution Type</Label>
                        <Select
                            value={form.institutionType}
                            onValueChange={set('institutionType')}
                        >
                            <SelectTrigger id="institution-type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {INSTITUTION_TYPES.map((type) => (
                                    <SelectItem key={type} value={type}>
                                        {INSTITUTION_TYPE_LABELS[type]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="logo-url">Logo URL</Label>
                        <Input
                            id="logo-url"
                            value={form.logoUrl}
                            className={fieldClass('logoUrl')}
                            onChange={(e) => set('logoUrl')(e.target.value)}
                            placeholder="https://cdn.example.com/logo.png"
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="address">Address</Label>
                        <Textarea
                            id="address"
                            rows={2}
                            value={form.address}
                            onChange={(e) => set('address')(e.target.value)}
                            placeholder="123 Education Lane, Sector 15"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input
                            id="city"
                            value={form.city}
                            className={fieldClass('city')}
                            onChange={(e) => set('city')(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="state">State</Label>
                        <Input
                            id="state"
                            value={form.state}
                            className={fieldClass('state')}
                            onChange={(e) => set('state')(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="pincode">PIN Code</Label>
                        <Input
                            id="pincode"
                            value={form.pincode}
                            className={fieldClass('pincode')}
                            onChange={(e) => set('pincode')(e.target.value)}
                            placeholder="122001"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                            id="phone"
                            value={form.phone}
                            className={fieldClass('phone')}
                            onChange={(e) => set('phone')(e.target.value)}
                            placeholder="0124-4567890"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={form.email}
                            className={fieldClass('email')}
                            onChange={(e) => set('email')(e.target.value)}
                            placeholder="info@school.edu"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <Input
                            id="website"
                            value={form.website}
                            className={fieldClass('website')}
                            onChange={(e) => set('website')(e.target.value)}
                            placeholder="https://school.edu"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="affiliation-board">Affiliation Board</Label>
                        <Input
                            id="affiliation-board"
                            value={form.affiliationBoard}
                            className={fieldClass('affiliationBoard')}
                            onChange={(e) => set('affiliationBoard')(e.target.value)}
                            placeholder="CBSE"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="affiliation-number">Affiliation Number</Label>
                        <Input
                            id="affiliation-number"
                            value={form.affiliationNumber}
                            className={fieldClass('affiliationNumber')}
                            onChange={(e) => set('affiliationNumber')(e.target.value)}
                            placeholder="2130045"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="udise-code">UDISE Code</Label>
                        <Input
                            id="udise-code"
                            value={form.udiseCode}
                            className={fieldClass('udiseCode')}
                            onChange={(e) => set('udiseCode')(e.target.value)}
                            placeholder="06060100101"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t pt-6">
                    <Button variant="outline" onClick={handleReset} disabled={!isDirty || isPending}>
                        Discard changes
                    </Button>
                    <Button onClick={handleSave} disabled={!isDirty || isPending} className="gap-2">
                        <Save className="h-4 w-4" />
                        {isPending ? 'Saving…' : 'Save school profile'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
