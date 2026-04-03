import { getAllPlatformTenants, getGlobalPlatformStats } from '@/lib/actions/platform';
import TenantsClient from './client-page';

export const metadata = {
    title: 'Campus Management | ScholarMind HQ',
};

export default async function CampusManagementPage() {
    const tenants = await getAllPlatformTenants();
    const stats = await getGlobalPlatformStats();

    return <TenantsClient initialTenants={tenants} stats={stats} />;
}
