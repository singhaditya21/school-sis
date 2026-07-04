import React from 'react';
import { Card, Metric, Text, Flex, Grid, Title, BarChart, BadgeDelta, Color } from '@tremor/react';
import { getExecutiveFinancialMetrics } from '../../../lib/actions/executive-analytics';
import { getSession } from '@/lib/auth/session';
import { isTenantStaffRole } from '@/lib/auth/page-access';
import { redirect } from 'next/navigation';

// This is the "God-Mode" Executive Dashboard tailored for the School Principal / Board.

export default async function ExecutiveDashboardPage() {
  const session = await getSession();

  if (!session.isLoggedIn) {
    redirect('/login');
  }

  if (!isTenantStaffRole(session.role) || !session.tenantId) {
    redirect('/unauthorized');
  }

  // We fetch the highly optimized raw SQL aggregations from our server action
  const metrics = await getExecutiveFinancialMetrics(session.tenantId);

  // Formatting utilities
  const formatCurrency = (amount: number) => `$${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const chartData = [
    {
      name: 'Expected',
      Amount: metrics.totalExpectedFees / 100,
    },
    {
      name: 'Collected',
      Amount: metrics.totalCollectedFees / 100,
    },
    {
      name: 'Deficit',
      Amount: metrics.collectionDeficit / 100,
    },
  ];

  return (
    <main className="p-6 md:p-10 mx-auto max-w-7xl">
      <Title className="mb-6 text-3xl font-bold">Executive Overview</Title>
      <Text className="mb-8">Real-time financial and operational health of the institution.</Text>

      <Grid numItemsSm={1} numItemsLg={3} className="gap-6 mb-10">
        <Card decoration="top" decorationColor="blue">
          <Text>Total Expected Fees (YTD)</Text>
          <Metric>{formatCurrency(metrics.totalExpectedFees)}</Metric>
        </Card>
        
        <Card decoration="top" decorationColor="green">
          <Text>Total Collected</Text>
          <Metric>{formatCurrency(metrics.totalCollectedFees)}</Metric>
        </Card>

        <Card decoration="top" decorationColor="red">
          <Flex alignItems="start">
            <div>
              <Text>Current Deficit</Text>
              <Metric>{formatCurrency(metrics.collectionDeficit)}</Metric>
            </div>
            <BadgeDelta deltaType="moderateDecrease">Needs Attention</BadgeDelta>
          </Flex>
        </Card>
      </Grid>

      <Grid numItemsSm={1} numItemsLg={2} className="gap-6">
        <Card>
          <Title>Fee Collection Breakdown</Title>
          <BarChart
            className="mt-6 h-72"
            data={chartData}
            index="name"
            categories={["Amount"]}
            colors={["blue"]}
            valueFormatter={(number) => `$${Intl.NumberFormat('us').format(number).toString()}`}
            yAxisWidth={60}
          />
        </Card>
        
        <Card>
          <Title>30-Day Predictive Insights</Title>
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <Text className="font-medium text-gray-700">Predicted Revenue Recovery</Text>
              <Text className="text-xl font-bold text-green-600">{formatCurrency(metrics.thirtyDayRevenueForecast)}</Text>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <Text className="font-medium text-gray-700">Active Defaulters</Text>
              <Text className="text-xl font-bold text-red-600">{metrics.defaulterCount} Students</Text>
            </div>
            <p className="text-sm text-gray-500 mt-4">
              * The AI Copilot predicts recovering 80% of the active deficit within 30 days based on historical automated reminder conversion rates.
            </p>
          </div>
        </Card>
      </Grid>
    </main>
  );
}
