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

export async function recordPayment(invoiceId: string, data: {
    amount: number;
    paymentMethod: string;
    paymentDate: string;
    notes?: string;
}) {
    try {
        const result = await apiCall(`/api/v1/fees/invoices/${invoiceId}/payments`, {
            method: 'POST',
            body: JSON.stringify(data),
        });

        revalidatePath('/invoices');
        revalidatePath(`/invoices/${invoiceId}`);
        return { success: true, data: result };
    } catch (error) {
        console.error('[Fees] Error:', error);
        return { success: false, error: 'Failed to record payment' };
    }
}

export async function applyConcession(invoiceId: string, data: {
    amount: number;
    reason: string;
}) {
    try {
        const result = await apiCall(`/api/v1/fees/invoices/${invoiceId}/concession`, {
            method: 'POST',
            body: JSON.stringify(data),
        });

        revalidatePath('/invoices');
        revalidatePath(`/invoices/${invoiceId}`);
        return { success: true, data: result };
    } catch (error) {
        console.error('[Fees] Error:', error);
        return { success: false, error: 'Failed to apply concession' };
    }
}

export async function getInvoice(invoiceId: string) {
    try {
        const result = await apiCall(`/api/v1/fees/invoices/${invoiceId}`);
        return { success: true, data: result.data };
    } catch (error) {
        console.error('[Fees] Error:', error);
        return { success: false, error: 'Failed to fetch invoice' };
    }
}
