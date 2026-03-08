import { getSession } from '@/lib/auth/session';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getLeadById, updateLeadStage } from '@/lib/actions/admissions';
import LeadStageManager from '@/components/admissions/lead-stage-manager';

interface Props {
    params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: Props) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { id } = await params;
    const lead = await getLeadById(id);
    if (!lead) notFound();

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
        WITHDRAWN: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    };

    async function handleStageUpdate(newStage: string) {
        'use server';
        return updateLeadStage(id, newStage);
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {lead.childFirstName} {lead.childLastName}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Applying for {lead.applyingForGrade} • Added {lead.createdAt.toLocaleDateString('en-IN')}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${stageColors[lead.stage] || 'bg-gray-100 text-gray-700'}`}>
                        {lead.stage.replace(/_/g, ' ')}
                    </span>
                    <Link href="/admissions" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                        ← Back
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Lead Details */}
                <div className="bg-white dark:bg-gray-950 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Lead Details</h2>
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Child Name</dt>
                            <dd className="font-medium text-gray-900 dark:text-white">{lead.childFirstName} {lead.childLastName}</dd>
                        </div>
                        {lead.childDob && (
                            <div className="flex justify-between">
                                <dt className="text-muted-foreground">Date of Birth</dt>
                                <dd className="font-medium text-gray-900 dark:text-white">{lead.childDob}</dd>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Grade</dt>
                            <dd className="font-medium text-gray-900 dark:text-white">{lead.applyingForGrade}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Source</dt>
                            <dd className="font-medium text-gray-900 dark:text-white capitalize">{lead.source.toLowerCase().replace(/_/g, ' ')}</dd>
                        </div>
                        {lead.previousSchool && (
                            <div className="flex justify-between">
                                <dt className="text-muted-foreground">Previous School</dt>
                                <dd className="font-medium text-gray-900 dark:text-white">{lead.previousSchool}</dd>
                            </div>
                        )}
                        {lead.assignedToName && (
                            <div className="flex justify-between">
                                <dt className="text-muted-foreground">Assigned To</dt>
                                <dd className="font-medium text-gray-900 dark:text-white">{lead.assignedToName}</dd>
                            </div>
                        )}
                    </dl>
                </div>

                {/* Parent Contact */}
                <div className="bg-white dark:bg-gray-950 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Parent Contact</h2>
                    <dl className="space-y-3 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Name</dt>
                            <dd className="font-medium text-gray-900 dark:text-white">{lead.parentName}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Phone</dt>
                            <dd>
                                <a href={`tel:${lead.parentPhone}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                                    {lead.parentPhone}
                                </a>
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Email</dt>
                            <dd>
                                <a href={`mailto:${lead.parentEmail}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                                    {lead.parentEmail}
                                </a>
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>

            {/* Notes */}
            {lead.notes && (
                <div className="bg-white dark:bg-gray-950 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Notes</h2>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
                </div>
            )}

            {/* Stage Management */}
            <LeadStageManager
                currentStage={lead.stage}
                leadId={lead.id}
                onStageUpdate={handleStageUpdate}
            />
        </div>
    );
}
