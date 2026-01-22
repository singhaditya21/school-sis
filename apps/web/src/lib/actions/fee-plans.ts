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

export async function createFeePlan(data: {
    name: string;
    description?: string;
    academicYearId: string;
    components: {
        name: string;
        amount: number;
        frequency: string;
    }[];
}) {
    try {
        const result = await apiCall('/api/v1/fees/plans', {
            method: 'POST',
            body: JSON.stringify(data),
        });

        revalidatePath('/fees');
        return { success: true, data: result };
    } catch (error) {
        console.error('[FeePlans] Error:', error);
        return { success: false, error: 'Failed to create fee plan' };
    }
}

export async function generateInvoices(planId: string, studentIds?: string[]) {
    try {
        const result = await apiCall('/api/v1/fees/invoices/generate', {
            method: 'POST',
            body: JSON.stringify({ planId, studentIds }),
        });

        revalidatePath('/fees');
        revalidatePath('/invoices');
        return { success: true, data: result };
    } catch (error) {
        console.error('[FeePlans] Error:', error);
        return { success: false, error: 'Failed to generate invoices' };
    }
}
