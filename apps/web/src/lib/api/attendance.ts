/**
 * Attendance API service.
 */
import { api, type ApiResponse } from './client';
import type { AttendanceRecord, UUID } from './types';

export const attendanceApi = {
    /**
     * Get attendance for a class on a date.
     */
    async getByClassAndDate(classId: UUID, date: string): Promise<ApiResponse<AttendanceRecord[]>> {
        return api.get<AttendanceRecord[]>(`/api/v1/attendance/class/${classId}`, { date });
    },

    /**
     * Get attendance for a student.
     */
    async getByStudent(studentId: UUID, month?: string): Promise<ApiResponse<AttendanceRecord[]>> {
        const params: Record<string, string> = {};
        if (month) params.month = month;
        return api.get<AttendanceRecord[]>(`/api/v1/attendance/student/${studentId}`, params);
    },

    /**
     * Mark attendance for multiple students.
     */
    async markBulk(classId: UUID, date: string, records: {
        studentId: UUID;
        status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
        remarks?: string;
    }[]): Promise<ApiResponse<AttendanceRecord[]>> {
        return api.post<AttendanceRecord[]>('/api/v1/attendance/bulk', {
            classId,
            date,
            records,
        });
    },

    /**
     * Get attendance summary/stats.
     */
    async getSummary(classId?: UUID): Promise<ApiResponse<{
        present: number;
        absent: number;
        late: number;
        attendanceRate: number;
    }>> {
        const params = classId ? { classId } : undefined;
        return api.get('/api/v1/attendance/summary', params);
    },
};
