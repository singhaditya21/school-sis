'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';

export interface BroadcastActionResult {
    success: boolean;
    error?: string;
}

const BROADCAST_TYPES = ['INFO', 'MAINTENANCE', 'WARNING', 'CRITICAL'] as const;
const TIERS = ['CORE', 'AI_PRO', 'ENTERPRISE'] as const;

export async function createBroadcastAction(input: {
    title: string;
    message: string;
    type: string;
    targetTiers: string[];
    expiresAt: string;
}): Promise<BroadcastActionResult> {
    const { session } = await requireRole(UserRole.PLATFORM_ADMIN);

    const title = input.title.trim();
    const message = input.message.trim();

    if (!title || !message) {
        return { success: false, error: 'Title and message are both required.' };
    }
    if (title.length > 255) {
        return { success: false, error: 'Title must be 255 characters or fewer.' };
    }
    if (!BROADCAST_TYPES.includes(input.type as (typeof BROADCAST_TYPES)[number])) {
        return { success: false, error: 'Unknown broadcast type.' };
    }

    const tiers = input.targetTiers.filter((t) => TIERS.includes(t as (typeof TIERS)[number]));
    // An empty selection means every tier — stored as NULL, which is what the
    // tenant-side ticker treats as "no tier filter".
    const targetTiers = tiers.length === 0 || tiers.length === TIERS.length ? null : tiers;

    let expiresAt: Date | null = null;
    if (input.expiresAt) {
        const parsed = new Date(input.expiresAt);
        if (Number.isNaN(parsed.getTime())) {
            return { success: false, error: 'Expiry date is not a valid date.' };
        }
        expiresAt = parsed;
    }

    await pool.query(
        `INSERT INTO platform_broadcasts (title, message, type, target_tiers, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, (SELECT id FROM users WHERE id = $6))`,
        [title, message, input.type, targetTiers, expiresAt, session.userId ?? null],
    );

    revalidatePath('/hq/broadcasts');

    return { success: true };
}

export async function setBroadcastActiveAction(input: {
    broadcastId: string;
    isActive: boolean;
}): Promise<BroadcastActionResult> {
    await requireRole(UserRole.PLATFORM_ADMIN);

    if (!input.broadcastId) {
        return { success: false, error: 'Missing broadcast.' };
    }

    await pool.query(
        `UPDATE platform_broadcasts SET is_active = $1 WHERE id = $2`,
        [input.isActive, input.broadcastId],
    );

    revalidatePath('/hq/broadcasts');

    return { success: true };
}
