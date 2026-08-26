'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface DocumentFiltersProps {
    verification: string;
    documentType: string;
    search: string;
    knownTypes: string[];
}

export default function DocumentFilters({
    verification,
    documentType,
    search,
    knownTypes,
}: DocumentFiltersProps) {
    const router = useRouter();
    const [query, setQuery] = useState(search);

    function push(next: { type?: string; q?: string }) {
        const params = new URLSearchParams();
        if (verification && verification !== 'ALL') params.set('verification', verification);
        const nextType = next.type ?? documentType;
        if (nextType && nextType !== 'ALL') params.set('type', nextType);
        const nextQuery = next.q ?? query;
        if (nextQuery.trim()) params.set('q', nextQuery.trim());
        const qs = params.toString();
        router.push(qs ? `/documents?${qs}` : '/documents');
    }

    return (
        <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={e => { e.preventDefault(); push({}); }}
        >
            <select
                aria-label="Document type"
                value={documentType}
                onChange={e => push({ type: e.target.value })}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={knownTypes.length === 0}
            >
                <option value="ALL">All document types</option>
                {knownTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                ))}
            </select>
            <Input
                aria-label="Search documents"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="File name, student or admission no."
                className="w-72"
            />
            <Button type="submit" variant="outline">Search</Button>
            {(query || (documentType && documentType !== 'ALL')) && (
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
