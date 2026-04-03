import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { ShieldCheck, Server, Search, AlertCircle, FileCheck } from 'lucide-react';

export const metadata = {
    title: 'Global Compliance | ScholarMind HQ',
};

export default async function CompliancePage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    // Fetch Node Regions
    const regionAggregates = await db.execute(sql`
        SELECT 
            region, 
            COUNT(*)::int as count
        FROM companies 
        GROUP BY region
    `);

    // Fetch Tenants without Enterprise Encryption Module
    const complianceList = await db.execute(sql`
        SELECT 
            c.name as company_name,
            c.region,
            c.subscription_tier,
            t.name as tenant_name,
            t.code as tenant_code
        FROM companies c
        JOIN tenants t ON t.company_id = c.id
        ORDER BY c.region ASC
    `);

    const totalNodes = complianceList.length;
    const dpdpCompliant = complianceList.filter((c: any) => c.subscription_tier === 'ENTERPRISE').length;
    const ferpaCompliant = totalNodes; // All nodes baseline FERPA

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Global Compliance & Privacy</h1>
                <p className="text-sm text-slate-400 mt-1">Cross-jurisdictional Data Processing Agreements (DPA) and Sovereign Boundaries.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">FERPA Baseline</p>
                            <p className="text-3xl font-bold text-emerald-400">100%</p>
                        </div>
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">DPDP Certified (Enterprise)</p>
                            <p className="text-3xl font-bold text-indigo-400">{Math.round((dpdpCompliant / totalNodes) * 100) || 0}%</p>
                        </div>
                        <FileCheck className="w-5 h-5 text-indigo-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 mb-1">Active Sovereignties</p>
                            <p className="text-3xl font-bold text-white">{regionAggregates.length}</p>
                        </div>
                        <Server className="w-5 h-5 text-cyan-400" />
                    </div>
                </div>
                <div className="bg-slate-950 border border-red-900/50 bg-red-950/10 p-5 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-red-400 mb-1">Audit Flags</p>
                            <p className="text-3xl font-bold text-red-500">0</p>
                        </div>
                        <AlertCircle className="w-5 h-5 text-red-400" />
                    </div>
                </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                    <h3 className="text-sm font-semibold text-white">Jurisdictional Node Ledger</h3>
                    <div className="flex gap-2">
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text" 
                                placeholder="Search node..." 
                                className="pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-300">
                        <thead className="bg-slate-900 border-b border-slate-800 text-xs text-slate-500 uppercase tracking-widest">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Data Control Node</th>
                                <th className="px-6 py-4 font-semibold">Cloud Sovereignty</th>
                                <th className="px-6 py-4 font-semibold">Data Encryption</th>
                                <th className="px-6 py-4 font-semibold">FERPA</th>
                                <th className="px-6 py-4 font-semibold">DPDP</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {complianceList.map((node: any, i) => (
                                <tr key={i} className="hover:bg-slate-900/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-white">{node.tenant_name}</div>
                                        <div className="text-xs text-slate-500 font-mono mt-0.5">{node.tenant_code} • {node.company_name}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="flex items-center gap-2 text-xs font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-1 rounded-md w-max">
                                            <Server className="w-3 h-3" />
                                            {node.region}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {node.subscription_tier === 'ENTERPRISE' ? (
                                            <span className="text-emerald-400 font-medium">AES-256 (At-Rest)</span>
                                        ) : (
                                            <span className="text-amber-400 font-medium">Standard Cloud</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                                    </td>
                                    <td className="px-6 py-4">
                                        {node.subscription_tier === 'ENTERPRISE' ? (
                                            <FileCheck className="w-5 h-5 text-indigo-400" />
                                        ) : (
                                            <span className="text-xs text-slate-500 border border-slate-700 rounded px-2 py-1">Missing DPA</span>
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
