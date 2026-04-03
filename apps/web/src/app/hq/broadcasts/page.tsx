import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { db, setTenantContext } from '@/lib/db';
import { platformBroadcasts } from '@/lib/db/schema/platform';
import { desc } from 'drizzle-orm';
import BroadcastsClient from './client-page';

export const metadata = {
    title: 'Global Broadcasts | ScholarMind HQ',
};

export default async function BroadcastsPage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await setTenantContext('platform');

    // Fetch active broadcasts
    const broadcastsList = await db
        .select()
        .from(platformBroadcasts)
        .orderBy(desc(platformBroadcasts.createdAt))
        .limit(20);

    return <BroadcastsClient broadcastsData={broadcastsList} />;
}
