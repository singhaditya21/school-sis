import React from 'react';
import {
  getExecutiveFinancialMetrics,
  getMultiCampusGroupRollup,
} from '@/lib/actions/executive-analytics';
import { getAllMetadataObjects } from '@/lib/actions/metadata-engine';
import { requireAuth } from '@/lib/auth/middleware';
import { isTenantStaffRole } from '@/lib/auth/page-access';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import { redirect } from 'next/navigation';
import { ExecutiveDashboardClient } from './executive-dashboard-client';

// Executive fee position, Multi-Campus Trust Rollup & drag-and-drop dashboard builder.

export default async function ExecutiveDashboardPage() {
  const auth = await requireAuth();
  const role = auth.session.role as UserRole;

  if (
    !isTenantStaffRole(role) ||
    !auth.tenantId ||
    (!hasPermission(role, 'fees:read') && !hasPermission(role, 'analytics:read'))
  ) {
    redirect('/unauthorized');
  }

  const [metrics, groupRollup, allObjects] = await Promise.all([
    getExecutiveFinancialMetrics(auth.tenantId),
    getMultiCampusGroupRollup(auth.tenantId),
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
