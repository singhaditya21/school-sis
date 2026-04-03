'use server';

import { db, setTenantContext } from '@/lib/db';
import { marketingLeads } from '@/lib/db/schema/platform';

export async function captureLeadAction(formData: FormData) {
    try {
        await setTenantContext('platform');

        const contactName = formData.get('contactName') as string;
        const contactEmail = formData.get('contactEmail') as string;
        const schoolName = formData.get('schoolName') as string;
        const studentCapacityRaw = formData.get('studentCapacity') as string;
        const painPoints = formData.get('painPoints') as string;

        if (!contactName || !contactEmail || !schoolName || !studentCapacityRaw) {
            return { error: 'All primary fields are required.' };
        }

        const studentCapacity = parseInt(studentCapacityRaw, 10);
        if (isNaN(studentCapacity) || studentCapacity < 1) {
            return { error: 'Invalid student capacity.' };
        }

        await db.insert(marketingLeads).values({
            contactName,
            contactEmail,
            schoolName,
            studentCapacity,
            painPoints: painPoints || null,
            status: 'NEW',
        });

        return { success: true };
    } catch (error) {
        console.error('Lead Capture Error:', error);
        return { error: 'Failed to submit application. Please try again or email sales directly.' };
    }
}
