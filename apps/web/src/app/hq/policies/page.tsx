import { getHQOverviewAction } from '@/lib/actions/hq';
import PolicyClient from './PolicyClient';

export const metadata = {
    title: 'Group Policies | ScholarMind HQ',
};

export default async function HQPoliciesPage() {
    const { group, policies } = await getHQOverviewAction();

    if (!group) {
        return (
            <div className="p-8 text-center text-slate-400">
                No HQ Group configured for this instance.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Multi-Campus Policy Cascading</h1>
                <p className="text-sm text-slate-400 mt-1">
                    Manage group-level non-negotiables that propagate to all campus tenants.
                </p>
            </div>
            
            <PolicyClient initialPolicies={policies} groupId={group.id} />
        </div>
    );
}
