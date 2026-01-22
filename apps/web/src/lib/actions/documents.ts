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

export async function uploadDocument(leadId: string, data: {
    documentType: string;
    fileName: string;
    fileUrl: string;
}) {
    try {
        const result = await apiCall(`/api/v1/admissions/leads/${leadId}/documents`, {
            method: 'POST',
            body: JSON.stringify(data),
        });

        revalidatePath(`/admissions/${leadId}`);
        return { success: true, data: result };
    } catch (error) {
        console.error('[Documents] Error:', error);
        return { success: false, error: 'Failed to upload document' };
    }
}

export async function getDocuments(leadId: string) {
    try {
        const result = await apiCall(`/api/v1/admissions/leads/${leadId}/documents`);
        return { success: true, data: result.data || [] };
    } catch (error) {
        console.error('[Documents] Error:', error);
        return { success: false, error: 'Failed to fetch documents', data: [] };
    }
}
