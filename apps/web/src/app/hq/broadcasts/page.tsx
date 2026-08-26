import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { pool } from '@/lib/db';
import BroadcastsClient, { type BroadcastRow } from './client-page';

export const metadata = {
    title: 'Global Broadcasts | ScholarMind HQ',
};

export default async function BroadcastsPage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);

    const { rows } = await pool.query(
        `SELECT
            b.id,
            b.title,
            b.message,
            b.type,
            b.target_tiers AS "targetTiers",
            b.is_active    AS "isActive",
            b.expires_at   AS "expiresAt",
            b.created_at   AS "createdAt",
            u.email        AS "createdByEmail"
         FROM platform_broadcasts b
         LEFT JOIN users u ON u.id = b.created_by
         ORDER BY b.created_at DESC
         LIMIT 50`
    );

    return <BroadcastsClient broadcasts={rows as BroadcastRow[]} />;
}
