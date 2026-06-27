import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { pool, } from '@/lib/db';
import BroadcastsClient from './client-page';

export const metadata = {
    title: 'Global Broadcasts | ScholarMind HQ',
};

export default async function BroadcastsPage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    await ('platform');

    // Fetch active broadcasts
    const { rows: broadcastsList } = await pool.query(
        `SELECT *, created_at AS "createdAt", updated_at AS "updatedAt" FROM platform_broadcasts ORDER BY created_at DESC LIMIT 20`
    );

    return <BroadcastsClient broadcastsData={broadcastsList} />;
}
