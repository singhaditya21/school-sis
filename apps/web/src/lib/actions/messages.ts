'use server';

import { getSession } from '@/lib/auth/session';
import { MessagingService } from '@/lib/services/messaging/messaging.service';
import { MessageChannel } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const sendReminderSchema = z.object({
    templateId: z.string().uuid(),
    channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP']),
    guardianIds: z.array(z.string().uuid()),
});

export async function sendRemindersAction(formData: FormData) {
    const session = await getSession();
    if (!session.isLoggedIn || !session.tenantId) {
        return { error: 'Unauthorized' };
    }

    const data = {
        templateId: formData.get('templateId') as string,
        channel: formData.get('channel') as string,
        guardianIds: JSON.parse(formData.get('guardianIds') as string),
    };

    const validation = sendReminderSchema.safeParse(data);
    if (!validation.success) {
        return { error: validation.error.errors[0].message };
    }

    try {
        // Build recipients with variables
        const recipients = data.guardianIds.map((guardianId) => ({
            guardianId,
            variables: {
                school_name: 'School Name',
                student_name: 'Student',
                amount: '₹5000',
                due_date: new Date().toLocaleDateString('en-IN'),
            },
        }));

        const results = await MessagingService.sendBulk({
            tenantId: session.tenantId,
            recipients,
            templateId: data.templateId,
            channel: data.channel as MessageChannel,
        });

        const successCount = results.filter((r) => r.success).length;
        const failedCount = results.length - successCount;

        revalidatePath('/admin/messages/logs');

        return {
            success: true,
            message: `Sent ${successCount} reminders, ${failedCount} failed`,
            results,
        };
    } catch (error) {
        console.error('[Send Reminders]', error);
        return {
            error: error instanceof Error ? error.message : 'Failed to send reminders',
        };
    }
}
