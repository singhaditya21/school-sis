/**
 * Fee defaulter service - uses Java API.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface Defaulter {
    studentId: string;
    studentName: string;
    className: string;
    totalDue: number;
    overdueAmount: number;
    daysPastDue: number;
    parentPhone?: string;
}

export async function getDefaulters(token: string): Promise<Defaulter[]> {
    try {
        const response = await fetch(`${API_BASE}/api/v1/fees/defaulters`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        if (!response.ok) return [];

        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error('[Defaulter] API Error:', error);
        return [];
    }
}

export async function sendReminder(token: string, studentId: string, channel: 'SMS' | 'WHATSAPP' | 'EMAIL') {
    try {
        const response = await fetch(`${API_BASE}/api/v1/fees/reminders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ studentId, channel }),
        });

        return response.ok;
    } catch (error) {
        console.error('[Defaulter] API Error:', error);
        return false;
    }
}
