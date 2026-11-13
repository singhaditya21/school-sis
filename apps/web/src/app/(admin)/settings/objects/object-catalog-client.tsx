'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Database, ExternalLink, Search, Sliders } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
    toggleTenantObjectEnabled,
    type TenantCatalogObjectItem,
} from '@/lib/actions/lcnc-platform';

export function ObjectCatalogClient({
    initialObjects,
    canPublish,
}: {
    initialObjects: TenantCatalogObjectItem[];
    canPublish: boolean;
}) {
    const router = useRouter();
    const [objects, setObjects] = useState<TenantCatalogObjectItem[]>(initialObjects);
    const [filter, setFilter] = useState<'ALL' | 'SYSTEM' | 'CUSTOM'>('ALL');
    const [query, setQuery] = useState('');
    const [isPending, startTransition] = useTransition();

    const systemCount = objects.filter(o => !o.isCustom).length;
    const customCount = objects.filter(o => o.isCustom).length;

    const filtered = objects.filter(obj => {
        if (filter === 'SYSTEM' && obj.isCustom) return false;
        if (filter === 'CUSTOM' && !obj.isCustom) return false;
        if (query.trim()) {
            const q = query.trim().toLowerCase();
            return (
                obj.name.toLowerCase().includes(q) ||
                obj.apiName.toLowerCase().includes(q) ||
                (obj.description || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    const handleToggle = (obj: TenantCatalogObjectItem, nextEnabled: boolean) => {
        if (!canPublish) {
            toast.error('Your role does not have metadata:publish permission.');
            return;
        }
        setObjects(prev =>
            prev.map(item =>
                item.apiName === obj.apiName ? { ...item, isEnabled: nextEnabled } : item,
            ),
        );
        startTransition(async () => {
            const res = await toggleTenantObjectEnabled(obj.apiName, nextEnabled);
            if (!res.success) {
                setObjects(prev =>
                    prev.map(item =>
                        item.apiName === obj.apiName
                            ? { ...item, isEnabled: !nextEnabled }
                            : item,
                    ),
                );
                toast.error(res.error || 'Failed to update object status.');
                return;
            }
            toast.success(
                `${obj.name} ${nextEnabled ? 'enabled' : 'disabled'} for this school workspace.`,
            );
            router.refresh();
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-border bg-card p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setFilter('ALL')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                            filter === 'ALL'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        All Objects ({objects.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilter('SYSTEM')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                            filter === 'SYSTEM'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        System Objects ({systemCount})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilter('CUSTOM')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                            filter === 'CUSTOM'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        Custom &amp; Blueprint ({customCount})
                    </button>
                </div>

                <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search objects or API name..."
                        className="pl-9 h-9 text-sm"
                    />
                </div>
            </div>

            {filtered.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Database className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                        <p className="font-medium text-foreground">No matching objects found.</p>
                        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                            Try clearing your search filter, enabling a System Object, or creating a
                            new Custom Object above.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filtered.map(obj => (
                        <Card
                            key={obj.id}
                            className={`transition-all h-full ${
                                obj.isEnabled
                                    ? 'hover:border-primary/50 hover:shadow-sm'
                                    : 'opacity-70 bg-muted/40'
                            }`}
                        >
                            <CardContent className="p-5 flex flex-col h-full">
                                <div className="flex justify-between items-start mb-3 gap-3">
                                    <div className="space-y-1">
                                        <Link
                                            href={`/settings/objects/${obj.id}`}
                                            className="font-bold text-base text-foreground hover:text-primary hover:underline"
                                        >
                                            {obj.name}
                                        </Link>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {obj.isTenantDefinedEav ? (
                                                <Badge
                                                    variant="outline"
                                                    className="bg-success-subtle text-success border-success/30 text-xs"
                                                >
                                                    Custom (EAV)
                                                </Badge>
                                            ) : (
                                                <Badge
                                                    variant="outline"
                                                    className="bg-accent text-primary border-primary/20 text-xs"
                                                >
                                                    System Object
                                                </Badge>
                                            )}
                                            {!obj.isEnabled && (
                                                <Badge variant="secondary" className="text-xs">
                                                    Disabled
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs text-muted-foreground">
                                            {obj.isEnabled ? 'Active' : 'Off'}
                                        </span>
                                        <Switch
                                            checked={obj.isEnabled}
                                            disabled={!canPublish || isPending}
                                            onCheckedChange={checked => handleToggle(obj, checked)}
                                            aria-label={`Toggle ${obj.name}`}
                                        />
                                    </div>
                                </div>

                                <p className="text-xs text-muted-foreground flex-grow">
                                    {obj.description || 'Configurable data model for your campus.'}
                                </p>

                                <div className="mt-4 pt-3.5 border-t border-border space-y-2">
                                    <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                                        <span>API: {obj.apiName}</span>
                                        <span>
                                            {obj.recordCount.toLocaleString('en-IN')}{' '}
                                            {obj.recordCount === 1 ? 'record' : 'records'}
                                        </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {obj.totalFields} {obj.totalFields === 1 ? 'field' : 'fields'}
                                        {obj.customFields > 0
                                            ? ` · ${obj.customFields} tenant custom`
                                            : ''}
                                    </div>
                                    <div className="flex items-center justify-between pt-1.5 text-xs font-medium">
                                        <Link
                                            href={`/settings/objects/${obj.id}`}
                                            className="inline-flex items-center gap-1 text-primary hover:underline"
                                        >
                                            <Sliders className="w-3.5 h-3.5" />
                                            Fields, Forms &amp; Home
                                        </Link>
                                        {obj.isEnabled ? (
                                            <Link
                                                href={`/app/${obj.apiName}`}
                                                className="inline-flex items-center gap-1 text-primary hover:underline"
                                            >
                                                Object Home
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </Link>
                                        ) : (
                                            <span className="text-muted-foreground">
                                                Enable to open
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
