'use client';

/**
 * @module app/(admin)/settings/objects/[id]/portal-publisher
 *
 * Salesforce Experience Cloud / Web-to-Object Public Portal Publisher (Track C):
 * Allows administrators to publish any Custom Object as a self-service public intake
 * micro-portal (`/portal/[tenantId]/[object]`) with customizable fields, initial stage
 * assignment, embeddable iframe snippet, and a live Applicant Status Tracker.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    CheckCircle2,
    Code2,
    Copy,
    ExternalLink,
    Globe,
    Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    savePortalIntakeConfig,
    type ExperiencePortalConfig,
    type MetadataField,
    type MetadataLayout,
} from '@/lib/actions/metadata-engine';
import { isVirtualMetadataField } from '@/lib/metadata/platform';

export default function ExperiencePortalPublisherClient({
    objectId,
    objectName,
    objectApiName,
    tenantId,
    fields,
    initialLayouts,
}: {
    objectId: string;
    objectName: string;
    objectApiName: string;
    tenantId: string;
    fields: MetadataField[];
    initialLayouts: MetadataLayout[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const formLayout = initialLayouts.find(l => l.layoutType === 'FORM');
    const existingPortal = ((formLayout?.schema as Record<string, unknown> | undefined)
        ?.portalConfig || {}) as Partial<ExperiencePortalConfig>;

    const writableFields = fields.filter(
        f => !isVirtualMetadataField(f) && f.validationRules?.fieldSubType !== 'AUTO_NUMBER',
    );
    const picklistFields = fields.filter(
        f => f.dataType === 'PICKLIST' && Array.isArray(f.picklistOptions) && f.picklistOptions.length > 0,
    );

    const [enabled, setEnabled] = useState<boolean>(Boolean(existingPortal.enabled));
    const [portalTitle, setPortalTitle] = useState<string>(
        existingPortal.portalTitle || `${objectName} Self-Service Portal`,
    );
    const [portalDescription, setPortalDescription] = useState<string>(
        existingPortal.portalDescription ||
            `Submit your ${objectName.toLowerCase()} online and track real-time stage updates.`,
    );
    const [exposedFields, setExposedFields] = useState<string[]>(
        Array.isArray(existingPortal.exposedFields) && existingPortal.exposedFields.length > 0
            ? existingPortal.exposedFields
            : writableFields.map(f => f.apiName),
    );
    const [defaultStageField, setDefaultStageField] = useState<string>(
        existingPortal.defaultStageField || picklistFields[0]?.apiName || '',
    );
    const [defaultStageValue, setDefaultStageValue] = useState<string>(
        existingPortal.defaultStageValue || picklistFields[0]?.picklistOptions?.[0] || '',
    );
    const [successMessage, setSuccessMessage] = useState<string>(
        existingPortal.successMessage ||
            'Your submission has been recorded! Save your tracking reference below to check your live status anytime.',
    );
    const [enableStatusTracker, setEnableStatusTracker] = useState<boolean>(
        existingPortal.enableStatusTracker ?? true,
    );

    const portalPath = `/portal/${tenantId}/${objectApiName}`;
    const selectedStageFieldObj = picklistFields.find(f => f.apiName === defaultStageField);

    const toggleExposedField = (apiName: string) => {
        setExposedFields(prev =>
            prev.includes(apiName) ? prev.filter(k => k !== apiName) : [...prev, apiName],
        );
    };

    const handleSavePortal = () => {
        if (exposedFields.length === 0) {
            toast.error('Select at least one field to expose on the public intake form.');
            return;
        }
        startTransition(async () => {
            const res = await savePortalIntakeConfig(objectId, {
                enabled,
                portalTitle,
                portalDescription,
                exposedFields,
                defaultStageField: defaultStageField || undefined,
                defaultStageValue: defaultStageValue || undefined,
                successMessage,
                enableStatusTracker,
            });
            if (!res.success) {
                toast.error(res.error || 'Failed to save Experience Cloud portal settings.');
                return;
            }
            toast.success(
                enabled
                    ? `Experience Cloud Portal published at ${portalPath}`
                    : 'Experience Cloud Portal configuration saved.',
            );
            if (res.objectId && res.objectId !== objectId) {
                router.replace(`/settings/objects/${res.objectId}`);
            } else {
                router.refresh();
            }
        });
    };

    const handleCopyLink = () => {
        const fullUrl =
            typeof window !== 'undefined'
                ? `${window.location.origin}${portalPath}`
                : portalPath;
        navigator.clipboard?.writeText(fullUrl);
        toast.success('Public Portal link copied to clipboard!');
    };

    const handleCopyIframe = () => {
        const origin =
            typeof window !== 'undefined' ? window.location.origin : 'https://app.scholarmind.edu';
        const snippet = `<iframe src="${origin}${portalPath}" width="100%" height="720" style="border:0;border-radius:12px;" title="${portalTitle}"></iframe>`;
        navigator.clipboard?.writeText(snippet);
        toast.success('Embeddable iframe snippet copied!');
    };

    return (
        <Card className="border-border shadow-sm" data-testid="experience-portal-publisher">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Globe className="w-5 h-5 text-primary" />
                        <CardTitle className="text-lg">
                            Experience Cloud — Web-to-Object Public Portal &amp; Status Tracker
                        </CardTitle>
                        <Badge
                            variant="outline"
                            className={
                                enabled
                                    ? 'bg-success-subtle text-success border-success/30'
                                    : 'bg-muted text-muted-foreground'
                            }
                        >
                            {enabled ? 'LIVE PORTAL' : 'UNPUBLISHED'}
                        </Badge>
                    </div>
                    <CardDescription>
                        Publish a no-code external intake form and self-service application stage tracker for students, parents, or prospective leads.
                    </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Switch
                            id="portal-enabled-switch"
                            checked={enabled}
                            onCheckedChange={setEnabled}
                            data-testid="toggle-portal-enabled"
                        />
                        <Label htmlFor="portal-enabled-switch" className="text-xs font-medium">
                            Publish Portal
                        </Label>
                    </div>
                    {enabled && (
                        <Link
                            href={portalPath}
                            target="_blank"
                            data-testid="open-public-portal-link"
                            className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                        >
                            Preview Live Portal <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Portal Headline</Label>
                        <Input
                            value={portalTitle}
                            onChange={e => setPortalTitle(e.target.value)}
                            placeholder="e.g. Coaching Admission & Scholarship Inquiry Portal"
                            data-testid="portal-title-input"
                            className="text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Portal Subtitle / Instructions</Label>
                        <Input
                            value={portalDescription}
                            onChange={e => setPortalDescription(e.target.value)}
                            placeholder="Instructions displayed at the top of the public portal..."
                            className="text-sm"
                        />
                    </div>
                </div>

                {/* Exposed Public Intake Fields */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">
                            Exposed Public Form Fields ({exposedFields.length} of {writableFields.length})
                        </Label>
                        <span className="text-[11px] text-muted-foreground">
                            Dynamic Form visibility &amp; Cross-Field validation rules run automatically
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/20 p-3">
                        {writableFields.map(field => {
                            const active = exposedFields.includes(field.apiName);
                            return (
                                <button
                                    key={field.apiName}
                                    type="button"
                                    onClick={() => toggleExposedField(field.apiName)}
                                    data-testid={`portal-expose-field-${field.apiName}`}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                                        active
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-background text-muted-foreground border-border hover:text-foreground'
                                    }`}
                                >
                                    {active && <CheckCircle2 className="w-3 h-3" />}
                                    <span>{field.label}</span>
                                    <span className="opacity-70 font-mono text-[10px]">
                                        ({field.apiName})
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Default Stage Assignment & Status Tracker Toggle */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Default Stage Picklist Field</Label>
                        <Select
                            value={defaultStageField || '__NONE__'}
                            onValueChange={val => {
                                const nextField = val === '__NONE__' ? '' : val;
                                setDefaultStageField(nextField);
                                const found = picklistFields.find(p => p.apiName === nextField);
                                setDefaultStageValue(found?.picklistOptions?.[0] || '');
                            }}
                        >
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__NONE__">No Default Stage</SelectItem>
                                {picklistFields.map(pf => (
                                    <SelectItem key={pf.apiName} value={pf.apiName}>
                                        {pf.label} ({pf.apiName})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs">Initial Stage Value on Public Submit</Label>
                        <Select
                            value={defaultStageValue || '__NONE__'}
                            onValueChange={val => setDefaultStageValue(val === '__NONE__' ? '' : val)}
                            disabled={!selectedStageFieldObj}
                        >
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Select initial stage" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__NONE__">Unset</SelectItem>
                                {(selectedStageFieldObj?.picklistOptions || []).map(opt => (
                                    <SelectItem key={opt} value={opt}>
                                        {opt}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                        <div className="space-y-0.5">
                            <span className="text-xs font-medium text-foreground block">
                                Applicant Status Tracker
                            </span>
                            <span className="text-[11px] text-muted-foreground block">
                                Let applicants check live Stage Path
                            </span>
                        </div>
                        <Switch
                            checked={enableStatusTracker}
                            onCheckedChange={setEnableStatusTracker}
                            data-testid="toggle-portal-status-tracker"
                        />
                    </div>
                </div>

                {/* Confirmation message & Shareable URLs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div className="space-y-1.5">
                        <Label className="text-xs">Post-Submission Confirmation Message</Label>
                        <Input
                            value={successMessage}
                            onChange={e => setSuccessMessage(e.target.value)}
                            className="text-xs"
                        />
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCopyLink}
                            data-testid="copy-portal-url-btn"
                            className="text-xs gap-1.5"
                        >
                            <Copy className="w-3.5 h-3.5" />
                            Copy Portal Link
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleCopyIframe}
                            data-testid="copy-portal-iframe-btn"
                            className="text-xs gap-1.5"
                        >
                            <Code2 className="w-3.5 h-3.5" />
                            Copy Embed Code
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={isPending}
                            onClick={handleSavePortal}
                            data-testid="save-portal-config-btn"
                            className="text-xs gap-1.5"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            {isPending ? 'Saving...' : 'Save Portal Settings'}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
