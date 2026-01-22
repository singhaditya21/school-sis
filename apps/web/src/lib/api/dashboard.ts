/**
 * Dashboard API service.
 */
import { api, type ApiResponse } from './client';

export interface DashboardStats {
    overdueAmount: number;
    dueSoon: number;
    collectionRate: number;
    consentBlocked: number;
    totalStudents: number;
    totalTeachers: number;
    attendanceRate: number;
}

export interface TenantInfo {
    id: string;
    name: string;
    slug: string;
}

export const dashboardApi = {
    /**
     * Get dashboard stats.
     */
    async getStats(): Promise<ApiResponse<DashboardStats>> {
        return api.get<DashboardStats>('/api/v1/dashboard/stats');
    },

    /**
     * Get tenant info.
     */
    async getTenantInfo(): Promise<ApiResponse<TenantInfo>> {
        return api.get<TenantInfo>('/api/v1/tenants/current');
    },
};
