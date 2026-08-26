import React from 'react';
import { Card, Metric, Text, Flex, Grid, Title, BadgeDelta } from '@tremor/react';
import { FeeBreakdownChart } from './fee-breakdown-chart';
import { getExecutiveFinancialMetrics } from '@/lib/actions/executive-analytics';
import { getSession } from '@/lib/auth/session';
import { isTenantStaffRole } from '@/lib/auth/page-access';
import { formatCurrency } from '@/lib/utils';
import { redirect } from 'next/navigation';

// Executive fee position for the School Principal / Board.

export default async function ExecutiveDashboardPage() {
  const session = await getSession();

  if (!session.isLoggedIn) {
    redirect('/login');
  }

  if (!isTenantStaffRole(session.role) || !session.tenantId) {
    redirect('/unauthorized');
  }

  const metrics = await getExecutiveFinancialMetrics(session.tenantId);

  const collectionRate = metrics.totalExpectedFees > 0
    ? (metrics.totalCollectedFees / metrics.totalExpectedFees) * 100
    : 0;

  // Amounts from the action are already in rupees.
  const chartData = [
    { name: 'Expected', Amount: metrics.totalExpectedFees },
    { name: 'Collected', Amount: metrics.totalCollectedFees },
    { name: 'Outstanding', Amount: metrics.collectionDeficit },
  ];

  return (
    <main className="p-6 md:p-10 mx-auto max-w-7xl">
      <Title className="mb-6 text-3xl font-bold">Executive Overview</Title>
      <Text className="mb-8">Fee position across the institution, from billed invoices and recorded payments.</Text>

      <Grid numItemsSm={1} numItemsLg={3} className="gap-6 mb-10">
        <Card decoration="top" decorationColor="blue">
          <Text>Total Billed</Text>
          <Metric>{formatCurrency(metrics.totalExpectedFees)}</Metric>
        </Card>

        <Card decoration="top" decorationColor="green">
          <Text>Total Collected</Text>
          <Metric>{formatCurrency(metrics.totalCollectedFees)}</Metric>
          <Text className="mt-2">{collectionRate.toFixed(1)}% collection rate</Text>
        </Card>

        <Card decoration="top" decorationColor="red">
          <Flex alignItems="start">
            <div>
              <Text>Outstanding</Text>
              <Metric>{formatCurrency(metrics.collectionDeficit)}</Metric>
            </div>
            {metrics.collectionDeficit > 0 && (
              <BadgeDelta deltaType="moderateDecrease">Needs Attention</BadgeDelta>
            )}
          </Flex>
        </Card>
      </Grid>

      <Grid numItemsSm={1} numItemsLg={2} className="gap-6">
        <Card>
          <Title>Fee Collection Breakdown</Title>
          <FeeBreakdownChart data={chartData} />
        </Card>

        <Card>
          <Title>Past Due</Title>
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <Text className="font-medium text-gray-700">Overdue Balance</Text>
              <Text className="text-xl font-bold text-red-600">{formatCurrency(metrics.overdueBalance)}</Text>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <Text className="font-medium text-gray-700">Students With Dues</Text>
              <Text className="text-xl font-bold text-red-600">{metrics.defaulterCount}</Text>
            </div>
            <p className="text-sm text-gray-500 mt-4">
              Counts invoices whose due date has passed and which still carry a balance.
              Cancelled, waived and draft invoices are excluded.
            </p>
          </div>
        </Card>
      </Grid>
    </main>
  );
}
