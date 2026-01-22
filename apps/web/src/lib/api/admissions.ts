/**
 * Admissions API service.
 */
import { api, type ApiResponse, type PaginatedResponse } from './client';
import type { AdmissionLead, UUID } from './types';

export const admissionsApi = {
    /**
     * Get all leads.
     */
    async getLeads(page = 0, size = 20): Promise<ApiResponse<PaginatedResponse<AdmissionLead>>> {
        return api.get<PaginatedResponse<AdmissionLead>>('/api/v1/admissions/leads', {
            page: page.toString(),
            size: size.toString(),
        });
    },

    /**
     * Get lead by ID.
     */
    async getLeadById(id: UUID): Promise<ApiResponse<AdmissionLead>> {
        return api.get<AdmissionLead>(`/api/v1/admissions/leads/${id}`);
    },

    /**
     * Create lead.
     */
    async createLead(data: {
        childName: string;
        parentName: string;
        parentPhone: string;
        parentEmail?: string;
        gradeId?: UUID;
        source?: string;
        notes?: string;
    }): Promise<ApiResponse<AdmissionLead>> {
        return api.post<AdmissionLead>('/api/v1/admissions/leads', data);
    },

    /**
     * Update lead status.
     */
    async updateLeadStatus(id: UUID, status: AdmissionLead['status']): Promise<ApiResponse<AdmissionLead>> {
        return api.put<AdmissionLead>(`/api/v1/admissions/leads/${id}/status`, { status });
    },
};
