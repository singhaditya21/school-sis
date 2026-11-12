import { MessagesTabs } from '../ui';
import { getConciergeStudioDataAction } from './concierge-actions';
import { ConciergeSimulatorClient } from './concierge-simulator-client';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: '2-Way WhatsApp School Concierge | ScholarMind',
};

export default async function WhatsAppConciergePage() {
    const studio = await getConciergeStudioDataAction();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-foreground">2-Way WhatsApp School Concierge</h1>
                <p className="mt-1 text-muted-foreground">
                    Verified inbound guardian menu for instant UPI fee links, official receipts, attendance registers, board report cards, and dismissal gate passes.
                </p>
            </div>

            <MessagesTabs active="concierge" />

            <ConciergeSimulatorClient
                schoolName={studio.schoolName}
                webhookUrl={studio.webhookUrl}
                providerState={studio.providerState}
                guardians={studio.guardians}
            />
        </div>
    );
}
