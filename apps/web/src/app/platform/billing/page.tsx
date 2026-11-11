import { getPlatformBillingStats } from '@/lib/actions/platform';
import { PlatformBillingDashboardClient } from './billing-dashboard-client';

export default async function PlatformBillingPage() {
    const invoices = await getPlatformBillingStats();
    return <PlatformBillingDashboardClient invoices={invoices} />;
}
