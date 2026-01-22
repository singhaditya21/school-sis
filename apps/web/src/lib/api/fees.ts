/**
 * Fees API service.
 */
import { api, type ApiResponse, type PaginatedResponse } from './client';
import type { FeeInvoice, Payment, UUID } from './types';

export const feesApi = {
    /**
     * Get all invoices (paginated).
     */
    async getInvoices(page = 0, size = 20): Promise<ApiResponse<PaginatedResponse<FeeInvoice>>> {
        return api.get<PaginatedResponse<FeeInvoice>>('/api/v1/fees/invoices', {
            page: page.toString(),
            size: size.toString(),
        });
    },

    /**
     * Get invoice by ID.
     */
    async getInvoiceById(id: UUID): Promise<ApiResponse<FeeInvoice>> {
        return api.get<FeeInvoice>(`/api/v1/fees/invoices/${id}`);
    },

    /**
     * Get invoices by student.
     */
    async getInvoicesByStudent(studentId: UUID): Promise<ApiResponse<FeeInvoice[]>> {
        return api.get<FeeInvoice[]>(`/api/v1/fees/invoices/student/${studentId}`);
    },

    /**
     * Record payment.
     */
    async recordPayment(invoiceId: UUID, data: {
        amount: number;
        paymentMethod: string;
        paymentDate: string;
    }): Promise<ApiResponse<Payment>> {
        return api.post<Payment>(`/api/v1/fees/invoices/${invoiceId}/payments`, data);
    },

    /**
     * Get payments for invoice.
     */
    async getPayments(invoiceId: UUID): Promise<ApiResponse<Payment[]>> {
        return api.get<Payment[]>(`/api/v1/fees/invoices/${invoiceId}/payments`);
    },

    /**
     * Get defaulters list.
     */
    async getDefaulters(): Promise<ApiResponse<FeeInvoice[]>> {
        return api.get<FeeInvoice[]>('/api/v1/fees/defaulters');
    },

    /**
     * Get fee summary/stats.
     */
    async getSummary(): Promise<ApiResponse<{
        totalCollected: number;
        totalPending: number;
        totalOverdue: number;
    }>> {
        return api.get('/api/v1/fees/summary');
    },
};
