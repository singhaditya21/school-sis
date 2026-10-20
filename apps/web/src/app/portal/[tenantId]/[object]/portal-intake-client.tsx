'use client';

/**
 * @module app/portal/[tenantId]/[object]/portal-intake-client
 *
 * Salesforce Experience Cloud Self-Service Public Intake Form & Applicant Status Tracker (Track C):
 *   1. Web-to-Object Public Intake Form (`data-testid="portal-intake-form"`) with live Dynamic Form
 *      visibility rules (`evaluateMetadataVisibilityRule`).
 *   2. Instant Confirmation & Tracking Reference Card (`data-testid="portal-submission-confirmation"`).
 *   3. Self-Service Application Stage Path Tracker (`data-testid="portal-status-tracker"`).
 */

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
    CheckCircle2,
    ChevronRight,
    FileCheck2,
    Globe,
    Search,
    Send,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
    lookupPublicPortalRecordStatus,
    submitPublicPortalIntakeRecord,
    type PublicPortalSchemaResult,
} from '@/lib/actions/metadata-engine';
import { evaluateMetadataVisibilityRule } from '@/lib/metadata/platform';

export default function PortalIntakeClient({
    tenantId,
    objectApiName,
    schema,
}: {
    tenantId: string;
    objectApiName: string;
    schema: PublicPortalSchemaResult;
}) {
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<'SUBMIT' | 'TRACK'>('SUBMIT');
    const [formValues, setFormValues] = useState<Record<string, unknown>>({});
    const [submissionResult, setSubmissionResult] = useState<{
        recordId: string;
        trackingReference: string;
    } | null>(null);

    // Status Tracker state
    const [referenceInput, setReferenceInput] = useState('');
    const [contactVerifier, setContactVerifier] = useState('');
    const [statusResult, setStatusResult] = useState<{
        found: boolean;
        reference?: string;
        currentStage?: string;
        stageLabel?: string;
        stageOptions?: string[];
        submittedAt?: string;
        updatedAt?: string;
        error?: string;
    } | null>(null);

    const setFieldValue = (apiName: string, value: unknown) => {
        setFormValues(prev => ({
            ...prev,
            [apiName]: value,
        }));
    };

    const visibleFields = schema.fields.filter(field => {
        if (!field.validationRules?.visibilityWhenField) return true;
        return evaluateMetadataVisibilityRule(
            {
                field: field.validationRules.visibilityWhenField,
                operator: field.validationRules.visibilityWhenOperator || 'equals',
                value: field.validationRules.visibilityWhenValue,
            },
            formValues,
        );
    });

    const handleSubmitForm = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const res = await submitPublicPortalIntakeRecord(
                tenantId,
                objectApiName,
                formValues,
            );
            if (!res.success || !res.recordId || !res.trackingReference) {
                toast.error(res.error || 'Submission failed. Please check your inputs.');
                return;
            }
            setSubmissionResult({
                recordId: res.recordId,
                trackingReference: res.trackingReference,
            });
            setReferenceInput(res.trackingReference);
            toast.success('Submitted! Your tracking reference is ready.');
        });
    };

    const handleLookupStatus = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const res = await lookupPublicPortalRecordStatus(
                tenantId,
                objectApiName,
                referenceInput,
                contactVerifier,
            );
            setStatusResult(res);
            if (!res.found) {
                toast.error(res.error || 'No matching submission found.');
            }
        });
    };

    return (
        <div className="min-h-screen bg-background py-10 px-4">
            <div className="max-w-2xl mx-auto space-y-6">
                {/* Portal Header */}
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <Badge
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/20 gap-1.5"
                        >
                            <Globe className="w-3.5 h-3.5" />
                            ScholarMind Experience Cloud Portal
                        </Badge>
                        {schema.portalConfig.enableStatusTracker && (
                            <div className="inline-flex rounded-lg border border-border bg-muted p-0.5 text-xs">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('SUBMIT')}
                                    data-testid="portal-tab-submit"
                                    className={`rounded-md px-3 py-1 font-medium transition-colors ${
                                        activeTab === 'SUBMIT'
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    New Submission
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('TRACK')}
                                    data-testid="portal-tab-track"
                                    className={`rounded-md px-3 py-1 font-medium transition-colors ${
                                        activeTab === 'TRACK'
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    Track Status
                                </button>
                            </div>
                        )}
                    </div>
                    <h1 className="text-2xl font-bold text-foreground">
                        {schema.portalConfig.portalTitle}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {schema.portalConfig.portalDescription}
                    </p>
                </div>

                {/* Tab 1: New Submission */}
                {activeTab === 'SUBMIT' && (
                    <>
                        {submissionResult ? (
                            <Card
                                className="border-success/40 bg-success-subtle/30 shadow-sm"
                                data-testid="portal-submission-confirmation"
                            >
                                <CardContent className="p-6 space-y-4 text-center">
                                    <FileCheck2 className="w-10 h-10 text-success mx-auto" />
                                    <div className="space-y-1">
                                        <h2 className="text-lg font-bold text-foreground">
                                            Submission Confirmed
                                        </h2>
                                        <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                            {schema.portalConfig.successMessage}
                                        </p>
                                    </div>
                                    <div className="inline-block rounded-lg border border-border bg-background px-5 py-3">
                                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground block">
                                            Your Tracking Reference
                                        </span>
                                        <span
                                            className="font-mono text-lg font-bold text-primary"
                                            data-testid="portal-tracking-reference"
                                        >
                                            {submissionResult.trackingReference}
                                        </span>
                                    </div>
                                    <div className="flex justify-center gap-3 pt-2">
                                        {schema.portalConfig.enableStatusTracker && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => setActiveTab('TRACK')}
                                                className="text-xs"
                                            >
                                                Track Application Status
                                            </Button>
                                        )}
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setSubmissionResult(null);
                                                setFormValues({});
                                            }}
                                            className="text-xs"
                                        >
                                            Submit Another Response
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <Card className="border-border shadow-sm">
                                <CardContent className="p-6">
                                    <form
                                        onSubmit={handleSubmitForm}
                                        className="space-y-4"
                                        data-testid="portal-intake-form"
                                    >
                                        {visibleFields.map(field => {
                                            const subType = field.validationRules?.fieldSubType;
                                            const val = formValues[field.apiName];
                                            return (
                                                <div key={field.apiName} className="space-y-1.5">
                                                    <Label className="text-xs font-medium">
                                                        {field.label}
                                                        {field.isRequired && (
                                                            <span className="text-destructive ml-1">
                                                                *
                                                            </span>
                                                        )}
                                                    </Label>
                                                    {field.dataType === 'PICKLIST' ? (
                                                        <Select
                                                            value={String(val || '')}
                                                            onValueChange={v =>
                                                                setFieldValue(field.apiName, v)
                                                            }
                                                        >
                                                            <SelectTrigger className="h-9 text-sm">
                                                                <SelectValue
                                                                    placeholder={`Select ${field.label}`}
                                                                />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {(field.picklistOptions || []).map(
                                                                    opt => (
                                                                        <SelectItem
                                                                            key={opt}
                                                                            value={opt}
                                                                        >
                                                                            {opt.replace(/_/g, ' ')}
                                                                        </SelectItem>
                                                                    ),
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : field.dataType === 'BOOLEAN' ? (
                                                        <div className="flex items-center gap-2 pt-1">
                                                            <Switch
                                                                checked={Boolean(val)}
                                                                onCheckedChange={v =>
                                                                    setFieldValue(field.apiName, v)
                                                                }
                                                            />
                                                            <span className="text-xs text-muted-foreground">
                                                                Yes / Confirm
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <Input
                                                            type={
                                                                field.dataType === 'NUMBER' ||
                                                                field.dataType === 'CURRENCY'
                                                                    ? 'number'
                                                                    : field.dataType === 'DATE'
                                                                      ? 'date'
                                                                      : subType === 'EMAIL'
                                                                        ? 'email'
                                                                        : subType === 'PHONE'
                                                                          ? 'tel'
                                                                          : subType === 'URL'
                                                                            ? 'url'
                                                                            : 'text'
                                                            }
                                                            required={Boolean(field.isRequired)}
                                                            value={String(val ?? '')}
                                                            onChange={e =>
                                                                setFieldValue(
                                                                    field.apiName,
                                                                    e.target.value,
                                                                )
                                                            }
                                                            placeholder={`Enter ${field.label.toLowerCase()}...`}
                                                            data-testid={`portal-input-${field.apiName}`}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}

                                        <Button
                                            type="submit"
                                            disabled={isPending}
                                            data-testid="portal-submit-btn"
                                            className="w-full gap-1.5 mt-4"
                                        >
                                            <Send className="w-4 h-4" />
                                            {isPending ? 'Submitting...' : `Submit ${schema.objectName}`}
                                        </Button>
                                    </form>
                                </CardContent>
                            </Card>
                        )}
                    </>
                )}

                {/* Tab 2: Self-Service Application Stage Path Status Tracker */}
                {activeTab === 'TRACK' && schema.portalConfig.enableStatusTracker && (
                    <Card
                        className="border-border shadow-sm"
                        data-testid="portal-status-tracker"
                    >
                        <CardHeader>
                            <CardTitle className="text-base">
                                Check Live Application / Inquiry Status
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Enter your Tracking Reference (or Record ID prefix) and your registered Email or Phone number.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <form
                                onSubmit={handleLookupStatus}
                                className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
                            >
                                <div className="space-y-1">
                                    <Label className="text-xs">Tracking Reference</Label>
                                    <Input
                                        value={referenceInput}
                                        onChange={e => setReferenceInput(e.target.value)}
                                        placeholder="e.g. INQ-2026-0042"
                                        data-testid="portal-track-reference-input"
                                        className="font-mono text-xs"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs">Registered Email or Phone</Label>
                                    <Input
                                        value={contactVerifier}
                                        onChange={e => setContactVerifier(e.target.value)}
                                        placeholder="student@example.edu"
                                        data-testid="portal-track-verifier-input"
                                        className="text-xs"
                                    />
                                </div>
                                <Button
                                    type="submit"
                                    disabled={isPending}
                                    data-testid="portal-track-lookup-btn"
                                    className="gap-1.5 text-xs"
                                >
                                    <Search className="w-3.5 h-3.5" />
                                    {isPending ? 'Checking...' : 'Check Status'}
                                </Button>
                            </form>

                            {statusResult?.found && (
                                <div
                                    className="rounded-xl border border-border bg-muted/30 p-4 space-y-3"
                                    data-testid="portal-status-result"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                        <span className="font-mono font-semibold text-foreground">
                                            Ref: {statusResult.reference}
                                        </span>
                                        <span className="font-semibold text-primary">
                                            {statusResult.stageLabel}: {statusResult.currentStage}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {(statusResult.stageOptions || []).map((opt, idx, arr) => {
                                            const currentIdx = arr.indexOf(
                                                statusResult.currentStage || '',
                                            );
                                            const isCurrent = opt === statusResult.currentStage;
                                            const isDone = currentIdx >= 0 && idx < currentIdx;
                                            return (
                                                <span
                                                    key={opt}
                                                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border ${
                                                        isCurrent
                                                            ? 'bg-primary text-primary-foreground border-primary'
                                                            : isDone
                                                              ? 'bg-success-subtle text-success border-success/30'
                                                              : 'bg-background text-muted-foreground border-border'
                                                    }`}
                                                >
                                                    {isDone && (
                                                        <CheckCircle2 className="w-3 h-3" />
                                                    )}
                                                    <span>{opt.replace(/_/g, ' ')}</span>
                                                    {idx < arr.length - 1 && (
                                                        <ChevronRight className="w-3 h-3 opacity-60" />
                                                    )}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
