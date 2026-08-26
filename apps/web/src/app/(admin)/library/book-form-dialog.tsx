'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { BOOK_CATEGORIES_LIST, type CatalogueBookView } from './catalogue-constants';
import { createBook, updateBook } from './actions';

interface BookFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** null → create a new title; otherwise edit this one. */
    book: CatalogueBookView | null;
}

interface FormState {
    title: string;
    author: string;
    isbn: string;
    publisher: string;
    edition: string;
    year: string;
    category: string;
    subject: string;
    language: string;
    location: string;
    price: string;
    description: string;
    totalCopies: string;
}

const EMPTY: FormState = {
    title: '',
    author: '',
    isbn: '',
    publisher: '',
    edition: '',
    year: '',
    category: 'TEXTBOOK',
    subject: '',
    language: 'English',
    location: '',
    price: '',
    description: '',
    totalCopies: '1',
};

function toFormState(book: CatalogueBookView | null): FormState {
    if (!book) return { ...EMPTY };
    return {
        title: book.title ?? '',
        author: book.author ?? '',
        isbn: book.isbn ?? '',
        publisher: book.publisher ?? '',
        edition: book.edition ?? '',
        year: book.year === null || book.year === undefined ? '' : String(book.year),
        category: book.category ?? 'TEXTBOOK',
        subject: book.subject ?? '',
        language: book.language ?? 'English',
        location: book.location ?? '',
        price: book.price ?? '',
        description: book.description ?? '',
        totalCopies: String(book.totalCopies ?? 1),
    };
}

export default function BookFormDialog({ open, onOpenChange, book }: BookFormDialogProps) {
    const router = useRouter();
    const [form, setForm] = useState<FormState>(() => toFormState(book));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) setForm(toFormState(book));
    }, [open, book]);

    const set = (key: keyof FormState) => (value: string) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            const result = book ? await updateBook(book.id, form) : await createBook(form);
            if (result.success) {
                toast.success(book ? 'Book updated.' : 'Book added to the catalogue.');
                onOpenChange(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not save the book.');
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Could not save the book.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{book ? 'Edit book' : 'Add book'}</DialogTitle>
                    <DialogDescription>
                        {book
                            ? 'Stock changes re-derive available copies from the loan ledger — copies currently out stay out.'
                            : 'A new title starts with every copy available.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4" data-testid="book-form">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <Label htmlFor="book-title">Title *</Label>
                            <Input
                                id="book-title"
                                value={form.title}
                                onChange={(e) => set('title')(e.target.value)}
                                data-testid="book-title-input"
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor="book-author">Author *</Label>
                            <Input
                                id="book-author"
                                value={form.author}
                                onChange={(e) => set('author')(e.target.value)}
                                data-testid="book-author-input"
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor="book-isbn">ISBN</Label>
                            <Input
                                id="book-isbn"
                                value={form.isbn}
                                onChange={(e) => set('isbn')(e.target.value)}
                                data-testid="book-isbn-input"
                            />
                        </div>
                        <div>
                            <Label htmlFor="book-category">Category</Label>
                            <select
                                id="book-category"
                                value={form.category}
                                onChange={(e) => set('category')(e.target.value)}
                                className="w-full h-10 px-3 border rounded-md text-sm bg-white"
                                data-testid="book-category-input"
                            >
                                {BOOK_CATEGORIES_LIST.map((c) => (
                                    <option key={c} value={c}>
                                        {c.replace('_', ' ')}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="book-subject">Subject</Label>
                            <Input
                                id="book-subject"
                                value={form.subject}
                                onChange={(e) => set('subject')(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="book-publisher">Publisher</Label>
                            <Input
                                id="book-publisher"
                                value={form.publisher}
                                onChange={(e) => set('publisher')(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="book-edition">Edition</Label>
                            <Input
                                id="book-edition"
                                value={form.edition}
                                onChange={(e) => set('edition')(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="book-year">Year</Label>
                            <Input
                                id="book-year"
                                type="number"
                                value={form.year}
                                onChange={(e) => set('year')(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="book-language">Language</Label>
                            <Input
                                id="book-language"
                                value={form.language}
                                onChange={(e) => set('language')(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label htmlFor="book-location">Shelf location</Label>
                            <Input
                                id="book-location"
                                value={form.location}
                                onChange={(e) => set('location')(e.target.value)}
                                placeholder="e.g. Rack 3 / Shelf B"
                            />
                        </div>
                        <div>
                            <Label htmlFor="book-copies">Total copies *</Label>
                            <Input
                                id="book-copies"
                                type="number"
                                min={1}
                                value={form.totalCopies}
                                onChange={(e) => set('totalCopies')(e.target.value)}
                                data-testid="book-copies-input"
                                required
                            />
                            {book && book.onLoan > 0 && (
                                <p className="text-xs text-gray-500 mt-1">
                                    {book.onLoan} on loan — cannot go below {book.onLoan}.
                                </p>
                            )}
                        </div>
                        <div>
                            <Label htmlFor="book-price">Price (₹)</Label>
                            <Input
                                id="book-price"
                                value={form.price}
                                onChange={(e) => set('price')(e.target.value)}
                                placeholder="e.g. 450.00"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="book-description">Notes</Label>
                            <Textarea
                                id="book-description"
                                value={form.description}
                                onChange={(e) => set('description')(e.target.value)}
                                rows={3}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={saving}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving} data-testid="book-save-btn">
                            {saving ? 'Saving…' : book ? 'Save changes' : 'Add book'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
