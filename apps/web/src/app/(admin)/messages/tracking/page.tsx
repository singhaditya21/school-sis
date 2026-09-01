import { getChannelAvailability, getMessagingOverview, listOutboxNotifications } from '../actions';
import { DeliveryRealityNotice, MessagesTabs } from '../ui';
import TrackingClient from './tracking-client';

export const dynamic = 'force-dynamic';

export default async function MessageTrackingPage() {
    const [rows, availability, overview] = await Promise.all([
        listOutboxNotifications(200),
        getChannelAvailability(),
        getMessagingOverview(),
    ]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold">Notification outbox</h1>
                <p className="mt-1 text-muted-foreground">
                    One row per recipient. Status here comes from the outbox itself — it is the only
                    real record of what a provider has done with a message.
                </p>
            </div>

            <MessagesTabs active="tracking" />

            <DeliveryRealityNotice availability={availability} dispatched={overview.dispatched} />

            <TrackingClient rows={rows} />
        </div>
    );
}
