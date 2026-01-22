/**
 * Messaging service - uses Java API.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface MessageTemplate {
    id: string;
    name: string;
    channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
    subject?: string;
    body: string;
    active: boolean;
}

export async function getTemplates(token: string): Promise<MessageTemplate[]> {
    try {
        const response = await fetch(`${API_BASE}/api/v1/communication/templates`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) return [];

        const data = await response.json();
        return data.data?.content || data.content || [];
    } catch (error) {
        console.error('[Messaging] API Error:', error);
        return [];
    }
}

export async function sendMessage(token: string, data: {
    templateId?: string;
    channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
    recipients: string[];
    message: string;
    subject?: string;
}) {
    try {
        const response = await fetch(`${API_BASE}/api/v1/communication/send`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        return response.ok;
    } catch (error) {
        console.error('[Messaging] API Error:', error);
        return false;
    }
}
