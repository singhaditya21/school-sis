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
import { createTemplate } from '../../actions';
import {
    CHANNEL_LABEL,
    MESSAGE_CHANNELS,
    extractTemplateVariables,
    type ChannelAvailability,
    type MessageChannel,
} from '../../types';

/** SMS segment length for GSM-7; longer bodies are billed as multiple segments. */
const SMS_SEGMENT = 160;

export default function TemplateForm({ availability }: { availability: ChannelAvailability[] }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const [name, setName] = useState('');
    const [channel, setChannel] = useState<MessageChannel>('SMS');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');

    const variables = useMemo(() => extractTemplateVariables(`${subject} ${body}`), [subject, body]);
    const providerFor = useMemo(
        () => new Map(availability.map((entry) => [entry.channel, entry])),
        [availability],
    );
    const selectedProvider = providerFor.get(channel);

    const segments = Math.max(1, Math.ceil(body.length / SMS_SEGMENT));

    function submit() {
        startTransition(async () => {
            const result = await createTemplate({ name, channel, subject, body });
            if (result.success) {
                toast.success(`Template "${name.trim()}" saved`);
                router.push('/messages/templates');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not save the template.');
            }
        });
    }

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card>
                <CardHeader>
                    <CardTitle>Template details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="template-name">Template name</Label>
                        <Input
                            id="template-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Fee reminder — term 2"
                        />
                    </div>

                    <div>
                        <Label htmlFor="template-channel">Channel</Label>
                        <select
                            id="template-channel"
                            value={channel}
                            onChange={(event) => setChannel(event.target.value as MessageChannel)}
                            className="mt-1 h-9 w-full rounded-md border border-border px-3 text-sm"
                        >
                            {MESSAGE_CHANNELS.map((option) => (
                                <option key={option} value={option}>
                                    {CHANNEL_LABEL[option]}
                                </option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {selectedProvider?.configured
                                ? `Messages on this channel are accepted by the "${selectedProvider.provider}" provider and held in the outbox until a dispatcher runs.`
                                : `${selectedProvider?.reason ?? 'This channel has no provider in this deployment.'} The template can still be written, but composing on it will be refused until that is fixed.`}
                        </p>
                    </div>

                    {channel === 'EMAIL' && (
                        <div>
                            <Label htmlFor="template-subject">Subject line</Label>
                            <Input
                                id="template-subject"
                                value={subject}
                                onChange={(event) => setSubject(event.target.value)}
                                placeholder="Term 2 fee due on {{dueDate}}"
                            />
                        </div>
                    )}

                    <div>
                        <Label htmlFor="template-body">Message body</Label>
                        <Textarea
                            id="template-body"
                            rows={8}
                            value={body}
                            onChange={(event) => setBody(event.target.value)}
                            placeholder={
                                'Dear {{guardianName}}, the term 2 fee for {{studentName}} is due on {{dueDate}}.'
                            }
                        />
                        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                            <span>
                                Wrap placeholders in double braces, e.g.{' '}
                                <code className="rounded bg-muted px-1">{'{{studentName}}'}</code>
                            </span>
                            <span>
                                {body.length} chars
                                {channel === 'SMS' ? ` · ${segments} SMS segment(s)` : ''}
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button
                            onClick={submit}
                            disabled={pending || !name.trim() || !body.trim() || (channel === 'EMAIL' && !subject.trim())}
                        >
                            {pending ? 'Saving…' : 'Save template'}
                        </Button>
                        <Link href="/messages/templates">
                            <Button variant="outline" type="button">
                                Cancel
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Detected placeholders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {variables.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                None yet. Placeholders are read straight out of the text you type — there
                                is no fixed list of supported variables.
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-1">
                                {variables.map((variable) => (
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
                        <p className="mt-3 text-xs text-muted-foreground">
                            When you compose from this template you will be asked for a value for each
                            placeholder. Values are not auto-filled from student records in this release.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {channel === 'EMAIL' && subject && (
                            <p className="mb-2 text-sm font-medium text-foreground">{subject}</p>
                        )}
                        <p className="whitespace-pre-wrap rounded-md border bg-muted p-3 text-sm text-foreground">
                            {body || 'Your message will appear here.'}
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
