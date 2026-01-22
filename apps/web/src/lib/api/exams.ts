/**
 * Exams API service.
 */
import { api, type ApiResponse, type PaginatedResponse } from './client';
import type { Exam, Mark, UUID } from './types';

export const examsApi = {
    /**
     * Get all exams.
     */
    async getAll(page = 0, size = 20): Promise<ApiResponse<PaginatedResponse<Exam>>> {
        return api.get<PaginatedResponse<Exam>>('/api/v1/exams', {
            page: page.toString(),
            size: size.toString(),
        });
    },

    /**
     * Get exam by ID.
     */
    async getById(id: UUID): Promise<ApiResponse<Exam>> {
        return api.get<Exam>(`/api/v1/exams/${id}`);
    },

    /**
     * Create exam.
     */
    async create(data: {
        name: string;
        termId: UUID;
        startDate: string;
        endDate: string;
    }): Promise<ApiResponse<Exam>> {
        return api.post<Exam>('/api/v1/exams', data);
    },

    /**
     * Get marks for an exam and class.
     */
    async getMarks(examId: UUID, classId: UUID): Promise<ApiResponse<Mark[]>> {
        return api.get<Mark[]>(`/api/v1/exams/${examId}/marks/class/${classId}`);
    },

    /**
     * Save marks.
     */
    async saveMarks(examId: UUID, marks: {
        studentId: UUID;
        subjectId: UUID;
        marksObtained: number;
        maxMarks: number;
    }[]): Promise<ApiResponse<Mark[]>> {
        return api.post<Mark[]>(`/api/v1/exams/${examId}/marks`, marks);
    },

    /**
     * Get report card data.
     */
    async getReportCard(studentId: UUID, termId: UUID): Promise<ApiResponse<{
        student: { name: string; class: string };
        subjects: Array<{ name: string; marks: number; maxMarks: number; grade: string }>;
        totalMarks: number;
        percentage: number;
        rank?: number;
    }>> {
        return api.get(`/api/v1/exams/report-cards/${studentId}/${termId}`);
    },
};
