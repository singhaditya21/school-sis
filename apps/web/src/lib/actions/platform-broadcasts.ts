'use server';

import { requireRole } from '@/lib/auth/middleware';
import { db, setTenantContext } from '@/lib/db';
import { UserRole } from '@/lib/rbac/permissions';
import { platformBroadcasts } from '@/lib/db/schema/platform';
import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

export async function createBroadcastAction(formData: FormData) {
    await requireRole(UserRole.PLATFORM_ADMIN);
    await setTenantContext('platform');

    const title = formData.get('title') as string;
    const message = formData.get('message') as string;
    const type = formData.get('type') as string || 'INFO';

    if (!title || !message) {
        return { error: 'Title and message are required.' };
    }

    const session = await getSession();

    try {
        await db.insert(platformBroadcasts).values({
            title,
            message,
            type,
            isActive: true,
            createdBy: session.userId,
        });

        revalidatePath('/hq/broadcasts');
        return { success: true };
    } catch (e: any) {
        console.error('Broadcast creation failed:', e);
        return { error: 'Failed to create broadcast.' };
    }
}
