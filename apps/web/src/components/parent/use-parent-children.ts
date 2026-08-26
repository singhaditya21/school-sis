'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getMyChildren, type ParentChild } from '@/app/(parent)/actions';

export interface ParentChildrenState {
    students: ParentChild[];
    selected: ParentChild | null;
    selectedId: string | null;
    loading: boolean;
    error: string | null;
}

/**
 * Loads the signed-in guardian's children and resolves which one the page is
 * about. A `child` query parameter that is not one of this guardian's children
 * is ignored rather than trusted — the selection can only ever land on a child
 * the server already confirmed belongs to this account.
 */
export function useParentChildren(): ParentChildrenState {
    const searchParams = useSearchParams();
    const requestedId = searchParams.get('child');

    const [students, setStudents] = useState<ParentChild[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        getMyChildren()
            .then((rows) => {
                if (cancelled) return;
                setStudents(rows);
                setError(null);
            })
            .catch(() => {
                if (cancelled) return;
                setError('Could not load your children. Please refresh the page.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const selected =
        students.find((s) => s.id === requestedId) ?? students[0] ?? null;

    return {
        students,
        selected,
        selectedId: selected?.id ?? null,
        loading,
        error,
    };
}
