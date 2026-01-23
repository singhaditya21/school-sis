/**
 * Users API service - handles user CRUD operations.
 */
import { api, type ApiResponse } from './client';

export interface AdminUser {
    id: string;
    tenantId: string | null;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    active: boolean;
    createdAt: string | null;
    lastLoginAt: string | null;
}

export interface CreateUserRequest {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    tenantId: string;
}

export interface UpdateUserRequest {
    firstName?: string;
    lastName?: string;
    role?: string;
    active?: boolean;
}

export interface PagedResponse<T> {
    content: T[];
    totalElements: number;
    totalPages: number;
    size: number;
    number: number;
}

export interface PasswordResetResponse {
    userId: string;
    temporaryPassword: string;
    message: string;
}

export const usersApi = {
    /**
     * Get all users (paginated).
     */
    async getAll(page = 0, size = 20): Promise<ApiResponse<PagedResponse<AdminUser>>> {
        return api.get<PagedResponse<AdminUser>>('/api/v1/users', {
            page: page.toString(),
            size: size.toString(),
        });
    },

    /**
     * Get user by ID.
     */
    async getById(id: string): Promise<ApiResponse<AdminUser>> {
        return api.get<AdminUser>(`/api/v1/users/${id}`);
    },

    /**
     * Create a new user.
     */
    async create(request: CreateUserRequest): Promise<ApiResponse<AdminUser>> {
        return api.post<AdminUser>('/api/v1/users', request);
    },

    /**
     * Update an existing user.
     */
    async update(id: string, request: UpdateUserRequest): Promise<ApiResponse<AdminUser>> {
        return api.put<AdminUser>(`/api/v1/users/${id}`, request);
    },

    /**
     * Toggle user active status.
     */
    async toggleStatus(id: string, active: boolean): Promise<ApiResponse<AdminUser>> {
        return api.put<AdminUser>(`/api/v1/users/${id}/status`, { active });
    },

    /**
     * Reset user password.
     */
    async resetPassword(id: string): Promise<ApiResponse<PasswordResetResponse>> {
        return api.post<PasswordResetResponse>(`/api/v1/users/${id}/reset-password`);
    },

    /**
     * Delete (deactivate) a user.
     */
    async delete(id: string): Promise<ApiResponse<void>> {
        return api.delete<void>(`/api/v1/users/${id}`);
    },
};

// Roles API
export interface RoleSummary {
    role: string;
    displayName: string;
    permissionCount: number;
    isAdmin: boolean;
    isStaff: boolean;
}

export interface RolePermissions {
    role: string;
    displayName: string;
    permissions: string[];
}

export interface PermissionInfo {
    id: string;
    name: string;
    module: string;
}

export const rolesApi = {
    /**
     * Get all roles.
     */
    async getAll(): Promise<ApiResponse<RoleSummary[]>> {
        return api.get<RoleSummary[]>('/api/v1/roles');
    },

    /**
     * Get permissions for a role.
     */
    async getPermissions(role: string): Promise<ApiResponse<RolePermissions>> {
        return api.get<RolePermissions>(`/api/v1/roles/${role}/permissions`);
    },

    /**
     * Update permissions for a role.
     */
    async updatePermissions(role: string, permissions: string[]): Promise<ApiResponse<RolePermissions>> {
        return api.put<RolePermissions>(`/api/v1/roles/${role}/permissions`, { permissions });
    },

    /**
     * Get all available permissions.
     */
    async getAllPermissions(): Promise<ApiResponse<PermissionInfo[]>> {
        return api.get<PermissionInfo[]>('/api/v1/roles/permissions');
    },
};
