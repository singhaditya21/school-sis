/**
 * Base API client for connecting to Java Spring Boot backend.
 * Handles JWT authentication, error handling, and request/response processing.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: Record<string, string>;
    };
    timestamp: string;
}

export interface PaginatedResponse<T> {
    content: T[];
    totalElements: number;
    totalPages: number;
    size: number;
    number: number;
    first: boolean;
    last: boolean;
}

class ApiClient {
    private baseUrl: string;
    private token: string | null = null;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    setToken(token: string | null) {
        this.token = token;
    }

    getToken(): string | null {
        return this.token;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<ApiResponse<T>> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (this.token) {
            (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
        }

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                ...options,
                headers,
            });

            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: {
                        code: data.error?.code || 'API_ERROR',
                        message: data.error?.message || 'Request failed',
                        details: data.error?.details,
                    },
                    timestamp: new Date().toISOString(),
                };
            }

            return {
                success: true,
                data: data.data ?? data,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            return {
                success: false,
                error: {
                    code: 'NETWORK_ERROR',
                    message: error instanceof Error ? error.message : 'Network error occurred',
                },
                timestamp: new Date().toISOString(),
            };
        }
    }

    async get<T>(endpoint: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
        const url = params
            ? `${endpoint}?${new URLSearchParams(params).toString()}`
            : endpoint;
        return this.request<T>(url, { method: 'GET' });
    }

    async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: body ? JSON.stringify(body) : undefined,
        });
    }

    async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: body ? JSON.stringify(body) : undefined,
        });
    }

    async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'DELETE' });
    }
}

// Singleton instance
export const api = new ApiClient();

// For server-side usage with different tokens
export const createApiClient = (token?: string) => {
    const client = new ApiClient();
    if (token) client.setToken(token);
    return client;
};
