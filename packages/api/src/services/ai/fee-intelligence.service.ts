/**
 * Fee intelligence service - uses Java API.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface FeeInsight {
    type: 'warning' | 'info' | 'success';
    title: string;
    message: string;
    actionUrl?: string;
}

export interface FeeSummary {
    totalCollected: number;
    totalPending: number;
    totalOverdue: number;
    collectionRate: number;
    insights: FeeInsight[];
}

export async function getFeeIntelligence(token: string): Promise<FeeSummary> {
    try {
        const response = await fetch(`${API_BASE}/api/v1/fees/intelligence`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            return {
                totalCollected: 0,
                totalPending: 0,
                totalOverdue: 0,
                collectionRate: 0,
                insights: [],
            };
        }

        const data = await response.json();
        return data.data || {
            totalCollected: 0,
            totalPending: 0,
            totalOverdue: 0,
            collectionRate: 0,
            insights: [],
        };
    } catch (error) {
        console.error('[FeeIntelligence] API Error:', error);
        return {
            totalCollected: 0,
            totalPending: 0,
            totalOverdue: 0,
            collectionRate: 0,
            insights: [],
        };
    }
}
