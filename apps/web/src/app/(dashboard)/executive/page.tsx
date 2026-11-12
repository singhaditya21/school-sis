import React from 'react';
import {
  getExecutiveFinancialMetrics,
  getMultiCampusGroupRollup,
} from '@/lib/actions/executive-analytics';
import { getAllMetadataObjects } from '@/lib/actions/metadata-engine';
import { requireAuth } from '@/lib/auth/middleware';
import { getSession } from '@/lib/auth/session';
import { isTenantStaffRole } from '@/lib/auth/page-access';
import { UserRole } from '@/lib/rbac/permissions';
import { isDemoSession, isDemoTenantId } from '@/lib/tenant/demo-guard';
import { redirect } from 'next/navigation';
import { ExecutiveDashboardClient } from './executive-dashboard-client';

const MULTI_CAMPUS_EXECUTIVE_ROLES = new Set<string>([
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
  'GROUP_EXECUTIVE',
]);

const CAMPUS_EXECUTIVE_ROLES = new Set<string>([
  'PLATFORM_ADMIN',
  'SUPER_ADMIN',
  'GROUP_EXECUTIVE',
  'SCHOOL_ADMIN',
  'PRINCIPAL',
  'FINANCE_LEAD',
  'ACCOUNTANT',
]);

// Executive fee position, Multi-Campus Trust Rollup & drag-and-drop dashboard builder.

export default async function ExecutiveDashboardPage() {
  const auth = await requireAuth();
  const role = auth.session.role as UserRole;
  const fullSession = await getSession();
  const demoMode =
    isDemoSession(fullSession) || (await isDemoTenantId(auth.tenantId));
  const canViewMultiCampusRollup =
    MULTI_CAMPUS_EXECUTIVE_ROLES.has(role) ||
    (demoMode && (role === UserRole.FINANCE_LEAD || role === UserRole.SCHOOL_ADMIN));

  if (!isTenantStaffRole(role) || !auth.tenantId || !CAMPUS_EXECUTIVE_ROLES.has(role)) {
    redirect('/unauthorized');
  }

  const [metrics, groupRollup, allObjects] = await Promise.all([
    getExecutiveFinancialMetrics(auth.tenantId),
    canViewMultiCampusRollup
      ? getMultiCampusGroupRollup(auth.tenantId)
      : Promise.resolve(undefined),
    getAllMetadataObjects().catch(() => []),
  ]);

  const customObjects = allObjects.map((obj) => ({
    id: String(obj.id),
    apiName: String(obj.api_name),
    name: String(obj.plural_label || obj.label),
    isCustom: !obj.is_system,
  }));

  return (
    <ExecutiveDashboardClient
      metrics={metrics}
      groupRollup={groupRollup}
      customObjects={customObjects}
    />
  );
}
