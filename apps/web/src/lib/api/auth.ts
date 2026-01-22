/**
 * Auth API service - handles login, logout, and token refresh.
 */
import { api, createApiClient, type ApiResponse } from './client';
import type { LoginRequest, LoginResponse, User } from './types';

export const authApi = {
    /**
     * Login with email and password.
     */
    async login(credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> {
        const response = await api.post<LoginResponse>('/api/v1/auth/login', credentials);
        if (response.success && response.data?.accessToken) {
            api.setToken(response.data.accessToken);
        }
        return response;
    },

    /**
     * Refresh access token.
     */
    async refresh(refreshToken: string): Promise<ApiResponse<LoginResponse>> {
        return api.post<LoginResponse>('/api/v1/auth/refresh', { refreshToken });
    },

    /**
     * Logout - clear token.
     */
    logout(): void {
        api.setToken(null);
    },

    /**
     * Get current user profile.
     */
    async getProfile(): Promise<ApiResponse<User>> {
        return api.get<User>('/api/v1/auth/profile');
    },
};
