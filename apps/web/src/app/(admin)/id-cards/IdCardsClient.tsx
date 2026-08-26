'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { setIdCardStatusAction } from './_lib/actions';
import type { CardSchool, IdCardItem } from './_lib/actions';
import { ID_CARD_STATUS_LABELS, idCardStatusClass } from './_lib/labels';

/**
 * Isolates the card grid when the browser prints, so the admin chrome around it
 * does not end up on the sheet.
 */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #id-card-print-area, #id-card-print-area * { visibility: visible !important; }
  #id-card-print-area {
    position: absolute; left: 0; top: 0; width: 100%;
  }
  .id-card-wrapper { border-color: transparent !important; background: transparent !important; }
  .id-card-meta { display: none !important; }
}
`;

interface IdCardsClientProps {
    cards: IdCardItem[];
    school: CardSchool;
}

function initials(name: string): string {
    return name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase() ?? '')
        .join('');
}

export default function IdCardsClient({ cards, school }: IdCardsClientProps) {
    const router = useRouter();
    const [selected, setSelected] = useState<string[]>([]);
    const [pending, setPending] = useState(false);

    const allSelected = cards.length > 0 && selected.length === cards.length;

    function toggle(id: string) {
        setSelected(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));
    }

    async function mark(status: 'PRINTED' | 'ISSUED') {
        setPending(true);
        try {
            const result = await setIdCardStatusAction({ cardIds: selected, status });
            if (!result.success) {
                toast.error(result.error ?? 'Could not update the cards.');
                return;
            }
            const updated = result.updated ?? 0;
            toast.success(
                updated === 0
                    ? 'Nothing to change — those cards were already at that stage.'
                    : `${updated} card${updated === 1 ? '' : 's'} marked ${status === 'PRINTED' ? 'printed' : 'handed over'}`
            );
            setSelected([]);
            router.refresh();
        } catch {
            toast.error('Something went wrong. Please try again.');
        } finally {
            setPending(false);
        }
    }

    if (cards.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center text-gray-500">
                    No ID cards match this view. Use &ldquo;Generate cards&rdquo; to create them.
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <style>{PRINT_CSS}</style>

            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected(allSelected ? [] : cards.map(c => c.id))}
                >
                    {allSelected ? 'Deselect all' : `Select all (${cards.length})`}
                </Button>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => window.print()}>
                        Print this sheet
                    </Button>
                    <Button
                        variant="outline"
                        disabled={selected.length === 0 || pending}
                        onClick={() => mark('PRINTED')}
                    >
                        Mark printed ({selected.length})
                    </Button>
                    <Button
                        disabled={selected.length === 0 || pending}
                        onClick={() => mark('ISSUED')}
                    >
                        Mark handed over ({selected.length})
                    </Button>
                </div>
            </div>

            <div
                id="id-card-print-area"
                className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
                {cards.map(card => (
                    <div
                        key={card.id}
                        className={`id-card-wrapper rounded-lg border-2 p-3 transition-colors ${
                            selected.includes(card.id)
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200'
                        }`}
                    >
                        <label className="id-card-meta mb-2 flex cursor-pointer items-center gap-2 text-sm print:hidden">
                            <input
                                type="checkbox"
                                checked={selected.includes(card.id)}
                                onChange={() => toggle(card.id)}
                                className="h-4 w-4"
                            />
                            <span className="text-gray-600">Select for batch action</span>
                        </label>

                        <div className="rounded-lg border border-gray-300 bg-white p-4 text-gray-900">
                            <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                                {school.logoUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- logo_url may point at any host; next/image would need every one allow-listed
                                    <img
                                        src={school.logoUrl}
                                        alt=""
                                        className="h-7 w-7 rounded object-contain"
                                    />
                                ) : null}
                                <div className="min-w-0">
                                    <div className="truncate text-sm font-bold leading-tight">
                                        {school.name}
                                    </div>
                                    {school.city && (
                                        <div className="truncate text-[10px] text-gray-500">{school.city}</div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-3 flex gap-3">
                                <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-gray-300 bg-gray-100 text-sm font-semibold text-gray-500">
                                    {card.photoUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- photo_url may point at any host; next/image would need every one allow-listed
                                        <img
                                            src={card.photoUrl}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        initials(card.name)
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-bold leading-tight">{card.name}</div>
                                    {card.subtitle && (
                                        <div className="truncate text-xs text-gray-600">{card.subtitle}</div>
                                    )}
                                    <dl className="mt-1.5 space-y-0.5 text-[11px] text-gray-700">
                                        {card.identifier && (
                                            <div className="flex gap-1">
                                                <dt className="text-gray-500">ID</dt>
                                                <dd className="font-mono">{card.identifier}</dd>
                                            </div>
                                        )}
                                        {card.bloodGroup && (
                                            <div className="flex gap-1">
                                                <dt className="text-gray-500">Blood</dt>
                                                <dd>{card.bloodGroup}</dd>
                                            </div>
                                        )}
                                        <div className="flex gap-1">
                                            <dt className="text-gray-500">Valid</dt>
                                            <dd>
                                                {card.validFrom} → {card.validTo}
                                            </dd>
                                        </div>
                                    </dl>
                                </div>
                                <div className="shrink-0 text-center">
                                    {card.qrImage ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- a data: URL generated on the server, not a remote asset
                                        <img
                                            src={card.qrImage}
                                            alt={`QR code for ${card.qrCode}`}
                                            className="h-14 w-14"
                                        />
                                    ) : (
                                        <div className="flex h-14 w-14 items-center justify-center rounded border border-dashed border-gray-300 p-1 text-[8px] leading-tight text-gray-400">
                                            No card code
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="id-card-meta mt-2 flex items-center justify-between print:hidden">
                            <Badge className={idCardStatusClass(card.status)}>
                                {ID_CARD_STATUS_LABELS[card.status] ?? card.status}
                            </Badge>
                            {!card.qrCode && (
                                <span className="text-[11px] text-amber-700">
                                    No employee ID on file, so no scannable code
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
