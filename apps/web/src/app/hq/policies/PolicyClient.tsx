'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, Plus, Shield, ShieldAlert, Trash2, Unlink, Users } from 'lucide-react';
import {
    attachCampusAction,
    createCampusGroupAction,
    createGroupPolicyAction,
    deleteGroupPolicyAction,
    detachCampusAction,
} from './actions';

export interface CampusGroup {
    id: string;
    name: string;
    hqCity: string;
    isActive: boolean;
    campusCount: number;
    policyCount: number;
}

export interface GroupCampus {
    id: string;
    tenantId: string;
    region: string;
    campusType: string;
    name: string;
    code: string;
    isActive: boolean;
    activeStudents: number;
}

export interface GroupPolicy {
    id: string;
    policyName: string;
    policyKey: string;
    policyValue: string;
    isHardBlock: boolean;
    createdAt: string | Date;
}

export interface UnassignedCampus {
    id: string;
    name: string;
    code: string;
}

const CAMPUS_TYPES = ['MAIN', 'SATELLITE', 'FRANCHISE', 'ONLINE'];

export default function PolicyClient({
    groups,
    activeGroupId,
    campuses,
    policies,
    unassigned,
}: {
    groups: CampusGroup[];
    activeGroupId: string | null;
    campuses: GroupCampus[];
    policies: GroupPolicy[];
    unassigned: UnassignedCampus[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const [groupForm, setGroupForm] = useState({ name: '', hqCity: '' });
    const [attachForm, setAttachForm] = useState({ tenantId: '', region: '', campusType: 'MAIN' });
    const [policyForm, setPolicyForm] = useState({
        policyName: '',
        policyKey: '',
        policyValue: '',
        isHardBlock: true,
    });

    const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

    const run = (fn: () => Promise<{ success: boolean; error?: string }>, onDone: () => void, okMessage: string) => {
        startTransition(async () => {
            const result = await fn();
            if (!result.success) {
                toast.error(result.error ?? 'Something went wrong.');
                return;
            }
            toast.success(okMessage);
            onDone();
            router.refresh();
        });
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Multi-Campus Policy Cascading</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Group campuses under a headquarters, then define the non-negotiables every campus in the group inherits.
                </p>
            </div>

            {/* Group selector */}
            <div className="flex flex-wrap items-center gap-2">
                {groups.map((g) => {
                    const isActive = g.id === activeGroupId;
                    return (
                        <button
                            key={g.id}
                            type="button"
                            onClick={() => router.push(`/hq/policies?group=${g.id}`)}
                            className={`px-4 py-2.5 rounded-lg border text-left transition-colors ${
                                isActive
                                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                                    : 'border-slate-800 bg-slate-950 text-muted-foreground hover:border-slate-700 hover:text-slate-200'
                            }`}
                        >
                            <span className="block text-sm font-semibold">{g.name}</span>
                            <span className="block text-xs text-muted-foreground mt-0.5">
                                {g.hqCity} · {g.campusCount} campus{g.campusCount === 1 ? '' : 'es'} · {g.policyCount} polic{g.policyCount === 1 ? 'y' : 'ies'}
                            </span>
                        </button>
                    );
                })}
            </div>

            {groups.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 px-6 py-5">
                    <p className="text-sm text-slate-300 font-medium">No campus group exists yet.</p>
                    <p className="text-sm text-muted-foreground mt-1">
                        A group is what makes campuses comparable in HQ — cross-campus finance rolls up by group region, and
                        policies cascade to every campus attached below.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Create group */}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        run(
                            () => createCampusGroupAction(groupForm),
                            () => setGroupForm({ name: '', hqCity: '' }),
                            'Campus group created.',
                        );
                    }}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-4"
                >
                    <h3 className="text-sm font-semibold text-white">New campus group</h3>
                    <Field
                        label="Group name"
                        value={groupForm.name}
                        onChange={(v) => setGroupForm({ ...groupForm, name: v })}
                        placeholder="e.g. Sunrise Education Trust"
                        required
                    />
                    <Field
                        label="Headquarters city"
                        value={groupForm.hqCity}
                        onChange={(v) => setGroupForm({ ...groupForm, hqCity: v })}
                        placeholder="e.g. Pune"
                        required
                    />
                    <button
                        type="submit"
                        disabled={isPending}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Create group
                    </button>
                </form>

                {/* Campus membership */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 xl:col-span-2 space-y-5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">
                            {activeGroup ? `Campuses in ${activeGroup.name}` : 'Campus membership'}
                        </h3>
                        {activeGroup && (
                            <span className="text-xs text-muted-foreground">HQ: {activeGroup.hqCity}</span>
                        )}
                    </div>

                    {!activeGroup ? (
                        <p className="text-sm text-muted-foreground">Create a group first to attach campuses.</p>
                    ) : (
                        <>
                            {campuses.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No campus attached yet. Policies defined below will not reach anyone until a campus joins.
                                </p>
                            ) : (
                                <ul className="divide-y divide-slate-800/60 -mx-2">
                                    {campuses.map((c) => (
                                        <li key={c.id} className="flex items-center justify-between gap-4 px-2 py-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                                                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                                    {c.code} · {c.region} · {c.campusType}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0">
                                                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                                    <Users className="w-3 h-3" /> {c.activeStudents.toLocaleString('en-IN')}
                                                </span>
                                                <button
                                                    type="button"
                                                    disabled={isPending}
                                                    onClick={() =>
                                                        run(() => detachCampusAction(c.id), () => undefined, `${c.name} detached.`)
                                                    }
                                                    className="text-muted-foreground hover:text-rose-400 transition-colors p-1.5 disabled:opacity-50"
                                                    title="Detach campus from group"
                                                >
                                                    <Unlink className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    run(
                                        () => attachCampusAction({ groupId: activeGroup.id, ...attachForm }),
                                        () => setAttachForm({ tenantId: '', region: '', campusType: 'MAIN' }),
                                        'Campus attached to group.',
                                    );
                                }}
                                className="border-t border-slate-800 pt-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
                            >
                                <div className="sm:col-span-2">
                                    <label className="block text-xs text-muted-foreground mb-1">Campus</label>
                                    <select
                                        required
                                        value={attachForm.tenantId}
                                        onChange={(e) => setAttachForm({ ...attachForm, tenantId: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    >
                                        <option value="">Select an unassigned campus…</option>
                                        {unassigned.map((t) => (
                                            <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-muted-foreground mb-1">Region</label>
                                    <input
                                        required
                                        type="text"
                                        value={attachForm.region}
                                        onChange={(e) => setAttachForm({ ...attachForm, region: e.target.value })}
                                        placeholder="e.g. West"
                                        className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-muted-foreground mb-1">Type</label>
                                    <select
                                        value={attachForm.campusType}
                                        onChange={(e) => setAttachForm({ ...attachForm, campusType: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                    >
                                        {CAMPUS_TYPES.map((t) => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="sm:col-span-4">
                                    <button
                                        type="submit"
                                        disabled={isPending || unassigned.length === 0}
                                        className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 text-sm font-medium px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <Building2 className="w-4 h-4" />
                                        {unassigned.length === 0 ? 'Every campus is already in a group' : 'Attach campus'}
                                    </button>
                                </div>
                            </form>
                        </>
                    )}
                </div>
            </div>

            {/* Policies */}
            {activeGroup && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                        <h3 className="text-sm font-semibold text-white">
                            Policies cascading to {campuses.length} campus{campuses.length === 1 ? '' : 'es'}
                        </h3>
                        {policies.length === 0 ? (
                            <div className="p-8 border border-slate-800 rounded-xl bg-slate-950 text-center text-muted-foreground text-sm">
                                No policies defined. Campuses in this group currently have full autonomy.
                            </div>
                        ) : (
                            policies.map((policy) => (
                                <div key={policy.id} className="bg-slate-950 border border-slate-800 rounded-xl p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="text-lg font-semibold text-white flex items-center gap-2">
                                                <Shield className="w-5 h-5 text-indigo-400 shrink-0" />
                                                {policy.policyName}
                                            </p>
                                            <p className="text-xs text-muted-foreground font-mono mt-1">KEY: {policy.policyKey}</p>
                                        </div>
                                        {pendingDelete === policy.id ? (
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    disabled={isPending}
                                                    onClick={() =>
                                                        run(
                                                            () => deleteGroupPolicyAction({ groupId: activeGroup.id, policyId: policy.id }),
                                                            () => setPendingDelete(null),
                                                            'Policy removed.',
                                                        )
                                                    }
                                                    className="text-xs font-medium text-rose-400 border border-rose-900/60 rounded-md px-2.5 py-1.5 hover:bg-rose-950/40 disabled:opacity-50"
                                                >
                                                    Confirm remove
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPendingDelete(null)}
                                                    className="text-xs text-muted-foreground hover:text-slate-200 px-2 py-1.5"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setPendingDelete(policy.id)}
                                                className="text-muted-foreground hover:text-rose-400 transition-colors p-2 shrink-0"
                                                title="Remove policy"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 mt-4">
                                        <div className="bg-slate-900 rounded-lg p-3 border border-slate-800">
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Enforced value</p>
                                            <p className="font-semibold text-emerald-400">{policy.policyValue}</p>
                                        </div>
                                        <div className="bg-slate-900 rounded-lg p-3 border border-slate-800">
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Override</p>
                                            <p className="font-semibold text-amber-400 flex items-center gap-1.5">
                                                {policy.isHardBlock ? (
                                                    <><ShieldAlert className="w-4 h-4" /> Blocked at campus</>
                                                ) : 'Soft warning only'}
                                            </p>
                                        </div>
                                    </div>
                                    {campuses.length === 0 && (
                                        <p className="text-xs text-muted-foreground mt-4">
                                            No campus is attached to this group, so this policy currently reaches nobody.
                                        </p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            run(
                                () => createGroupPolicyAction({ groupId: activeGroup.id, ...policyForm }),
                                () => setPolicyForm({ policyName: '', policyKey: '', policyValue: '', isHardBlock: true }),
                                'Policy deployed to the group.',
                            );
                        }}
                        className="bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-4 self-start"
                    >
                        <h3 className="text-sm font-semibold text-white">Define new policy</h3>
                        <Field
                            label="Policy name"
                            value={policyForm.policyName}
                            onChange={(v) => setPolicyForm({ ...policyForm, policyName: v })}
                            placeholder="e.g. Minimum attendance requirement"
                            required
                        />
                        <Field
                            label="Policy key"
                            value={policyForm.policyKey}
                            onChange={(v) => setPolicyForm({ ...policyForm, policyKey: v })}
                            placeholder="MIN_ATTENDANCE_PCT"
                            mono
                            required
                        />
                        <Field
                            label="Enforced value"
                            value={policyForm.policyValue}
                            onChange={(v) => setPolicyForm({ ...policyForm, policyValue: v })}
                            placeholder="75"
                            required
                        />
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
                            <input
                                type="checkbox"
                                checked={policyForm.isHardBlock}
                                onChange={(e) => setPolicyForm({ ...policyForm, isHardBlock: e.target.checked })}
                                className="rounded border-slate-800 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
                            />
                            Hard block (prevent campus overrides)
                        </label>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
                        >
                            <Plus className="w-4 h-4" /> Deploy policy
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}

function Field({
    label, value, onChange, placeholder, required, mono,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    mono?: boolean;
}) {
    return (
        <div>
            <label className="block text-xs text-muted-foreground mb-1">{label}</label>
            <input
                type="text"
                required={required}
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className={`w-full bg-slate-900 border border-slate-800 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 ${mono ? 'font-mono' : ''}`}
            />
        </div>
    );
}
