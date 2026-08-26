'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { deleteTemplate, setTemplateActive } from '../actions';
import { ChannelBadge } from '../ui';
import { MESSAGE_CHANNELS, CHANNEL_LABEL, type TemplateRow } from '../types';

export default function TemplatesClient({ templates }: { templates: TemplateRow[] }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [search, setSearch] = useState('');
    const [channelFilter, setChannelFilter] = useState<string>('ALL');
    const [showInactive, setShowInactive] = useState(true);
    // Two-step delete: the first click arms, the second commits. Avoids window.confirm.
    const [armedForDelete, setArmedForDelete] = useState<string | null>(null);

    const visible = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return templates.filter((template) => {
            if (channelFilter !== 'ALL' && template.channel !== channelFilter) return false;
            if (!showInactive && !template.isActive) return false;
            if (!needle) return true;
            return (
                template.name.toLowerCase().includes(needle) ||
                template.body.toLowerCase().includes(needle) ||
                (template.subject || '').toLowerCase().includes(needle)
            );
        });
    }, [templates, search, channelFilter, showInactive]);

    function toggleActive(template: TemplateRow) {
        startTransition(async () => {
            const result = await setTemplateActive(template.id, !template.isActive);
            if (result.success) {
                toast.success(
                    template.isActive ? `"${template.name}" deactivated` : `"${template.name}" activated`,
                );
                router.refresh();
            } else {
                toast.error(result.error || 'Could not update the template.');
            }
        });
    }

    function removeTemplate(template: TemplateRow) {
        if (armedForDelete !== template.id) {
            setArmedForDelete(template.id);
            return;
        }
        startTransition(async () => {
            const result = await deleteTemplate(template.id);
            if (result.success) {
                toast.success(`"${template.name}" deleted`);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not delete the template.');
            }
            setArmedForDelete(null);
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label htmlFor="template-search" className="mb-1 block text-xs font-medium text-slate-600">
                            Search
                        </label>
                        <Input
                            id="template-search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Name or body text"
                            className="w-64"
                        />
                    </div>
                    <div>
                        <label htmlFor="template-channel" className="mb-1 block text-xs font-medium text-slate-600">
                            Channel
                        </label>
                        <select
                            id="template-channel"
                            value={channelFilter}
                            onChange={(event) => setChannelFilter(event.target.value)}
                            className="h-9 rounded-md border border-slate-300 px-3 text-sm"
                        >
                            <option value="ALL">All channels</option>
                            {MESSAGE_CHANNELS.map((channel) => (
                                <option key={channel} value={channel}>
                                    {CHANNEL_LABEL[channel]}
                                </option>
                            ))}
                        </select>
                    </div>
                    <label className="flex h-9 items-center gap-2 text-sm text-slate-600">
                        <input
                            type="checkbox"
                            checked={showInactive}
                            onChange={(event) => setShowInactive(event.target.checked)}
                            className="h-4 w-4"
                        />
                        Show inactive
                    </label>
                </div>

                <Link
                    href="/messages/templates/new"
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                >
                    New template
                </Link>
            </div>

            {templates.length === 0 ? (
                <Card>
                    <CardContent className="py-16 text-center">
                        <p className="text-slate-600">No message templates yet.</p>
                        <p className="mt-1 text-sm text-slate-400">
                            Create one so recurring notices — fee reminders, absence alerts, PTM
                            invitations — do not have to be retyped.
                        </p>
                        <Link
                            href="/messages/templates/new"
                            className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                        >
                            Create the first template
                        </Link>
                    </CardContent>
                </Card>
            ) : visible.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-slate-500">
                        No templates match those filters.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {visible.map((template) => (
                        <Card
                            key={template.id}
                            className={template.isActive ? '' : 'border-dashed opacity-70'}
                        >
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-start justify-between gap-2 text-lg">
                                    <span className="leading-tight">{template.name}</span>
                                    <ChannelBadge channel={template.channel} />
                                </CardTitle>
                                {template.subject && (
                                    <p className="mt-1 text-sm font-medium text-slate-500">
                                        Subject: {template.subject}
                                    </p>
                                )}
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="line-clamp-5 whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
                                    {template.body}
                                </p>

                                {template.variables.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {template.variables.map((variable) => (
                                            <Badge
                                                key={variable}
                                                variant="secondary"
                                                className="bg-blue-50 font-mono text-[10px] text-blue-700"
                                            >
                                                {`{{${variable}}}`}
                                            </Badge>
                                        ))}
                                    </div>
                                )}

                                <div className="flex items-center justify-between text-xs text-slate-500">
                                    <span>
                                        {template.usageCount === 0
                                            ? 'Never used'
                                            : `Used in ${template.usageCount} batch${
                                                  template.usageCount === 1 ? '' : 'es'
                                              }`}
                                    </span>
                                    <span>{template.isActive ? 'Active' : 'Inactive'}</span>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Link
                                        href={`/messages/compose?templateId=${template.id}`}
                                        className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"
                                    >
                                        Use in compose
                                    </Link>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={pending}
                                        onClick={() => toggleActive(template)}
                                    >
                                        {template.isActive ? 'Deactivate' : 'Activate'}
                                    </Button>
                                    {template.usageCount === 0 && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={pending}
                                            className="text-rose-600 hover:bg-rose-50"
                                            onClick={() => removeTemplate(template)}
                                        >
                                            {armedForDelete === template.id ? 'Confirm delete' : 'Delete'}
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
