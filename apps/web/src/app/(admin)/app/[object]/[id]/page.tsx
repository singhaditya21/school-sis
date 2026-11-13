import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
    findPotentialDuplicateRecords,
    getObjectMetadata,
    getRecordAuditTimeline,
    getRelatedLookupRecords,
    queryRecords,
    type RecordAuditTimelineEntry,
    type RelatedLookupGroup,
} from '@/lib/actions/metadata-engine';
import { resolveEffectiveUserRoleContext } from '@/lib/rbac/custom-roles';
import {
    listPermittedLayoutsForRole,
    resolveLayoutForRole,
    type MetadataApprovalInstanceItem,
    type MetadataRecordAttachmentItem,
} from '@/lib/metadata/lcnc-helpers';
import {
    getRecordApprovalStatusAction,
    listRecordAttachmentsAction,
} from '@/lib/actions/lcnc-tier2';
import type { DuplicateMatchEntry } from '@/lib/metadata/platform';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ExternalLink, Link2 } from 'lucide-react';
import GenericFormClient from './generic-form';
import {
    RecordAttachmentsCard,
    RecordAuditTimelineCard,
    RecordExperienceHeader,
} from './record-detail-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function GenericObjectFormPage({
    params,
    searchParams,
}: {
    params: Promise<{ object: string; id: string }>;
    searchParams?: Promise<{ layoutId?: string }>;
}) {
    const resolvedParams = await params;
    const resolvedSearch = searchParams ? await searchParams : undefined;
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    try {
        const [{ objectDef, fields, layouts, hiddenFieldCount }, roleCtx] = await Promise.all([
            getObjectMetadata(resolvedParams.object),
            resolveEffectiveUserRoleContext(session.userId, session.tenantId, session.role),
        ]);

        if (fields.length === 0) {
            return (
                <div className="rounded-lg border border-warning/30 bg-warning-subtle p-8 text-center text-warning">
                    <h2 className="mb-2 text-xl font-bold">No writable fields</h2>
                    <p>Your role has no access to any field on {objectDef.name}.</p>
                </div>
            );
        }

        let initialData = {};
        let relatedGroups: RelatedLookupGroup[] = [];
        let auditTimeline: RecordAuditTimelineEntry[] = [];
        let potentialDuplicates: DuplicateMatchEntry[] = [];
        let activeApprovalInstance: MetadataApprovalInstanceItem | null = null;
        let recordAttachments: MetadataRecordAttachmentItem[] = [];
        if (resolvedParams.id !== 'new') {
            const [
                records,
                loadedRelated,
                loadedTimeline,
                loadedDuplicates,
                approvalState,
                loadedAttachments,
            ] = await Promise.all([
                queryRecords(resolvedParams.object, { id: resolvedParams.id }, 1, 0),
                getRelatedLookupRecords(resolvedParams.object, resolvedParams.id),
                getRecordAuditTimeline(resolvedParams.object, resolvedParams.id),
                findPotentialDuplicateRecords(resolvedParams.object, resolvedParams.id),
                getRecordApprovalStatusAction(resolvedParams.object, resolvedParams.id).catch(
                    () => ({ activeInstance: null, hasConfiguredProcess: false }),
                ),
                listRecordAttachmentsAction(resolvedParams.object, resolvedParams.id).catch(
                    () => [],
                ),
            ]);
            if (records.length > 0) {
                initialData = records[0];
            } else {
                throw new Error('Record not found');
            }
            relatedGroups = loadedRelated;
            auditTimeline = loadedTimeline;
            potentialDuplicates = loadedDuplicates;
            activeApprovalInstance = approvalState.activeInstance;
            recordAttachments = loadedAttachments;
        }

        const permittedForms = listPermittedLayoutsForRole(
            layouts,
            'FORM',
            roleCtx.effectiveRoleCode,
            session.role,
        );
        const formLayout = resolveLayoutForRole(
            layouts,
            'FORM',
            roleCtx.effectiveRoleCode,
            session.role,
            resolvedSearch?.layoutId,
        );

        return (
            <div className="space-y-6 max-w-4xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <Link
                            href={`/app/${resolvedParams.object}`}
                            className="inline-flex items-center text-xs text-primary hover:underline mb-2"
                        >
                            <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Back to {objectDef.name} Home
                        </Link>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h1 className="text-2xl font-bold text-foreground capitalize">
                                {resolvedParams.id === 'new'
                                    ? `New ${objectDef.name}`
                                    : `Edit ${objectDef.name}`}
                            </h1>
                            {formLayout?.name && (
                                <Badge variant="outline" className="text-xs font-mono">
                                    Active Form: {formLayout.name}
                                </Badge>
                            )}
                        </div>
                        {hiddenFieldCount > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                {hiddenFieldCount} field{hiddenFieldCount === 1 ? '' : 's'} hidden by role FLS.
                            </p>
                        )}
                    </div>

                    {permittedForms.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-muted-foreground mr-1">Switch Form:</span>
                            {permittedForms.map(frm => {
                                const isCurrent = frm.id === formLayout?.id;
                                return (
                                    <Link
                                        key={frm.id}
                                        href={`/app/${resolvedParams.object}/${resolvedParams.id}?layoutId=${frm.id}`}
                                        className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                                            isCurrent
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-card text-muted-foreground border-border hover:text-foreground'
                                        }`}
                                    >
                                        {frm.name || 'Default Form'}
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>

                {resolvedParams.id !== 'new' && (
                    <RecordExperienceHeader
                        objectName={resolvedParams.object}
                        recordId={resolvedParams.id}
                        fields={fields}
                        recordData={initialData as Record<string, unknown>}
                        potentialDuplicates={potentialDuplicates}
                        activeApprovalInstance={activeApprovalInstance}
                    />
                )}

                <GenericFormClient
                    key={formLayout?.id || 'default-form'}
                    objectName={resolvedParams.object}
                    recordId={resolvedParams.id === 'new' ? undefined : resolvedParams.id}
                    fields={fields}
                    initialData={initialData}
                    layout={formLayout?.schema}
                />

                {resolvedParams.id !== 'new' && relatedGroups.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Link2 className="w-4 h-4 text-primary" />
                                Related Records (Child Lookups)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {relatedGroups.map(group => (
                                <div
                                    key={`${group.objectApiName}-${group.fieldApiName}`}
                                    className="rounded-lg border border-border p-3 space-y-2"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-semibold text-foreground">
                                            {group.objectLabel} · via{' '}
                                            <span className="font-mono text-xs text-primary">
                                                {group.fieldLabel}
                                            </span>
                                        </span>
                                        <Link
                                            href={`/app/${group.objectApiName}/new`}
                                            className="text-xs text-primary hover:underline"
                                        >
                                            + New {group.objectLabel}
                                        </Link>
                                    </div>
                                    {group.records.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                            No related {group.objectLabel.toLowerCase()} records linked yet.
                                        </p>
                                    ) : (
                                        <div className="divide-y divide-border">
                                            {group.records.map((rec, idx) => {
                                                const recId = String(rec.id || idx);
                                                return (
                                                    <div
                                                        key={recId}
                                                        className="flex items-center justify-between py-2 text-xs"
                                                    >
                                                        <span className="font-mono text-muted-foreground">
                                                            {recId.slice(0, 8)}
                                                        </span>
                                                        <Link
                                                            href={`/app/${group.objectApiName}/${recId}`}
                                                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                                        >
                                                            View Record <ExternalLink className="w-3 h-3" />
                                                        </Link>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {resolvedParams.id !== 'new' && (
                    <RecordAttachmentsCard
                        objectName={resolvedParams.object}
                        recordId={resolvedParams.id}
                        initialAttachments={recordAttachments}
                    />
                )}

                {resolvedParams.id !== 'new' && (
                    <RecordAuditTimelineCard timeline={auditTimeline} />
                )}
            </div>
        );
    } catch (e: unknown) {
        return (
            <div className="p-8 text-center border rounded-lg border-destructive/30 bg-destructive-subtle text-destructive">
                <h2 className="text-xl font-bold mb-2">Error Loading Form</h2>
                <p>{(e as Error).message}</p>
            </div>
        );
    }
}
