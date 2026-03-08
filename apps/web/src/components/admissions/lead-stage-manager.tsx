'use client';

/**
 * Lead Stage Manager — Pipeline movement controls
 * 
 * Shows the current pipeline position and allows moving leads
 * to the next/previous stage.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ChevronRight, Loader2 } from 'lucide-react';

const PIPELINE_STAGES = [
    'NEW',
    'CONTACTED',
    'FORM_SUBMITTED',
    'DOCUMENTS_PENDING',
    'INTERVIEW_SCHEDULED',
    'INTERVIEW_DONE',
    'OFFERED',
    'ACCEPTED',
    'ENROLLED',
];

const stageColors: Record<string, { bg: string; dot: string }> = {
    NEW: { bg: 'bg-blue-500', dot: 'bg-blue-400' },
    CONTACTED: { bg: 'bg-yellow-500', dot: 'bg-yellow-400' },
    FORM_SUBMITTED: { bg: 'bg-purple-500', dot: 'bg-purple-400' },
    DOCUMENTS_PENDING: { bg: 'bg-orange-500', dot: 'bg-orange-400' },
    INTERVIEW_SCHEDULED: { bg: 'bg-indigo-500', dot: 'bg-indigo-400' },
    INTERVIEW_DONE: { bg: 'bg-cyan-500', dot: 'bg-cyan-400' },
    OFFERED: { bg: 'bg-teal-500', dot: 'bg-teal-400' },
    ACCEPTED: { bg: 'bg-lime-500', dot: 'bg-lime-400' },
    ENROLLED: { bg: 'bg-green-500', dot: 'bg-green-400' },
};

export default function LeadStageManager({
    currentStage,
    leadId,
    onStageUpdate,
}: {
    currentStage: string;
    leadId: string;
    onStageUpdate: (newStage: string) => Promise<{ success: boolean; error?: string }>;
}) {
    const [stage, setStage] = useState(currentStage);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const currentIndex = PIPELINE_STAGES.indexOf(stage);

    const handleMove = (newStage: string) => {
        setError(null);
        startTransition(async () => {
            const result = await onStageUpdate(newStage);
            if (result.success) {
                setStage(newStage);
                router.refresh();
            } else {
                setError(result.error || 'Failed to update stage');
            }
        });
    };

    return (
        <div className="bg-white dark:bg-gray-950 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Pipeline Stage</h2>

            {/* Visual Pipeline */}
            <div className="flex items-center gap-1 overflow-x-auto pb-4">
                {PIPELINE_STAGES.map((s, i) => {
                    const isActive = i <= currentIndex;
                    const isCurrent = s === stage;
                    const colors = stageColors[s];

                    return (
                        <div key={s} className="flex items-center">
                            <button
                                onClick={() => handleMove(s)}
                                disabled={isPending}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${isCurrent
                                        ? `${colors.bg} text-white shadow-md scale-105`
                                        : isActive
                                            ? `${colors.bg}/20 text-gray-800 dark:text-gray-200`
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                                    } ${isPending ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:scale-105'}`}
                            >
                                {isActive && i < currentIndex && (
                                    <CheckCircle className="w-3 h-3" />
                                )}
                                {isCurrent && isPending && (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                )}
                                {s.replace(/_/g, ' ')}
                            </button>
                            {i < PIPELINE_STAGES.length - 1 && (
                                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 mx-0.5" />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-3 mt-4">
                {currentIndex > 0 && (
                    <button
                        onClick={() => handleMove(PIPELINE_STAGES[currentIndex - 1])}
                        disabled={isPending}
                        className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
                    >
                        ← Move Back
                    </button>
                )}
                {currentIndex < PIPELINE_STAGES.length - 1 && (
                    <button
                        onClick={() => handleMove(PIPELINE_STAGES[currentIndex + 1])}
                        disabled={isPending}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                    >
                        {isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
                        ) : null}
                        Move to {PIPELINE_STAGES[currentIndex + 1].replace(/_/g, ' ')} →
                    </button>
                )}
                {stage !== 'REJECTED' && stage !== 'WITHDRAWN' && stage !== 'ENROLLED' && (
                    <>
                        <button
                            onClick={() => handleMove('REJECTED')}
                            disabled={isPending}
                            className="px-4 py-2 text-sm border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 ml-auto"
                        >
                            Reject
                        </button>
                        <button
                            onClick={() => handleMove('WITHDRAWN')}
                            disabled={isPending}
                            className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
                        >
                            Withdrawn
                        </button>
                    </>
                )}
            </div>

            {error && (
                <p className="text-sm text-red-500 mt-3">{error}</p>
            )}
        </div>
    );
}
