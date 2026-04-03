'use client';

import { useEffect, useState } from 'react';
import { fetchActiveBroadcasts } from '@/lib/actions/platform';
import { Megaphone, X } from 'lucide-react';

export default function PlatformBroadcastTicker() {
    const [broadcasts, setBroadcasts] = useState<any[]>([]);
    const [dismissedId, setDismissedId] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            const data = await fetchActiveBroadcasts();
            if (mounted && data.length > 0) {
                setBroadcasts(data);
            }
        };
        load();
        return () => { mounted = false; };
    }, []);

    const activeBcast = broadcasts.find(b => b.id !== dismissedId);

    if (!activeBcast) return null;

    return (
        <div className="bg-indigo-600 text-white px-4 py-3 flex items-start sm:items-center justify-between shadow-md relative z-50">
            <div className="flex items-start sm:items-center gap-3">
                <div className="mt-0.5 sm:mt-0 p-1 bg-white/20 rounded-md">
                    <Megaphone size={16} className="text-white" />
                </div>
                <div>
                    <span className="font-bold mr-2">{activeBcast.title}:</span>
                    <span className="text-sm text-indigo-100">{activeBcast.message}</span>
                </div>
            </div>
            <button 
                onClick={() => setDismissedId(activeBcast.id)}
                className="p-1 hover:bg-white/20 rounded-md transition ml-4 shrink-0"
            >
                <X size={16} />
            </button>
        </div>
    );
}
