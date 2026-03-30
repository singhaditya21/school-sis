'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getRecentActivity, ActivityLogItem } from '@/lib/actions/dashboard';

const TYPE_ICONS: Record<string, string> = {
    payment: '💳',
    invoice: '🧾',
    admission: '📝',
    reminder: '📤',
    consent: '✅',
    login: '🔐',
    attendance: '📋',
    exam: '📊',
    health: '🏥',
};

const TYPE_COLORS: Record<string, string> = {
    payment: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    invoice: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    admission: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    reminder: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    consent: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    login: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
    attendance: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    exam: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
    health: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
};

function formatTimeAgo(dateInput: Date | string): string {
    const defaultVal = 'Just now';
    if (!dateInput) return defaultVal;
    
    // Server Actions pass back date strings, so parsing is required.
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    // If future or invalid, default to Just Now
    if (diffMs < 0 || isNaN(diffMs)) return defaultVal;
    
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 5) return 'Just now';
    if (diffSecs < 60) return `${diffSecs} secs ago`;

    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function RecentActivity() {
    const [activities, setActivities] = useState<(ActivityLogItem & { isNew?: boolean })[]>([]);
    const [isLive, setIsLive] = useState(true);
    const [mounted, setMounted] = useState(false);

    // Initialize activities from the Database via Server Action
    useEffect(() => {
        async function fetchInitial() {
            try {
                const logs = await getRecentActivity(10);
                setActivities(logs.map(l => ({ ...l, isNew: false })));
            } catch (error) {
                console.error("Failed to load activities", error);
            } finally {
                setMounted(true);
            }
        }
        fetchInitial();
    }, []);

    // Polling interval to check database for new real events
    useEffect(() => {
        if (!isLive) return;

        const interval = setInterval(async () => {
             try {
                const logs = await getRecentActivity(10);
                
                setActivities(prev => {
                    if (prev.length === 0) return logs.map(l => ({ ...l, isNew: false }));
                    
                    const prevIds = new Set(prev.map(a => a.id));
                    const newLogs = logs.filter(l => !prevIds.has(l.id));
                    
                    if (newLogs.length === 0) return prev;
                    
                    // Add isNew flag to newly fetched records, clear it from old ones
                    const updatedPrev = prev.map(a => ({ ...a, isNew: false }));
                    const markedNew = newLogs.map(l => ({ ...l, isNew: true }));
                    
                    return [...markedNew, ...updatedPrev].slice(0, 10);
                });
             } catch (error) {
                // Silently swallow polling errors so we don't spam the console heavily
             }
        }, 3000); // 3-second live DB polling

        return () => clearInterval(interval);
    }, [isLive]);

    // Update time-ago labels periodically
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => forceUpdate(n => n + 1), 5000);
        return () => clearInterval(interval);
    }, []);

    if (!mounted) {
        return (
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Recent Activity</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4 max-h-[400px] overflow-hidden">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="flex gap-3 animate-pulse">
                                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800"></div>
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-3/4 bg-slate-100 dark:bg-slate-800 rounded"></div>
                                    <div className="h-3 w-1/2 bg-slate-50 dark:bg-slate-900 rounded"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Recent Activity</CardTitle>
                    <div
                        onClick={() => setIsLive(!isLive)}
                        className="focus:outline-none cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === 'Space') {
                                setIsLive(!isLive);
                            }
                        }}
                    >
                        <Badge
                            variant="outline"
                            className={`text-xs transition-all ${isLive
                                    ? 'bg-green-50 border-green-500 text-green-700 animate-pulse'
                                    : 'bg-gray-50 border-gray-400 text-gray-600'
                                }`}
                        >
                            <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${isLive ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {isLive ? 'Live' : 'Paused'}
                        </Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {activities.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-500">
                        No activity found in the system.
                    </div>
                ) : (
                    <div className="space-y-4 max-h-[400px] overflow-y-auto">
                        {activities.map((activity) => (
                            <div
                                key={activity.id}
                                className={`flex items-start gap-3 transition-all duration-500 ${activity.isNew
                                        ? 'animate-in fade-in slide-in-from-top-4 duration-300 bg-yellow-50 dark:bg-yellow-900/10 -mx-2 px-2 py-1 rounded-lg'
                                        : ''
                                    }`}
                            >
                                <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${TYPE_COLORS[activity.type] || TYPE_COLORS.login}`}
                                >
                                    <span className="text-sm">{TYPE_ICONS[activity.type] || '⚡'}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                        {activity.title}
                                    </p>
                                    <p className="text-sm text-muted-foreground truncate">
                                        {activity.description}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-muted-foreground">
                                            {formatTimeAgo(activity.timestamp)}
                                        </span>
                                        {activity.user && (
                                            <>
                                                <span className="text-xs text-muted-foreground">•</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {activity.user}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
