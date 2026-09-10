'use client';

import { useEffect } from 'react';

export function PWARegistry() {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').catch(
                    function (err) {
                        console.warn('Service Worker registration failed:', err);
                    }
                );
            });
        }
    }, []);

    return null;
}
