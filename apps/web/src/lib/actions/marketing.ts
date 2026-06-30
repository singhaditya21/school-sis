'use server';

import { pool, runWithRlsBypass } from '@/lib/db';

export async function captureLeadAction(formData: FormData) {
    try {
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

        await runWithRlsBypass(async () => {
            await pool.query(
                `INSERT INTO marketing_leads (
                    contact_name, contact_email, school_name, student_capacity, pain_points, status
                ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    contactName,
                    contactEmail,
                    schoolName,
                    studentCapacity,
                    painPoints || null,
                    'NEW'
                ]
            );
        });

        return { success: true };
    } catch (error) {
        console.error('Lead Capture Error:', error);
        return { error: 'Failed to submit application. Please try again or email sales directly.' };
    }
}
