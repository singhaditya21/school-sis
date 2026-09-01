'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { logoutAction } from '@/lib/actions/auth';
import type { ParentChild } from '@/app/(parent)/actions';

/**
 * The bar that sits at the top of every parent-portal page.
 *
 * It does two jobs the portal was missing: it lets a guardian with more than
 * one child say WHICH child a page is about (the choice lives in the `child`
 * query parameter, so it survives a refresh and can be shared), and it gives
 * every page a way to sign out.
 */
export function ParentTopBar({
    students,
    selectedId,
    loading = false,
}: {
    students: ParentChild[];
    selectedId: string | null;
    loading?: boolean;
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    function hrefForChild(studentId: string): string {
        const params = new URLSearchParams(searchParams.toString());
        params.set('child', studentId);
        return `${pathname}?${params.toString()}`;
    }

    const selected = students.find((s) => s.id === selectedId) ?? null;

    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                {loading ? (
                    <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
                ) : students.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No child is linked to your account yet.</p>
                ) : students.length === 1 && selected ? (
                    <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white">
                            {selected.name}
                        </span>
                        <span className="text-sm text-muted-foreground">
                            {selected.gradeName} · {selected.sectionName}
                        </span>
                    </div>
                ) : (
                    <nav
                        className="flex flex-wrap items-center gap-2"
                        aria-label="Choose a child"
                        data-testid="child-switcher"
                    >
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Viewing
                        </span>
                        {students.map((student) => {
                            const isSelected = student.id === selectedId;
                            return (
                                <Link
                                    key={student.id}
                                    href={hrefForChild(student.id)}
                                    replace
                                    scroll={false}
                                    aria-current={isSelected ? 'true' : undefined}
                                    data-testid="child-switcher-option"
                                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                                        isSelected
                                            ? 'border-slate-900 bg-slate-900 text-white'
                                            : 'border-border bg-card text-foreground hover:border-slate-400'
                                    }`}
                                >
                                    {student.name}
                                    <span
                                        className={`ml-2 text-xs font-normal ${
                                            isSelected ? 'text-slate-300' : 'text-muted-foreground'
                                        }`}
                                    >
                                        {student.gradeName} · {student.sectionName}
                                    </span>
                                </Link>
                            );
                        })}
                    </nav>
                )}
            </div>

            <form action={logoutAction} className="shrink-0">
                <button
                    type="submit"
                    data-testid="parent-sign-out"
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <LogOut className="h-4 w-4" />
                    Sign out
                </button>
            </form>
        </div>
    );
}
