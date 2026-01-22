'use server';

import { getSession } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

async function apiCall(endpoint: string, options: RequestInit = {}) {
    const session = await getSession();
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${session.token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    return response.json();
}

export async function submitAdmissionForm(data: {
    childName: string;
    parentName: string;
    parentPhone: string;
    parentEmail?: string;
    gradeId?: string;
    source?: string;
    notes?: string;
}) {
    try {
        const result = await apiCall('/api/v1/admissions/leads', {
            method: 'POST',
            body: JSON.stringify(data),
        });

        revalidatePath('/admissions');
        return { success: true, data: result };
    } catch (error) {
        console.error('[Forms] Error:', error);
        return { success: false, error: 'Failed to submit form' };
    }
}

export async function updateLeadStatus(leadId: string, status: string) {
    try {
        const result = await apiCall(`/api/v1/admissions/leads/${leadId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status }),
        });

        revalidatePath('/admissions');
        return { success: true, data: result };
    } catch (error) {
        console.error('[Forms] Error:', error);
        return { success: false, error: 'Failed to update status' };
    }
}
