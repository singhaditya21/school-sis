/**
 * Fee engine service - uses Java API.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface FeeCalculation {
    studentId: string;
    planId: string;
    totalAmount: number;
    components: {
        name: string;
        amount: number;
        frequency: string;
    }[];
    discounts: {
        type: string;
        amount: number;
    }[];
    finalAmount: number;
}

export async function calculateFees(token: string, studentId: string, planId: string): Promise<FeeCalculation | null> {
    try {
        const response = await fetch(`${API_BASE}/api/v1/fees/calculate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ studentId, planId }),
        });

        if (!response.ok) return null;

        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error('[FeeEngine] API Error:', error);
        return null;
    }
}

export async function getStudentFeeHistory(token: string, studentId: string) {
    try {
        const response = await fetch(`${API_BASE}/api/v1/fees/invoices/student/${studentId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) return [];

        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error('[FeeEngine] API Error:', error);
        return [];
    }
}
