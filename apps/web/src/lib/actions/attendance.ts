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

export async function markAttendance(classId: string, date: string, records: {
    studentId: string;
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
    remarks?: string;
}[]) {
    try {
        const result = await apiCall('/api/v1/attendance/bulk', {
            method: 'POST',
            body: JSON.stringify({ classId, date, records }),
        });

        revalidatePath('/attendance');
        return { success: true, data: result };
    } catch (error) {
        console.error('[Attendance] Error:', error);
        return { success: false, error: 'Failed to mark attendance' };
    }
}

export async function getAttendanceForClass(classId: string, date: string) {
    try {
        const result = await apiCall(`/api/v1/attendance/class/${classId}?date=${date}`);
        return { success: true, data: result.data || [] };
    } catch (error) {
        console.error('[Attendance] Error:', error);
        return { success: false, error: 'Failed to fetch attendance', data: [] };
    }
}
