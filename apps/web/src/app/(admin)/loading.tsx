/**
 * Loading State — Shows a skeleton loader while pages load.
 */

export default function Loading() {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded-lg" />
                    <div className="h-4 w-64 bg-gray-100 dark:bg-gray-900 rounded mt-2" />
                </div>
                <div className="h-10 w-32 bg-gray-200 dark:bg-gray-800 rounded-lg" />
            </div>

            {/* Stats cards skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 p-5 h-24">
                        <div className="h-4 w-20 bg-gray-100 dark:bg-gray-900 rounded mb-3" />
                        <div className="h-7 w-16 bg-gray-200 dark:bg-gray-800 rounded" />
                    </div>
                ))}
            </div>

            {/* Table skeleton */}
            <div className="bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="h-10 bg-gray-50 dark:bg-gray-900/50" />
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center gap-4 px-4 py-4 border-t border-gray-100 dark:border-gray-900">
                        <div className="h-4 w-32 bg-gray-100 dark:bg-gray-900 rounded" />
                        <div className="h-4 w-24 bg-gray-100 dark:bg-gray-900 rounded" />
                        <div className="h-4 w-16 bg-gray-100 dark:bg-gray-900 rounded ml-auto" />
                    </div>
                ))}
            </div>
        </div>
    );
}
