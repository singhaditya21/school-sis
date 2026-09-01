import Link from 'next/link';
import { Building, Users, TrendingUp, AlertTriangle, Layers } from 'lucide-react';
import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { formatCurrency } from '@/lib/utils';

export const metadata = {
    title: 'Global Command Center | ScholarMind HQ',
};

interface FleetRow {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
    tier: string;
    adminEmail: string | null;
    groupName: string | null;
    groupRegion: string | null;
    activeStudents: number;
    billed: number;
    collected: number;
    overdue: number;
}

export default async function HQDashboardPage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const { rows } = await pool.query(
        `SELECT
            t.id,
            t.name,
            t.code,
            t.is_active AS "isActive",
            COALESCE(c.subscription_tier::text, 'CORE') AS tier,
            (SELECT u.email FROM users u WHERE u.tenant_id = t.id AND u.role = 'SUPER_ADMIN' LIMIT 1) AS "adminEmail",
            g.name     AS "groupName",
            mch.region AS "groupRegion",
            COALESCE(st.active_students, 0)::int AS "activeStudents",
            COALESCE(inv.billed, 0)::float8      AS billed,
            COALESCE(inv.collected, 0)::float8   AS collected,
            COALESCE(inv.overdue, 0)::float8     AS overdue
         FROM tenants t
         LEFT JOIN companies c ON c.id = t.company_id
         LEFT JOIN multi_campus_hierarchy mch ON mch.tenant_id = t.id
         LEFT JOIN hq_groups g ON g.id = mch.group_id
         LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS active_students
            FROM students s WHERE s.tenant_id = t.id AND s.status = 'ACTIVE'
         ) st ON TRUE
         LEFT JOIN LATERAL (
            SELECT
                SUM(i.total_amount) AS billed,
                SUM(i.paid_amount)  AS collected,
                SUM(
                    CASE
                        WHEN i.status NOT IN ('PAID', 'CANCELLED', 'WAIVED')
                             AND i.due_date < CURRENT_DATE
                        THEN i.total_amount - i.paid_amount
                        ELSE 0
                    END
                ) AS overdue
            FROM invoices i WHERE i.tenant_id = t.id
         ) inv ON TRUE
         ORDER BY t.name ASC`
    );

    const fleet = rows as FleetRow[];

    const totals = fleet.reduce(
        (acc, t) => ({
            campuses: acc.campuses + 1,
            active: acc.active + (t.isActive ? 1 : 0),
            students: acc.students + t.activeStudents,
            billed: acc.billed + t.billed,
            collected: acc.collected + t.collected,
            overdue: acc.overdue + t.overdue,
        }),
        { campuses: 0, active: 0, students: 0, billed: 0, collected: 0, overdue: 0 },
    );

    const outstanding = Math.max(totals.billed - totals.collected, 0);
    const collectionRate = totals.billed > 0 ? (totals.collected / totals.billed) * 100 : null;
    const groupedCount = fleet.filter((t) => t.groupName !== null).length;

    return (
        <div className="space-y-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">Global Command Center</h1>
                    <p className="text-muted-foreground mt-1">Every campus on the platform, and how its fee ledger is performing.</p>
                </div>
                <Link
                    href="/hq/treasury"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                    Open cross-campus finance
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Kpi
                    label="Campuses"
                    value={String(totals.campuses)}
                    hint={`${totals.active} active`}
                    icon={<Building className="w-4 h-4 text-muted-foreground" />}
                />
                <Kpi
                    label="Active students"
                    value={totals.students.toLocaleString('en-IN')}
                    hint="Enrolment across all campuses"
                    icon={<Users className="w-4 h-4 text-muted-foreground" />}
                />
                <Kpi
                    label="Fees collected"
                    value={formatCurrency(totals.collected)}
                    hint={`of ${formatCurrency(totals.billed)} billed`}
                    tone="emerald"
                    icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                />
                <Kpi
                    label="Outstanding"
                    value={formatCurrency(outstanding)}
                    hint={collectionRate === null ? 'Nothing billed yet' : `${collectionRate.toFixed(1)}% collected`}
                    tone="amber"
                    icon={<Layers className="w-4 h-4 text-amber-400" />}
                />
                <Kpi
                    label="Overdue"
                    value={formatCurrency(totals.overdue)}
                    hint="Past due date, unpaid"
                    tone="rose"
                    icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
                />
            </div>

            <p className="text-xs text-muted-foreground">
                Figures come from the campus fee ledger. Platform subscription revenue is billed outside this database and is
                not shown here.
                {groupedCount === 0
                    ? ' No campus is mapped to an HQ group yet, so nothing rolls up by region.'
                    : ` ${groupedCount} of ${totals.campuses} campuses are mapped to an HQ group.`}
            </p>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl text-slate-100">
                <div className="px-6 py-5 border-b border-slate-700">
                    <h2 className="text-lg font-semibold">Campus fleet</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-900/50 border-b border-slate-700 text-xs text-muted-foreground uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-4">Campus</th>
                                <th className="px-6 py-4">Group</th>
                                <th className="px-6 py-4">Tier</th>
                                <th className="px-6 py-4 text-right">Students</th>
                                <th className="px-6 py-4 text-right">Collected</th>
                                <th className="px-6 py-4 text-right">Overdue</th>
                                <th className="px-6 py-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {fleet.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">No campuses provisioned yet.</td>
                                </tr>
                            )}
                            {fleet.map((t) => (
                                <tr key={t.id} className="hover:bg-slate-800/80 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-white">{t.name}</div>
                                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                            {t.code}{t.adminEmail ? ` · ${t.adminEmail}` : ''}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs">
                                        {t.groupName ? (
                                            <>
                                                <div className="text-slate-200">{t.groupName}</div>
                                                <div className="text-muted-foreground mt-0.5">{t.groupRegion}</div>
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground">Unassigned</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                            t.tier === 'ENTERPRISE' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                            t.tier === 'AI_PRO' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                                            'bg-slate-500/10 text-muted-foreground border-slate-500/20'
                                        }`}>
                                            {t.tier}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right tabular-nums">{t.activeStudents.toLocaleString('en-IN')}</td>
                                    <td className="px-6 py-4 text-right tabular-nums text-emerald-400">{formatCurrency(t.collected)}</td>
                                    <td className="px-6 py-4 text-right tabular-nums text-rose-400">{formatCurrency(t.overdue)}</td>
                                    <td className="px-6 py-4">
                                        <span className={`flex items-center gap-1.5 ${t.isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            <span className={`w-2 h-2 rounded-full ${t.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                            {t.isActive ? 'ACTIVE' : 'SUSPENDED'}
                                        </span>
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

function Kpi({
    label, value, hint, icon, tone,
}: {
    label: string;
    value: string;
    hint: string;
    icon: React.ReactNode;
    tone?: 'emerald' | 'amber' | 'rose';
}) {
    const valueTone =
        tone === 'emerald' ? 'text-emerald-400' :
        tone === 'amber' ? 'text-amber-400' :
        tone === 'rose' ? 'text-rose-400' : 'text-white';

    return (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <span className="shrink-0">{icon}</span>
            </div>
            <p className={`text-2xl font-bold tabular-nums mt-2 ${valueTone}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{hint}</p>
        </div>
    );
}
