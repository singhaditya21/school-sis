'use client';

/**
 * Root Global Error Boundary — Catches unhandled errors in the root layout without exposing internal messages.
 */

import { useEffect } from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Global Error Boundary]', error);
    }, [error]);

    return (
        <html lang="en">
            <body className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
                <div className="text-center max-w-md border border-border rounded-2xl p-8 bg-card shadow-sm">
                    <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
                    <p className="text-sm text-muted-foreground mb-6">
                        An unexpected error occurred. Please try again or return to the home page.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button
                            type="button"
                            onClick={reset}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium"
                        >
                            Try Again
                        </button>
                        <a
                            href="/"
                            className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted"
                        >
                            Go Home
                        </a>
                    </div>
                    {error.digest && (
                        <p className="text-xs text-muted-foreground mt-4">
                            Reference ID: {error.digest}
                        </p>
                    )}
                </div>
            </body>
        </html>
    );
}
