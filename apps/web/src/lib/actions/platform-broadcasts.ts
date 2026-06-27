'use server';

import { requireRole } from '@/lib/auth/middleware';
import { pool } from '@/lib/db';
import { UserRole } from '@/lib/rbac/permissions';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export async function createBroadcastAction(formData: FormData) {
    await requireRole(UserRole.PLATFORM_ADMIN);

    const title = formData.get('title') as string;
    const message = formData.get('message') as string;
    const type = formData.get('type') as string || 'INFO';

    if (!title || !message) {
        return { error: 'Title and message are required.' };
    }

    const session = await getSession();

    try {
        await pool.query(
            `INSERT INTO platform_broadcasts (title, message, type, is_active, created_by)
             VALUES ($1, $2, $3, $4, $5)`,
            [title, message, type, true, session.userId]
        );

        revalidatePath('/hq/broadcasts');
        return { success: true };
    } catch (e: any) {
        console.error('Broadcast creation failed:', e);
        return { error: 'Failed to create broadcast.' };
    }
}
