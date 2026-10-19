import React from 'react';
import { getExecutiveFinancialMetrics } from '@/lib/actions/executive-analytics';
import { getAllMetadataObjects } from '@/lib/actions/metadata-engine';
import { getSession } from '@/lib/auth/session';
import { isTenantStaffRole } from '@/lib/auth/page-access';
import { redirect } from 'next/navigation';
import { ExecutiveDashboardClient } from './executive-dashboard-client';

// Executive fee position & drag-and-drop dashboard builder for the School Principal / Board.

export default async function ExecutiveDashboardPage() {
  const session = await getSession();

  if (!session.isLoggedIn) {
    redirect('/login');
  }

  if (!isTenantStaffRole(session.role) || !session.tenantId) {
    redirect('/unauthorized');
  }

  const [metrics, allObjects] = await Promise.all([
    getExecutiveFinancialMetrics(session.tenantId),
    getAllMetadataObjects().catch(() => []),
  ]);

  const customObjects = allObjects.map(obj => ({
    id: String(obj.id),
    apiName: String(obj.api_name),
    name: String(obj.plural_label || obj.label),
    isCustom: !obj.is_system,
  }));

  return (
    <ExecutiveDashboardClient
      metrics={metrics}
      customObjects={customObjects}
    />
  );
}

