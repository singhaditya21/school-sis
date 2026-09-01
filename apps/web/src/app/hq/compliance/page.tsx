import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { pool } from '@/lib/db';
import { Server, Info, ShieldQuestion } from 'lucide-react';

export const metadata = {
    title: 'Data Residency & Consent | ScholarMind HQ',
};

interface ComplianceRow {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
    region: string | null;
    tier: string | null;
    activeModules: string[] | null;
    optedIn: number;
    optedOut: number;
}

/**
 * What this platform actually records about each campus for privacy purposes:
 * the cloud region its company record is pinned to, the entitlements it has
 * bought, and the communication consents its users have given.
 *
 * Certification status (FERPA, DPDP, signed DPAs, encryption attestations) is
 * not stored anywhere in this database, so it is not reported here.
 */
export default async function CompliancePage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const { rows } = await pool.query(
        `SELECT
            t.id,
            t.name,
            t.code,
            t.is_active AS "isActive",
            c.region,
            c.subscription_tier::text AS tier,
            c.active_modules AS "activeModules",
            COALESCE(cs.opted_in, 0)::int  AS "optedIn",
            COALESCE(cs.opted_out, 0)::int AS "optedOut"
         FROM tenants t
         LEFT JOIN companies c ON c.id = t.company_id
         LEFT JOIN LATERAL (
            SELECT
                COUNT(*) FILTER (WHERE x.is_opted_in)::int      AS opted_in,
                COUNT(*) FILTER (WHERE NOT x.is_opted_in)::int  AS opted_out
            FROM consents x
            WHERE x.tenant_id = t.id
         ) cs ON TRUE
         ORDER BY c.region NULLS LAST, t.name ASC`
    );

    const campuses = rows as ComplianceRow[];

    const regions = new Map<string, number>();
    for (const campus of campuses) {
        const key = campus.region ?? 'Unknown';
        regions.set(key, (regions.get(key) ?? 0) + 1);
    }

    const unlinked = campuses.filter((c) => c.region === null).length;
    const totalConsents = campuses.reduce((sum, c) => sum + c.optedIn + c.optedOut, 0);
    const totalOptedIn = campuses.reduce((sum, c) => sum + c.optedIn, 0);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Data Residency & Consent</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Where each campus&apos; data is hosted, what it is entitled to, and the communication consents on record.
                </p>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950 px-5 py-4">
                <ShieldQuestion className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                    Regulatory certification — FERPA and DPDP status, signed data processing agreements, encryption
                    attestations — is not tracked in this release. This page reports only what the platform actually stores,
                    so nothing here should be read as a compliance assertion.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Hosting regions in use</p>
                            <p className="text-3xl font-bold text-white">{regions.size}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Across {campuses.length} campus{campuses.length === 1 ? '' : 'es'}
                            </p>
                        </div>
                        <Server className="w-5 h-5 text-cyan-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Campuses without a company record</p>
                            <p className={`text-3xl font-bold ${unlinked > 0 ? 'text-amber-400' : 'text-white'}`}>{unlinked}</p>
                            <p className="text-xs text-muted-foreground mt-1">Region and tier unknown for these</p>
                        </div>
                        <Info className="w-5 h-5 text-amber-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">Communication consents recorded</p>
                            <p className="text-3xl font-bold text-white">{totalConsents.toLocaleString('en-IN')}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {totalConsents === 0
                                    ? 'No consent captured yet'
                                    : `${totalOptedIn.toLocaleString('en-IN')} opted in`}
                            </p>
                        </div>
                        <Info className="w-5 h-5 text-indigo-400" />
                    </div>
                </div>
            </div>

            {regions.size > 0 && (
                <div className="flex flex-wrap gap-2">
                    {Array.from(regions.entries())
                        .sort((a, b) => b[1] - a[1])
                        .map(([region, count]) => (
                            <span
                                key={region}
                                className="flex items-center gap-2 text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-md"
                            >
                                <Server className="w-3 h-3" />
                                {region}
                                <span className="text-muted-foreground">· {count}</span>
                            </span>
                        ))}
                </div>
            )}

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-white">Campus register</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-muted-foreground uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Campus</th>
                                <th className="px-6 py-4 font-semibold">Hosting region</th>
                                <th className="px-6 py-4 font-semibold">Tier</th>
                                <th className="px-6 py-4 font-semibold">Entitled modules</th>
                                <th className="px-6 py-4 font-semibold">Consent on record</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {campuses.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No campuses provisioned yet.</td>
                                </tr>
                            )}
                            {campuses.map((campus) => (
                                <tr key={campus.id} className="hover:bg-slate-900/50 transition-colors align-top">
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-white">{campus.name}</div>
                                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                            {campus.code}{campus.isActive ? '' : ' · suspended'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {campus.region ? (
                                            <span className="flex items-center gap-2 text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded-md w-max">
                                                <Server className="w-3 h-3" />
                                                {campus.region}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">No company record</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-xs">
                                        {campus.tier ?? <span className="text-muted-foreground">Unknown</span>}
                                    </td>
                                    <td className="px-6 py-4 text-xs">
                                        {campus.activeModules && campus.activeModules.length > 0 ? (
                                            <div className="flex flex-wrap gap-1 max-w-sm">
                                                {campus.activeModules.map((m) => (
                                                    <span key={m} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-muted-foreground font-mono">
                                                        {m}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground">Not recorded</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-xs">
                                        {campus.optedIn + campus.optedOut === 0 ? (
                                            <span className="text-muted-foreground">None captured</span>
                                        ) : (
                                            <span className="tabular-nums">
                                                <span className="text-emerald-400">{campus.optedIn} opted in</span>
                                                <span className="text-muted-foreground"> · </span>
                                                <span className="text-amber-400">{campus.optedOut} opted out</span>
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
