import {
  RLS_BYPASS_JUSTIFICATIONS,
  runWithRlsBypass,
  runWithTenantContext,
  sql,
} from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { isDemoSession, isDemoTenantId } from '@/lib/tenant/demo-guard';

export interface ExecutiveFinancialMetrics {
  /** Rupees. Sum of billed invoices that are still expected to be collected. */
  totalExpectedFees: number;
  /** Rupees. Sum already received against those invoices. */
  totalCollectedFees: number;
  /** Rupees. Expected minus collected. */
  collectionDeficit: number;
  /** Rupees. Outstanding balance whose due date has already passed. */
  overdueBalance: number;
  /** Distinct students carrying a past-due balance. */
  defaulterCount: number;
}

export interface CampusBenchmarkItem {
  tenantId: string;
  campusName: string;
  campusCode: string;
  city: string | null;
  board: string;
  isCurrentCampus: boolean;
  activeStudents: number;
  expectedFees: number;
  collectedFees: number;
  overdueBalance: number;
  defaulterCount: number;
  collectionRate: number;
  attendanceRate: number | null;
  activeLeads: number;
  enrolledLeads: number;
  healthStatus: 'EXEMPLARY' | 'HEALTHY' | 'INTERVENTION';
}

export interface MultiCampusGroupRollup {
  companyId: string | null;
  companyName: string;
  subscriptionTier: string;
  totalCampuses: number;
  totalStudents: number;
  groupExpectedFees: number;
  groupCollectedFees: number;
  groupOverdueBalance: number;
  groupDefaulterCount: number;
  groupCollectionRate: number;
  groupActiveLeads: number;
  campuses: CampusBenchmarkItem[];
}

/**
 * High-level fee position for the executive dashboard.
 *
 * Amounts are numeric(12,2) rupees in the database — NOT minor units — and are
 * returned in rupees. Do not divide by 100 at the call site.
 *
 * Overdue is derived from due_date and the outstanding balance rather than from
 * `status = 'OVERDUE'`, because nothing continuously re-stamps that status; a
 * status-based count silently under-reports whenever the job runner is behind.
 */
export async function getExecutiveFinancialMetrics(tenantId: string): Promise<ExecutiveFinancialMetrics> {
  return runWithTenantContext(tenantId, async () => {
    const [totalsRows, overdueRows] = await Promise.all([
      sql<{ expected: string; collected: string }>`
        SELECT
          COALESCE(SUM(total_amount), 0) AS expected,
          COALESCE(SUM(paid_amount), 0)  AS collected
        FROM invoices
        WHERE tenant_id = ${tenantId}
          AND status NOT IN ('CANCELLED', 'WAIVED', 'DRAFT')
      `.rows(),
      sql<{ overdue_balance: string; defaulter_count: string }>`
        SELECT
          COALESCE(SUM(total_amount - paid_amount), 0) AS overdue_balance,
          COUNT(DISTINCT student_id)                   AS defaulter_count
        FROM invoices
        WHERE tenant_id = ${tenantId}
          AND status NOT IN ('CANCELLED', 'WAIVED', 'DRAFT')
          AND due_date < CURRENT_DATE
          AND total_amount > paid_amount
      `.rows(),
    ]);

    const expected = Number(totalsRows[0].expected);
    const collected = Number(totalsRows[0].collected);

    return {
      totalExpectedFees: expected,
      totalCollectedFees: collected,
      collectionDeficit: expected - collected,
      overdueBalance: Number(overdueRows[0].overdue_balance),
      defaulterCount: Number(overdueRows[0].defaulter_count),
    };
  });
}

export function classifyCampusHealth(input: {
  collectionRate: number;
  overdueBalance: number;
  expectedFees: number;
  attendanceRate: number | null;
}): 'EXEMPLARY' | 'HEALTHY' | 'INTERVENTION' {
  if (input.expectedFees === 0) return 'HEALTHY';
  const overdueRatio = input.overdueBalance / input.expectedFees;
  if (input.collectionRate < 55 || overdueRatio > 0.35) {
    return 'INTERVENTION';
  }
  if (
    input.collectionRate >= 80 &&
    overdueRatio <= 0.15 &&
    (input.attendanceRate === null || input.attendanceRate >= 90)
  ) {
    return 'EXEMPLARY';
  }
  return 'HEALTHY';
}

const MULTI_CAMPUS_EXECUTIVE_ROLES = new Set<string>([
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
  'GROUP_EXECUTIVE',
]);

async function assertMultiCampusRollupAccess(tenantId: string): Promise<void> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId || !session.tenantId) {
    throw new Error('Unauthorized: Not logged in');
  }
  const role = session.role;
  if (role !== 'PLATFORM_ADMIN' && session.tenantId !== tenantId) {
    throw new Error('Forbidden: Cross-tenant executive rollup is not permitted.');
  }
  if (MULTI_CAMPUS_EXECUTIVE_ROLES.has(role)) {
    return;
  }
  const demoMode = isDemoSession(session) || (await isDemoTenantId(tenantId));
  if (demoMode && (role === 'FINANCE_LEAD' || role === 'SCHOOL_ADMIN')) {
    return;
  }
  throw new Error(
    'Forbidden: Multi-campus group rollup is restricted to Group Executives and Super Administrators.',
  );
}

/**
 * Aggregates institutional KPIs across all active campuses belonging strictly to
 * the caller's `company_id` (school group / educational trust).
 */
export async function getMultiCampusGroupRollup(tenantId: string): Promise<MultiCampusGroupRollup> {
  await assertMultiCampusRollupAccess(tenantId);

  const anchor = await runWithRlsBypass(
    RLS_BYPASS_JUSTIFICATIONS.COMPANY_GROUP_ROLLUP,
    async () => {
      const rows = await sql<{
        tenantId: string;
        tenantName: string;
        companyId: string | null;
        companyName: string | null;
        subscriptionTier: string | null;
      }>`
        SELECT
          t.id AS "tenantId",
          t.name AS "tenantName",
          t.company_id AS "companyId",
          c.name AS "companyName",
          c.subscription_tier AS "subscriptionTier"
        FROM tenants t
        LEFT JOIN companies c ON c.id = t.company_id
        WHERE t.id = ${tenantId}
        LIMIT 1
      `;
      return rows[0] ?? null;
    },
  );

  if (!anchor) {
    return {
      companyId: null,
      companyName: 'Institutional Trust',
      subscriptionTier: 'CORE',
      totalCampuses: 0,
      totalStudents: 0,
      groupExpectedFees: 0,
      groupCollectedFees: 0,
      groupOverdueBalance: 0,
      groupDefaulterCount: 0,
      groupCollectionRate: 0,
      groupActiveLeads: 0,
      campuses: [],
    };
  }

  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

  return runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.COMPANY_GROUP_ROLLUP, async () => {
    const scopeFilter = anchor.companyId
      ? sql`t.company_id = ${anchor.companyId} AND t.is_active = true`
      : sql`t.id = ${tenantId}`;

    const campusRows = await sql<{
      tenantId: string;
      campusName: string;
      campusCode: string;
      city: string | null;
      board: string | null;
      activeStudents: number;
      expectedFees: string;
      collectedFees: string;
      overdueBalance: string;
      defaulterCount: number;
      presentOrLate: number;
      markedDays: number;
      activeLeads: number;
      enrolledLeads: number;
    }>`
      SELECT
        t.id AS "tenantId",
        t.name AS "campusName",
        t.code AS "campusCode",
        t.city,
        t.affiliation_board AS "board",
        COALESCE((
          SELECT COUNT(*)::int
          FROM students s
          WHERE s.tenant_id = t.id AND s.status = 'ACTIVE'
        ), 0) AS "activeStudents",
        COALESCE((
          SELECT SUM(i.total_amount)
          FROM invoices i
          WHERE i.tenant_id = t.id AND i.status NOT IN ('CANCELLED', 'WAIVED', 'DRAFT')
        ), 0)::text AS "expectedFees",
        COALESCE((
          SELECT SUM(i.paid_amount)
          FROM invoices i
          WHERE i.tenant_id = t.id AND i.status NOT IN ('CANCELLED', 'WAIVED', 'DRAFT')
        ), 0)::text AS "collectedFees",
        COALESCE((
          SELECT SUM(i.total_amount - i.paid_amount)
          FROM invoices i
          WHERE i.tenant_id = t.id
            AND i.status NOT IN ('CANCELLED', 'WAIVED', 'DRAFT')
            AND i.due_date < CURRENT_DATE
            AND i.total_amount > i.paid_amount
        ), 0)::text AS "overdueBalance",
        COALESCE((
          SELECT COUNT(DISTINCT i.student_id)::int
          FROM invoices i
          WHERE i.tenant_id = t.id
            AND i.status NOT IN ('CANCELLED', 'WAIVED', 'DRAFT')
            AND i.due_date < CURRENT_DATE
            AND i.total_amount > i.paid_amount
        ), 0) AS "defaulterCount",
        COALESCE((
          SELECT COUNT(*) FILTER (WHERE ar.status IN ('PRESENT', 'LATE'))::int
          FROM attendance_records ar
          WHERE ar.tenant_id = t.id AND ar.date >= ${monthStart}::date
        ), 0) AS "presentOrLate",
        COALESCE((
          SELECT COUNT(*) FILTER (WHERE ar.status <> 'HOLIDAY')::int
          FROM attendance_records ar
          WHERE ar.tenant_id = t.id AND ar.date >= ${monthStart}::date
        ), 0) AS "markedDays",
        COALESCE((
          SELECT COUNT(*)::int
          FROM admission_leads al
          WHERE al.tenant_id = t.id AND al.stage NOT IN ('ENROLLED', 'REJECTED', 'WITHDRAWN')
        ), 0) AS "activeLeads",
        COALESCE((
          SELECT COUNT(*)::int
          FROM admission_leads al
          WHERE al.tenant_id = t.id AND al.stage = 'ENROLLED'
        ), 0) AS "enrolledLeads"
      FROM tenants t
      WHERE ${scopeFilter}
      ORDER BY (t.id = ${tenantId}) DESC, t.created_at ASC
    `;

    const campuses: CampusBenchmarkItem[] = campusRows.map((row) => {
      const expected = Number(row.expectedFees || 0);
      const collected = Number(row.collectedFees || 0);
      const overdue = Number(row.overdueBalance || 0);
      const collectionRate = expected > 0 ? Math.round((collected / expected) * 1000) / 10 : 0;
      const attendanceRate =
        row.markedDays > 0 ? Math.round((row.presentOrLate / row.markedDays) * 1000) / 10 : null;

      return {
        tenantId: row.tenantId,
        campusName: row.campusName,
        campusCode: row.campusCode,
        city: row.city,
        board: row.board || 'CBSE',
        isCurrentCampus: row.tenantId === tenantId,
        activeStudents: Number(row.activeStudents || 0),
        expectedFees: expected,
        collectedFees: collected,
        overdueBalance: overdue,
        defaulterCount: Number(row.defaulterCount || 0),
        collectionRate,
        attendanceRate,
        activeLeads: Number(row.activeLeads || 0),
        enrolledLeads: Number(row.enrolledLeads || 0),
        healthStatus: classifyCampusHealth({
          collectionRate,
          overdueBalance: overdue,
          expectedFees: expected,
          attendanceRate,
        }),
      };
    });

    const totalStudents = campuses.reduce((sum, c) => sum + c.activeStudents, 0);
    const groupExpectedFees = campuses.reduce((sum, c) => sum + c.expectedFees, 0);
    const groupCollectedFees = campuses.reduce((sum, c) => sum + c.collectedFees, 0);
    const groupOverdueBalance = campuses.reduce((sum, c) => sum + c.overdueBalance, 0);
    const groupDefaulterCount = campuses.reduce((sum, c) => sum + c.defaulterCount, 0);
    const groupActiveLeads = campuses.reduce((sum, c) => sum + c.activeLeads, 0);
    const groupCollectionRate =
      groupExpectedFees > 0 ? Math.round((groupCollectedFees / groupExpectedFees) * 1000) / 10 : 0;

    return {
      companyId: anchor.companyId,
      companyName: anchor.companyName || anchor.tenantName,
      subscriptionTier: anchor.subscriptionTier || 'CORE',
      totalCampuses: campuses.length,
      totalStudents,
      groupExpectedFees,
      groupCollectedFees,
      groupOverdueBalance,
      groupDefaulterCount,
      groupCollectionRate,
      groupActiveLeads,
      campuses,
    };
  });
}
