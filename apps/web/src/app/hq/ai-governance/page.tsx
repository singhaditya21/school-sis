import React from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { Brain } from 'lucide-react';

export const metadata = {
    title: 'AI Governance | ScholarMind HQ',
};

/**
 * Deliberately empty.
 *
 * The AI agent implementation was removed from this release, so nothing writes
 * to ai_token_logs — every row it could report on would be stale or absent.
 * A spend-and-token dashboard here would show numbers no running system
 * produces, so the surface stays honest until metering is reinstated.
 */
export default async function AIGovernancePage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    return (
        <div className="max-w-2xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">AI Governance</h1>
                <p className="text-sm text-slate-400 mt-1">
                    Model spend, token budgets and per-agent limits across campuses.
                </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-8">
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center">
                    <Brain className="w-6 h-6 text-slate-500" />
                </div>
                <h2 className="text-lg font-semibold text-white mt-5">Not available in this release</h2>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                    The AI agent runtime that this console governed is not part of the current build, so no usage,
                    spend or token data is being produced. Rather than show a dashboard over an empty meter, the
                    surface is left blank until agent execution and its metering are shipped together.
                </p>
                <p className="text-sm text-slate-500 mt-4">
                    Governance controls that <em>are</em> live today sit in the{' '}
                    <Link href="/hq/policies" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                        Global Policy Engine
                    </Link>
                    , which cascades group-level rules to every campus.
                </p>
            </div>
        </div>
    );
}
