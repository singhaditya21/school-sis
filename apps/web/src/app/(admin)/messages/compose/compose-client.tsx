'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { queueMessageBatch } from '../actions';
import {
    CHANNEL_LABEL,
    MESSAGE_CHANNELS,
    applyTemplateVariables,
    extractTemplateVariables,
    recipientValueFor,
    type ChannelAvailability,
    type GradeOption,
    type MessageChannel,
    type RecipientOption,
    type TemplateRow,
} from '../types';

const SMS_SEGMENT = 160;

type Props = {
    availability: ChannelAvailability[];
    templates: TemplateRow[];
    grades: GradeOption[];
    recipients: RecipientOption[];
    initialTemplateId: string | null;
};

export default function ComposeClient({
    availability,
    templates,
    grades,
    recipients,
    initialTemplateId,
}: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const initialTemplate = templates.find((t) => t.id === initialTemplateId) ?? null;

    const [templateId, setTemplateId] = useState<string>(initialTemplate?.id ?? '');
    const [channel, setChannel] = useState<MessageChannel>(initialTemplate?.channel ?? 'SMS');
    const [subject, setSubject] = useState(initialTemplate?.subject ?? '');
    const [body, setBody] = useState(initialTemplate?.body ?? '');
    const [variableValues, setVariableValues] = useState<Record<string, string>>({});
    const [gradeFilter, setGradeFilter] = useState<string>('ALL');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [manualRecipients, setManualRecipients] = useState('');
    const [lastResult, setLastResult] = useState<{ queued: number; rejected: number } | null>(null);

    const providerFor = useMemo(
        () => new Map(availability.map((entry) => [entry.channel, entry])),
        [availability],
    );
    const selectedProvider = providerFor.get(channel);
    const channelUsable = Boolean(selectedProvider?.configured);

    const variables = useMemo(() => extractTemplateVariables(`${subject} ${body}`), [subject, body]);

    const resolvedSubject = applyTemplateVariables(subject, variableValues);
    const resolvedBody = applyTemplateVariables(body, variableValues);
    const unresolved = extractTemplateVariables(`${resolvedSubject} ${resolvedBody}`);

    // Recipients whose contact field matches the chosen channel.
    const reachable = useMemo(
        () =>
            recipients
                .filter((option) => Boolean(recipientValueFor(option, channel)))
                .filter((option) => gradeFilter === 'ALL' || option.gradeId === gradeFilter),
        [recipients, channel, gradeFilter],
    );

    // A selection only counts while the recipient is still reachable on the current
    // channel/filter. Derived rather than synced, so switching channel silently drops
    // guardians who have no address for it instead of queueing a blank recipient.
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const activeSelection = useMemo(
        () => reachable.filter((option) => selectedSet.has(option.id)),
        [reachable, selectedSet],
    );

    const manualList = useMemo(
        () =>
            manualRecipients
                .split(/[\n,;]+/)
                .map((entry) => entry.trim())
                .filter(Boolean),
        [manualRecipients],
    );

    const finalRecipients = useMemo(() => {
        const fromDirectory = activeSelection
            .map((option) => recipientValueFor(option, channel))
            .filter((value): value is string => Boolean(value));
        return [...new Set([...fromDirectory, ...manualList])];
    }, [activeSelection, channel, manualList]);

    function applyTemplate(id: string) {
        setTemplateId(id);
        const template = templates.find((t) => t.id === id);
        if (!template) return;
        setChannel(template.channel);
        setSubject(template.subject ?? '');
        setBody(template.body);
        setVariableValues({});
    }

    function toggleRecipient(id: string) {
        setSelectedIds((current) =>
            current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
        );
    }

    function queue() {
        startTransition(async () => {
            const result = await queueMessageBatch({
                channel,
                recipients: finalRecipients,
                subject: resolvedSubject,
                body: resolvedBody,
                templateId: templateId || undefined,
            });

            if (result.success) {
                setLastResult({ queued: result.queued, rejected: result.rejected });
                toast.success(
                    `${result.queued} recipient(s) placed in the outbox. Nothing has been delivered yet.`,
                );
                if (result.error) toast.warning(result.error);
                setSelectedIds([]);
                setManualRecipients('');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not queue this message.');
            }
        });
    }

    const segments = Math.max(1, Math.ceil(resolvedBody.length / SMS_SEGMENT));
    const canQueue =
        channelUsable &&
        !pending &&
        finalRecipients.length > 0 &&
        resolvedBody.trim().length > 0 &&
        (channel !== 'EMAIL' || resolvedSubject.trim().length > 0);

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Message</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <Label htmlFor="compose-channel">Channel</Label>
                                <select
                                    id="compose-channel"
                                    value={channel}
                                    onChange={(event) => setChannel(event.target.value as MessageChannel)}
                                    className="mt-1 h-9 w-full rounded-md border border-border px-3 text-sm"
                                >
                                    {MESSAGE_CHANNELS.map((option) => {
                                        const entry = providerFor.get(option);
                                        return (
                                            <option key={option} value={option}>
                                                {CHANNEL_LABEL[option]}
                                                {entry?.configured ? '' : ' — no provider configured'}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            <div>
                                <Label htmlFor="compose-template">Template</Label>
                                <select
                                    id="compose-template"
                                    value={templateId}
                                    onChange={(event) => applyTemplate(event.target.value)}
                                    className="mt-1 h-9 w-full rounded-md border border-border px-3 text-sm"
                                >
                                    <option value="">Write from scratch</option>
                                    {templates.map((template) => (
                                        <option key={template.id} value={template.id}>
                                            {template.name} ({CHANNEL_LABEL[template.channel]})
                                        </option>
                                    ))}
                                </select>
                                {templates.length === 0 && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        No active templates.{' '}
                                        <Link href="/messages/templates/new" className="text-blue-600 underline">
                                            Create one
                                        </Link>
                                        .
                                    </p>
                                )}
                            </div>
                        </div>

                        {!channelUsable && (
                            <p className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
                                {selectedProvider?.reason ??
                                    `No ${CHANNEL_LABEL[channel]} provider is configured for this deployment.`}{' '}
                                Queueing is disabled for this channel — the outbox would refuse every
                                recipient.
                            </p>
                        )}

                        {channel === 'EMAIL' && (
                            <div>
                                <Label htmlFor="compose-subject">Subject</Label>
                                <Input
                                    id="compose-subject"
                                    value={subject}
                                    onChange={(event) => setSubject(event.target.value)}
                                    placeholder="Parent-teacher meeting on {{date}}"
                                />
                            </div>
                        )}

                        <div>
                            <Label htmlFor="compose-body">Body</Label>
                            <Textarea
                                id="compose-body"
                                rows={8}
                                value={body}
                                onChange={(event) => setBody(event.target.value)}
                                placeholder="Type the message. Use {{token}} for values you want to fill in below."
                            />
                            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                                <span>{finalRecipients.length} recipient(s) selected</span>
                                <span>
                                    {resolvedBody.length} chars
                                    {channel === 'SMS' ? ` · ${segments} SMS segment(s)` : ''}
                                </span>
                            </div>
                        </div>

                        {variables.length > 0 && (
                            <div className="rounded-md border bg-muted p-3">
                                <p className="mb-2 text-sm font-medium text-foreground">
                                    Placeholder values
                                </p>
                                <p className="mb-3 text-xs text-muted-foreground">
                                    One value is used for the whole batch. Per-recipient personalisation
                                    from student records is not available in this release.
                                </p>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {variables.map((variable) => (
                                        <div key={variable}>
                                            <Label
                                                htmlFor={`var-${variable}`}
                                                className="font-mono text-xs"
                                            >{`{{${variable}}}`}</Label>
                                            <Input
                                                id={`var-${variable}`}
                                                value={variableValues[variable] ?? ''}
                                                onChange={(event) =>
                                                    setVariableValues((current) => ({
                                                        ...current,
                                                        [variable]: event.target.value,
                                                    }))
                                                }
                                            />
                                        </div>
                                    ))}
                                </div>
                                {unresolved.length > 0 && (
                                    <p className="mt-3 text-xs text-amber-700">
                                        {unresolved.length} placeholder(s) still have no value and will be
                                        sent literally as written.
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Recipients</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <Label htmlFor="compose-grade">Filter by grade</Label>
                                <select
                                    id="compose-grade"
                                    value={gradeFilter}
                                    onChange={(event) => setGradeFilter(event.target.value)}
                                    className="mt-1 h-9 rounded-md border border-border px-3 text-sm"
                                >
                                    <option value="ALL">All grades</option>
                                    {grades.map((grade) => (
                                        <option key={grade.id} value={grade.id}>
                                            {grade.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedIds(reachable.map((option) => option.id))}
                                disabled={reachable.length === 0}
                            >
                                Select all {reachable.length}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedIds([])}
                                disabled={activeSelection.length === 0}
                            >
                                Clear
                            </Button>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            Primary guardians of active students who have{' '}
                            {channel === 'EMAIL' ? 'an email address' : 'a phone number'} on record.
                        </p>

                        <div className="max-h-72 overflow-y-auto rounded-md border">
                            {reachable.length === 0 ? (
                                <p className="p-6 text-center text-sm text-muted-foreground">
                                    No guardian on record has{' '}
                                    {channel === 'EMAIL' ? 'an email address' : 'a phone number'} for this
                                    filter. Add contacts on the student record, or type addresses below.
                                </p>
                            ) : (
                                <ul className="divide-y">
                                    {reachable.map((option) => (
                                        <li key={option.id}>
                                            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted">
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4"
                                                                    checked={selectedSet.has(option.id)}
                                                    onChange={() => toggleRecipient(option.id)}
                                                />
                                                <span className="flex-1">
                                                    <span className="block text-sm font-medium text-foreground">
                                                        {option.label}
                                                    </span>
                                                    <span className="block text-xs text-muted-foreground">
                                                        {option.detail}
                                                    </span>
                                                </span>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {recipientValueFor(option, channel)}
                                                </span>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div>
                            <Label htmlFor="compose-manual">Additional recipients</Label>
                            <Textarea
                                id="compose-manual"
                                rows={3}
                                value={manualRecipients}
                                onChange={(event) => setManualRecipients(event.target.value)}
                                placeholder={
                                    channel === 'EMAIL'
                                        ? 'principal@school.edu, office@school.edu'
                                        : '+919876543210, +919812345678'
                                }
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                                Comma, semicolon, or newline separated. Maximum 100 recipients per batch.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Badge variant="outline" className="mb-3">
                            {CHANNEL_LABEL[channel]}
                        </Badge>
                        {channel === 'EMAIL' && resolvedSubject && (
                            <p className="mb-2 text-sm font-medium text-foreground">{resolvedSubject}</p>
                        )}
                        <p className="whitespace-pre-wrap rounded-md border bg-muted p-3 text-sm text-foreground">
                            {resolvedBody || 'Your message will appear here.'}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Queue</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            {finalRecipients.length} recipient(s) will be written to the notification
                            outbox.
                        </p>
                        <p className="rounded-md border border-warning/30 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
                            Queueing writes to the outbox; a scheduled dispatcher (/api/jobs/dispatch,
                            run daily) sends queued rows to their provider. Delivery receipts aren&apos;t
                            ingested for every channel yet, so a sent message may not show as Delivered.
                            Track them under{' '}
                            <Link href="/messages/tracking" className="underline">
                                Outbox
                            </Link>
                            .
                        </p>
                        {finalRecipients.length > 100 && (
                            <p className="text-xs text-rose-600">
                                Too many recipients — split this into batches of 100 or fewer.
                            </p>
                        )}
                        <Button className="w-full" disabled={!canQueue} onClick={queue}>
                            {pending ? 'Queueing…' : `Queue for ${finalRecipients.length} recipient(s)`}
                        </Button>
                        {lastResult && (
                            <p className="text-xs text-muted-foreground">
                                Last batch: {lastResult.queued} queued
                                {lastResult.rejected > 0 ? `, ${lastResult.rejected} rejected` : ''}.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
