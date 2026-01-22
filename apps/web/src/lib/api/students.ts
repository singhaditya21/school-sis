/**
 * Students API service.
 */
import { api, type ApiResponse, type PaginatedResponse } from './client';
import type { Student, CreateStudentRequest, UUID } from './types';

export const studentsApi = {
    /**
     * Get all students (paginated).
     */
    async getAll(page = 0, size = 20): Promise<ApiResponse<PaginatedResponse<Student>>> {
        return api.get<PaginatedResponse<Student>>('/api/v1/students', {
            page: page.toString(),
            size: size.toString(),
        });
    },

    /**
     * Get student by ID.
     */
    async getById(id: UUID): Promise<ApiResponse<Student>> {
        return api.get<Student>(`/api/v1/students/${id}`);
    },

    /**
     * Get students by class group.
     */
    async getByClassGroup(classGroupId: UUID): Promise<ApiResponse<Student[]>> {
        return api.get<Student[]>(`/api/v1/students/class/${classGroupId}`);
    },

    /**
     * Create new student.
     */
    async create(data: CreateStudentRequest): Promise<ApiResponse<Student>> {
        return api.post<Student>('/api/v1/students', data);
    },

    /**
     * Update student.
     */
    async update(id: UUID, data: Partial<CreateStudentRequest>): Promise<ApiResponse<Student>> {
        return api.put<Student>(`/api/v1/students/${id}`, data);
    },

    /**
     * Delete (deactivate) student.
     */
    async delete(id: UUID): Promise<ApiResponse<void>> {
        return api.delete<void>(`/api/v1/students/${id}`);
    },

    /**
     * Get student count.
     */
    async count(): Promise<ApiResponse<number>> {
        return api.get<number>('/api/v1/students/count');
    },
};
