'use client';

/**
 * Global Error Boundary — Catches unhandled errors in the admin layout.
 */

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Error Boundary]', error);
    }, [error]);

    return (
        <div className="min-h-[400px] flex items-center justify-center">
            <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-950/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">⚠️</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    Something went wrong
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                    {error.message || 'An unexpected error occurred. Please try again.'}
                </p>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                        Try Again
                    </button>
                    <a
                        href="/"
                        className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-900"
                    >
                        Go Home
                    </a>
                </div>
                {error.digest && (
                    <p className="text-xs text-muted-foreground mt-4">
                        Error ID: {error.digest}
                    </p>
                )}
            </div>
        </div>
    );
}
