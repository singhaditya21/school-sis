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

    // Fetch active broadcasts
    const { rows: broadcastsList } = await pool.query(
        `SELECT id, title, message, target_tiers AS "targetTiers", target_modules AS "targetModules", is_active AS "isActive", type, expires_at AS "expiresAt", created_at AS "createdAt", created_by AS "createdBy" FROM platform_broadcasts ORDER BY created_at DESC LIMIT 20`
    );

    return <BroadcastsClient broadcastsData={broadcastsList} />;
}
