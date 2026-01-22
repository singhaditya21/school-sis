/**
 * Cashflow service - uses Java API.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface CashflowData {
    date: string;
    collections: number;
    refunds: number;
    netAmount: number;
}

export interface CashflowSummary {
    totalCollections: number;
    totalRefunds: number;
    netCashflow: number;
    dailyData: CashflowData[];
}

export async function getCashflowData(token: string, startDate?: string, endDate?: string): Promise<CashflowSummary> {
    try {
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        const response = await fetch(`${API_BASE}/api/v1/fees/cashflow?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            return { totalCollections: 0, totalRefunds: 0, netCashflow: 0, dailyData: [] };
        }

        const data = await response.json();
        return data.data || { totalCollections: 0, totalRefunds: 0, netCashflow: 0, dailyData: [] };
    } catch (error) {
        console.error('[Cashflow] API Error:', error);
        return { totalCollections: 0, totalRefunds: 0, netCashflow: 0, dailyData: [] };
    }
}
