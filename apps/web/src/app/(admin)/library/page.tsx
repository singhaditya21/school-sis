import Link from 'next/link';

import { Card, CardContent } from '@/components/ui/card';
import { requireAuth } from '@/lib/auth/middleware';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

import { getCatalogueStats, listCatalogue } from './actions';
import CatalogueManager from './catalogue-manager';

interface PageProps {
    searchParams: Promise<{ category?: string; q?: string; archived?: string }>;
}

export default async function LibraryPage({ searchParams }: PageProps) {
    const { session } = await requireAuth('library:read');
    const canWrite = hasPermission(session.role as UserRole, 'library:write');

    const params = await searchParams;
    const category = params.category || 'ALL';
    const query = params.q || '';
    const includeArchived = params.archived === '1';

    const [books, stats] = await Promise.all([
        listCatalogue({ category, q: query, includeArchived }),
        getCatalogueStats(),
    ]);

    const cards = [
        { label: 'Total Titles', value: String(stats.totalTitles), className: 'text-blue-600' },
        { label: 'Total Copies', value: String(stats.totalCopies), className: 'text-green-600' },
        { label: 'Available', value: String(stats.availableCopies), className: 'text-emerald-600' },
        { label: 'Issued Today', value: String(stats.issuedToday), className: 'text-purple-600' },
        { label: 'Overdue', value: String(stats.overdueBooks), className: 'text-red-600' },
        { label: 'Fines Pending', value: `₹${stats.finesPending}`, className: 'text-orange-600' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Library Management</h1>
                    <p className="text-muted-foreground mt-1">Manage book catalog, issues, and returns</p>
                </div>
                <div className="flex gap-3">
                    <Link href="/library/issue" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
                        📖 Issue Book
                    </Link>
                    <Link href="/library/history" className="px-4 py-2 border border-border rounded-lg hover:bg-muted">
                        📋 History
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {cards.map((card) => (
                    <Card key={card.label}>
                        <CardContent className="pt-4">
                            <div className="text-sm text-muted-foreground">{card.label}</div>
                            <div className={`text-2xl font-bold ${card.className}`}>{card.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <CatalogueManager
                books={books}
                category={category}
                query={query}
                includeArchived={includeArchived}
                canWrite={canWrite}
            />
        </div>
    );
}
