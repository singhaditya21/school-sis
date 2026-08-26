'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CERTIFICATE_TYPES, certificateTypeLabel } from './_lib/labels';

interface CertificateFiltersProps {
    status: string;
    type: string;
    search: string;
}

export default function CertificateFilters({ status, type, search }: CertificateFiltersProps) {
    const router = useRouter();
    const [query, setQuery] = useState(search);

    function push(next: { type?: string; q?: string }) {
        const params = new URLSearchParams();
        if (status && status !== 'ALL') params.set('status', status);
        const nextType = next.type ?? type;
        if (nextType && nextType !== 'ALL') params.set('type', nextType);
        const nextQuery = next.q ?? query;
        if (nextQuery.trim()) params.set('q', nextQuery.trim());
        const qs = params.toString();
        router.push(qs ? `/certificates?${qs}` : '/certificates');
    }

    return (
        <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={e => { e.preventDefault(); push({}); }}
        >
            <select
                aria-label="Certificate type"
                value={type}
                onChange={e => push({ type: e.target.value })}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
                <option value="ALL">All types</option>
                {CERTIFICATE_TYPES.map(t => (
                    <option key={t} value={t}>{certificateTypeLabel(t)}</option>
                ))}
            </select>
            <Input
                aria-label="Search certificates"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Certificate number, student or admission no."
                className="w-72"
            />
            <Button type="submit" variant="outline">Search</Button>
            {(query || (type && type !== 'ALL')) && (
                <Button
                    type="button"
                    variant="ghost"
                    onClick={() => { setQuery(''); push({ type: 'ALL', q: '' }); }}
                >
                    Clear
                </Button>
            )}
        </form>
    );
}
