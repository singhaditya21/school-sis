import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import LeadStageManager from '@/components/admissions/lead-stage-manager';
import { getLeadById, scoreLead } from '@/lib/actions/admissions';
import { getSession } from '@/lib/auth/session';

import {
    getLeadAssignedTo,
    getLeadDocumentPack,
    getParentEmailChannelStatus,
    listGradeSections,
    listLeadOwners,
    moveLeadStage,
} from '../actions';
import LeadActionsPanel from './lead-actions-panel';

interface Props {
    params: Promise<{ id: string }>;
}

const stageColors: Record<string, string> = {
    NEW: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    CONTACTED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    FORM_SUBMITTED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    DOCUMENTS_PENDING: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    INTERVIEW_SCHEDULED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    INTERVIEW_DONE: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    OFFERED: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
    ACCEPTED: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300',
    ENROLLED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    WITHDRAWN: 'bg-muted text-foreground dark:bg-gray-800 dark:text-gray-300',
};

export default async function LeadDetailPage({ params }: Props) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { id } = await params;
    const lead = await getLeadById(id);
    if (!lead) notFound();

    const [score, documentPack, owners, assignedToId, grades, emailChannel] = await Promise.all([
        scoreLead(id),
        getLeadDocumentPack(id),
        listLeadOwners(),
        getLeadAssignedTo(id),
        listGradeSections(),
        getParentEmailChannelStatus(),
    ]);

    async function handleStageUpdate(newStage: string) {
        'use server';
        const result = await moveLeadStage(id, newStage);
        return { success: result.success, error: result.error };
    }

    const requiredTotal = documentPack?.items.filter((i) => i.required).length ?? 0;
    const requiredVerified = requiredTotal - (documentPack?.requiredOutstanding ?? 0);

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground dark:text-white">
                        {lead.childFirstName} {lead.childLastName}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Applying for {lead.applyingForGrade} • Added {lead.createdAt.toLocaleDateString('en-IN')}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${stageColors[lead.stage] || 'bg-muted text-foreground'}`}>
                        {lead.stage.replace(/_/g, ' ')}
                    </span>
                    <Link href="/admissions" className="text-primary hover:underline text-sm">
                        ← Back
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lead Details */}
                <div className="bg-card rounded-xl shadow-sm border border-border dark:border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-foreground dark:text-white mb-4">Lead Details</h2>
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Child Name</dt>
                            <dd className="font-medium text-foreground dark:text-white">{lead.childFirstName} {lead.childLastName}</dd>
                        </div>
                        {lead.childDob && (
                            <div className="flex justify-between">
                                <dt className="text-muted-foreground">Date of Birth</dt>
                                <dd className="font-medium text-foreground dark:text-white">{lead.childDob}</dd>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Grade</dt>
                            <dd className="font-medium text-foreground dark:text-white">{lead.applyingForGrade}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Source</dt>
                            <dd className="font-medium text-foreground dark:text-white capitalize">{lead.source.toLowerCase().replace(/_/g, ' ')}</dd>
                        </div>
                        {lead.previousSchool && (
                            <div className="flex justify-between">
                                <dt className="text-muted-foreground">Previous School</dt>
                                <dd className="font-medium text-foreground dark:text-white">{lead.previousSchool}</dd>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Assigned To</dt>
                            <dd className="font-medium text-foreground dark:text-white">{lead.assignedToName || 'Unassigned'}</dd>
                        </div>
                    </dl>
                </div>

                {/* Parent Contact */}
                <div className="bg-card rounded-xl shadow-sm border border-border dark:border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-foreground dark:text-white mb-4">Parent Contact</h2>
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Name</dt>
                            <dd className="font-medium text-foreground dark:text-white">{lead.parentName}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Phone</dt>
                            <dd>
                                <a href={`tel:${lead.parentPhone}`} className="text-primary hover:underline">
                                    {lead.parentPhone}
                                </a>
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Email</dt>
                            <dd>
                                <a href={`mailto:${lead.parentEmail}`} className="text-primary hover:underline">
                                    {lead.parentEmail}
                                </a>
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            {/* Documents + score */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-card rounded-xl shadow-sm border border-border dark:border-gray-800 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-foreground dark:text-white">Documents</h2>
                        <Link href={`/admissions/${id}/documents`} className="text-sm text-primary hover:underline">
                            Open checklist →
                        </Link>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-foreground dark:text-white">{requiredVerified}</span>
                        <span className="text-muted-foreground">/ {requiredTotal} required documents verified</span>
                    </div>
                    <div className="mt-3 h-2 w-full rounded-full bg-muted dark:bg-gray-800">
                        <div
                            className="h-2 rounded-full bg-emerald-500"
                            style={{ width: requiredTotal ? `${Math.round((requiredVerified / requiredTotal) * 100)}%` : '0%' }}
                        />
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">
                        {documentPack?.applicationNumber
                            ? `Application ${documentPack.applicationNumber}`
                            : 'No application record opened yet.'}
                    </p>
                </div>

                <div className="bg-card rounded-xl shadow-sm border border-border dark:border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-foreground dark:text-white mb-1">Lead Score</h2>
                    <p className="text-xs text-muted-foreground mb-4">
                        Rule-based score computed from this lead&apos;s own record — source, stage, data
                        completeness and recency.
                    </p>
                    <div className="flex items-baseline gap-2 mb-4">
                        <span className="text-3xl font-bold text-foreground dark:text-white">{score.score}</span>
                        <span className="text-muted-foreground">/ 100</span>
                    </div>
                    <ul className="space-y-2 text-sm">
                        {score.breakdown.map((b) => (
                            <li key={b.factor}>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">{b.factor}</span>
                                    <span className="font-medium text-foreground dark:text-white">
                                        {b.score}/{b.maxScore}
                                    </span>
                                </div>
                                <div className="mt-1 h-1.5 w-full rounded-full bg-muted dark:bg-gray-800">
                                    <div
                                        className="h-1.5 rounded-full bg-primary"
                                        style={{ width: `${Math.round((b.score / b.maxScore) * 100)}%` }}
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Notes */}
            {lead.notes && (
                <div className="bg-card rounded-xl shadow-sm border border-border dark:border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-foreground dark:text-white mb-2">Notes</h2>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
                </div>
            )}

            {/* Stage Management */}
            <LeadStageManager
                currentStage={lead.stage}
                leadId={lead.id}
                onStageUpdate={handleStageUpdate}
            />

            <LeadActionsPanel
                leadId={lead.id}
                stage={lead.stage}
                assignedToId={assignedToId}
                owners={owners}
                grades={grades}
                emailConfigured={emailChannel.configured}
                applyingForGrade={lead.applyingForGrade}
            />
        </div>
    );
}
