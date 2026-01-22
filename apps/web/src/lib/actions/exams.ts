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

export async function createExam(data: {
    name: string;
    type: string;
    termId: string;
    startDate: string;
    endDate: string;
    maxMarks: number;
}) {
    try {
        const result = await apiCall('/api/v1/exams', {
            method: 'POST',
            body: JSON.stringify(data),
        });

        revalidatePath('/exams');
        return { success: true, data: result };
    } catch (error) {
        console.error('[Exams] Error:', error);
        return { success: false, error: 'Failed to create exam' };
    }
}

export async function saveMarks(examId: string, marks: {
    studentId: string;
    subjectId: string;
    marksObtained: number;
}[]) {
    try {
        const result = await apiCall(`/api/v1/exams/${examId}/marks`, {
            method: 'POST',
            body: JSON.stringify(marks),
        });

        revalidatePath('/exams');
        return { success: true, data: result };
    } catch (error) {
        console.error('[Exams] Error:', error);
        return { success: false, error: 'Failed to save marks' };
    }
}

export async function getExamMarks(examId: string, classId: string) {
    try {
        const result = await apiCall(`/api/v1/exams/${examId}/marks/class/${classId}`);
        return { success: true, data: result.data || [] };
    } catch (error) {
        console.error('[Exams] Error:', error);
        return { success: false, error: 'Failed to fetch marks', data: [] };
    }
}
