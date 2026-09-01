'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';

import { setBookArchived } from './actions';
import BookFormDialog from './book-form-dialog';
import {
    BOOK_CATEGORIES_LIST,
    CATEGORY_BADGE_CLASSES,
    type CatalogueBookView,
} from './catalogue-constants';

interface CatalogueManagerProps {
    books: CatalogueBookView[];
    category: string;
    query: string;
    includeArchived: boolean;
    canWrite: boolean;
}

export default function CatalogueManager({
    books,
    category,
    query,
    includeArchived,
    canWrite,
}: CatalogueManagerProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [searchValue, setSearchValue] = useState(query);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<CatalogueBookView | null>(null);
    const [archiveTarget, setArchiveTarget] = useState<CatalogueBookView | null>(null);
    const [archiveBusy, setArchiveBusy] = useState(false);

    const applyFilters = (next: { q?: string; category?: string; archived?: boolean }) => {
        const params = new URLSearchParams();
        const q = next.q !== undefined ? next.q : searchValue;
        const cat = next.category !== undefined ? next.category : category;
        const arch = next.archived !== undefined ? next.archived : includeArchived;

        if (q.trim()) params.set('q', q.trim());
        if (cat && cat !== 'ALL') params.set('category', cat);
        if (arch) params.set('archived', '1');

        const qs = params.toString();
        startTransition(() => router.push(qs ? `/library?${qs}` : '/library'));
    };

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const openEdit = (book: CatalogueBookView) => {
        setEditing(book);
        setFormOpen(true);
    };

    const confirmArchive = async () => {
        if (!archiveTarget) return;
        setArchiveBusy(true);
        try {
            const result = await setBookArchived(archiveTarget.id, archiveTarget.isActive);
            if (result.success) {
                toast.success(archiveTarget.isActive ? 'Book archived.' : 'Book restored.');
                setArchiveTarget(null);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not update the book.');
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Could not update the book.');
        } finally {
            setArchiveBusy(false);
        }
    };

    return (
        <>
            <Card>
                <CardContent className="p-4 space-y-4">
                    <div className="flex flex-wrap gap-3 items-end justify-between">
                        <form
                            className="flex gap-2 flex-1 min-w-[260px] max-w-lg"
                            onSubmit={(e) => {
                                e.preventDefault();
                                applyFilters({ q: searchValue });
                            }}
                        >
                            <input
                                type="text"
                                name="q"
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                                placeholder="Search title, author, ISBN or publisher..."
                                className="flex-1 px-4 py-2 border rounded-lg text-sm"
                                data-testid="catalogue-search-input"
                            />
                            <Button type="submit" disabled={isPending} data-testid="catalogue-search-btn">
                                Search
                            </Button>
                        </form>

                        <div className="flex flex-wrap gap-3 items-center">
                            <select
                                value={category}
                                onChange={(e) => applyFilters({ category: e.target.value })}
                                className="h-10 px-3 border rounded-lg text-sm bg-card"
                                data-testid="catalogue-category-filter"
                            >
                                <option value="ALL">All categories</option>
                                {BOOK_CATEGORIES_LIST.map((c) => (
                                    <option key={c} value={c}>
                                        {c.replace('_', ' ')}
                                    </option>
                                ))}
                            </select>

                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <input
                                    type="checkbox"
                                    checked={includeArchived}
                                    onChange={(e) => applyFilters({ archived: e.target.checked })}
                                    data-testid="catalogue-archived-toggle"
                                />
                                Show archived
                            </label>

                            {canWrite && (
                                <Button onClick={openCreate} data-testid="catalogue-add-btn">
                                    + Add Book
                                </Button>
                            )}
                        </div>
                    </div>

                    {(query || (category && category !== 'ALL') || includeArchived) && (
                        <div className="text-xs text-muted-foreground">
                            Showing {books.length} title{books.length === 1 ? '' : 's'}
                            {query && <> matching “{query}”</>}
                            {category && category !== 'ALL' && <> in {category.replace('_', ' ')}</>}
                            {includeArchived && <> (archived included)</>}.{' '}
                            <button
                                type="button"
                                className="text-primary hover:underline"
                                onClick={() => {
                                    setSearchValue('');
                                    applyFilters({ q: '', category: 'ALL', archived: false });
                                }}
                            >
                                Clear filters
                            </button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted">
                            <TableRow>
                                <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Title</TableHead>
                                <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Author</TableHead>
                                <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">ISBN</TableHead>
                                <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Category</TableHead>
                                <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Location</TableHead>
                                <TableHead className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Available</TableHead>
                                {canWrite && (
                                    <TableHead className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</TableHead>
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {books.map((book) => (
                                <TableRow key={book.id} className={book.isActive ? '' : 'opacity-60'}>
                                    <TableCell className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-14 bg-gradient-to-br from-blue-100 to-purple-100 rounded flex items-center justify-center text-lg">
                                                📚
                                            </div>
                                            <div>
                                                <div className="font-medium flex items-center gap-2">
                                                    {book.title}
                                                    {!book.isActive && (
                                                        <Badge variant="outline" className="border-transparent bg-gray-200 text-muted-foreground">
                                                            Archived
                                                        </Badge>
                                                    )}
                                                </div>
                                                {book.publisher && (
                                                    <div className="text-xs text-muted-foreground">
                                                        {book.publisher} {book.edition && `· ${book.edition}`}
                                                    </div>
                                                )}
                                                {book.price && (
                                                    <div className="text-xs text-muted-foreground">
                                                        {formatCurrency(Number(book.price))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-sm">{book.author}</TableCell>
                                    <TableCell className="px-4 py-3 text-sm font-mono text-muted-foreground">{book.isbn || '—'}</TableCell>
                                    <TableCell className="px-4 py-3">
                                        <Badge
                                            variant="outline"
                                            className={`border-transparent ${CATEGORY_BADGE_CLASSES[book.category] || 'bg-muted text-foreground'}`}
                                        >
                                            {book.category}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{book.location || '—'}</TableCell>
                                    <TableCell className="px-4 py-3 text-center">
                                        <span className={`font-semibold ${book.availableCopies > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {book.availableCopies}/{book.totalCopies}
                                        </span>
                                        {book.onLoan > 0 && (
                                            <div className="text-xs text-muted-foreground">{book.onLoan} on loan</div>
                                        )}
                                    </TableCell>
                                    {canWrite && (
                                        <TableCell className="px-4 py-3 text-right whitespace-nowrap">
                                            <button
                                                type="button"
                                                onClick={() => openEdit(book)}
                                                className="text-primary hover:underline text-sm mr-3"
                                                data-testid="catalogue-edit-btn"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setArchiveTarget(book)}
                                                className="text-muted-foreground hover:underline text-sm"
                                                data-testid="catalogue-archive-btn"
                                            >
                                                {book.isActive ? 'Archive' : 'Restore'}
                                            </button>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                            {books.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={canWrite ? 7 : 6} className="px-4 py-12 text-center text-muted-foreground">
                                        {query || (category && category !== 'ALL')
                                            ? 'No books match these filters.'
                                            : 'No books in the catalogue. Add your first book to get started.'}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {canWrite && (
                <BookFormDialog open={formOpen} onOpenChange={setFormOpen} book={editing} />
            )}

            <Dialog open={archiveTarget !== null} onOpenChange={(open) => !open && setArchiveTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {archiveTarget?.isActive ? 'Archive this title?' : 'Restore this title?'}
                        </DialogTitle>
                        <DialogDescription>
                            {archiveTarget?.isActive
                                ? 'Archived titles disappear from the issue desk but their borrowing history is kept.'
                                : 'The title becomes issuable again.'}
                        </DialogDescription>
                    </DialogHeader>
                    <p className="text-sm font-medium">{archiveTarget?.title}</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setArchiveTarget(null)} disabled={archiveBusy}>
                            Cancel
                        </Button>
                        <Button onClick={confirmArchive} disabled={archiveBusy} data-testid="catalogue-archive-confirm">
                            {archiveBusy ? 'Working…' : archiveTarget?.isActive ? 'Archive' : 'Restore'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
