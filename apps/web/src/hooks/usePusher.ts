'use client';

import { useEffect } from 'react';
import Pusher from 'pusher-js';

let pusherInstance: Pusher | null = null;

export function usePusher(channelName: string, eventName: string, callback: (data: any) => void) {
    useEffect(() => {
        if (!process.env.NEXT_PUBLIC_PUSHER_KEY) {
            console.warn('NEXT_PUBLIC_PUSHER_KEY is missing');
            return;
        }

        if (!pusherInstance) {
            pusherInstance = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
                cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1',
            });
        }

        const channel = pusherInstance.subscribe(channelName);
        channel.bind(eventName, callback);

        return () => {
            channel.unbind(eventName, callback);
        };
    }, [channelName, eventName, callback]);
}
