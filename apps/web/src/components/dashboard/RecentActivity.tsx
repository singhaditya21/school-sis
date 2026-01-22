'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ActivityItem {
    id: string;
    type: 'payment' | 'invoice' | 'admission' | 'reminder' | 'consent' | 'login' | 'attendance' | 'exam' | 'health';
    title: string;
    description: string;
    timestamp: Date;
    user?: string;
    isNew?: boolean;
}

// Indian names for generating activities
const STUDENT_NAMES = [
    'Aarav Sharma', 'Priya Patel', 'Arjun Singh', 'Ananya Gupta', 'Vivaan Reddy',
    'Saanvi Jain', 'Krishna Menon', 'Kavya Nair', 'Ishaan Das', 'Diya Roy',
    'Dhruv Banerjee', 'Navya Kapoor', 'Atharva Kulkarni', 'Aanya Chopra', 'Kabir Mehta',
    'Kiara Shah', 'Reyansh Verma', 'Shanaya Kumar', 'Yuvan Saxena', 'Myra Agarwal',
    'Rudra Singh', 'Avni Gupta', 'Shivansh Reddy', 'Manya Joshi', 'Lakshya Mehta',
];

const USERS = ['System', 'Admin', 'Accountant', 'Counselor', 'Teacher', 'Principal', 'Parent', 'Nurse'];
const CLASSES = ['1-A', '2-B', '3-C', '4-A', '5-B', '6-A', '7-C', '8-B', '9-A', '10-B', '11-A', '12-B'];
const AMOUNTS = [15000, 18500, 22000, 25000, 28500, 32000, 35000, 38500, 42000, 45000, 50000, 55000];
const PAYMENT_MODES = ['UPI', 'NEFT', 'Card', 'Cash', 'Cheque'];

// Activity generators
const activityGenerators = [
    () => ({
        type: 'payment' as const,
        title: 'Payment Received',
        description: `${STUDENT_NAMES[Math.floor(Math.random() * STUDENT_NAMES.length)]} - ₹${AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)].toLocaleString('en-IN')} via ${PAYMENT_MODES[Math.floor(Math.random() * PAYMENT_MODES.length)]}`,
        user: 'System',
    }),
    () => ({
        type: 'reminder' as const,
        title: 'Reminder Sent',
        description: `${Math.floor(Math.random() * 20) + 5} SMS reminders dispatched to overdue accounts`,
        user: 'Accountant',
    }),
    () => ({
        type: 'invoice' as const,
        title: 'Invoice Generated',
        description: `${STUDENT_NAMES[Math.floor(Math.random() * STUDENT_NAMES.length)]} - Q${Math.floor(Math.random() * 4) + 1} fee invoice created`,
        user: 'Admin',
    }),
    () => ({
        type: 'admission' as const,
        title: 'New Lead Added',
        description: `${STUDENT_NAMES[Math.floor(Math.random() * STUDENT_NAMES.length)]} - Grade ${Math.floor(Math.random() * 12) + 1} admission inquiry`,
        user: 'Counselor',
    }),
    () => ({
        type: 'consent' as const,
        title: 'Consent Updated',
        description: `Parent consent for ${['SMS', 'WhatsApp', 'Email'][Math.floor(Math.random() * 3)]} notifications ${['enabled', 'updated'][Math.floor(Math.random() * 2)]}`,
        user: 'Parent',
    }),
    () => ({
        type: 'login' as const,
        title: 'Staff Login',
        description: `${USERS[Math.floor(Math.random() * USERS.length)]} logged in from ${['mobile', 'desktop', 'tablet'][Math.floor(Math.random() * 3)]}`,
    }),
    () => ({
        type: 'attendance' as const,
        title: 'Attendance Marked',
        description: `Class ${CLASSES[Math.floor(Math.random() * CLASSES.length)]} - ${Math.floor(Math.random() * 5) + 55}/60 present`,
        user: 'Teacher',
    }),
    () => ({
        type: 'exam' as const,
        title: 'Marks Entered',
        description: `${['Mathematics', 'English', 'Science', 'Hindi', 'Social Studies'][Math.floor(Math.random() * 5)]} - Class ${Math.floor(Math.random() * 12) + 1} marks uploaded`,
        user: 'Teacher',
    }),
    () => ({
        type: 'health' as const,
        title: 'Health Checkup',
        description: `${STUDENT_NAMES[Math.floor(Math.random() * STUDENT_NAMES.length)]} - Annual checkup completed`,
        user: 'Nurse',
    }),
];

const TYPE_ICONS: Record<ActivityItem['type'], string> = {
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

const TYPE_COLORS: Record<ActivityItem['type'], string> = {
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

function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 5) return 'Just now';
    if (diffSecs < 60) return `${diffSecs} secs ago`;

    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function generateActivity(): ActivityItem {
    const generator = activityGenerators[Math.floor(Math.random() * activityGenerators.length)];
    const activity = generator();
    return {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...activity,
        timestamp: new Date(),
        isNew: true,
    };
}

// Generate initial activities with staggered timestamps
function generateInitialActivities(): ActivityItem[] {
    const activities: ActivityItem[] = [];
    const now = new Date();

    for (let i = 0; i < 8; i++) {
        const generator = activityGenerators[Math.floor(Math.random() * activityGenerators.length)];
        const activity = generator();
        const timestamp = new Date(now.getTime() - (i * 300000 + Math.random() * 60000)); // 5 mins apart with some randomness

        activities.push({
            id: `initial-${i}`,
            ...activity,
            timestamp,
            isNew: false,
        });
    }

    return activities;
}

export function RecentActivity() {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [isLive, setIsLive] = useState(true);

    // Initialize activities
    useEffect(() => {
        setActivities(generateInitialActivities());
    }, []);

    // Add new activity periodically
    useEffect(() => {
        if (!isLive) return;

        const interval = setInterval(() => {
            // Random chance to add a new activity (every 2-5 seconds on average)
            if (Math.random() < 0.4) {
                const newActivity = generateActivity();
                setActivities(prev => {
                    // Remove isNew flag from previous activities
                    const updated = prev.map(a => ({ ...a, isNew: false }));
                    // Add new activity at the top, keep max 10
                    return [newActivity, ...updated].slice(0, 10);
                });
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isLive]);

    // Update timestamps every second
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => {
            forceUpdate(n => n + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Recent Activity</CardTitle>
                    <button
                        onClick={() => setIsLive(!isLive)}
                        className="focus:outline-none"
                    >
                        <Badge
                            variant="outline"
                            className={`text-xs cursor-pointer transition-all ${isLive
                                    ? 'bg-green-50 border-green-500 text-green-700 animate-pulse'
                                    : 'bg-gray-50 border-gray-400 text-gray-600'
                                }`}
                        >
                            <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${isLive ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {isLive ? 'Live' : 'Paused'}
                        </Badge>
                    </button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                    {activities.map((activity) => (
                        <div
                            key={activity.id}
                            className={`flex items-start gap-3 transition-all duration-500 ${activity.isNew
                                    ? 'animate-slideIn bg-yellow-50 dark:bg-yellow-900/10 -mx-2 px-2 py-1 rounded-lg'
                                    : ''
                                }`}
                        >
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${TYPE_COLORS[activity.type]}`}
                            >
                                <span className="text-sm">{TYPE_ICONS[activity.type]}</span>
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
            </CardContent>

            <style jsx>{`
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-slideIn {
                    animation: slideIn 0.3s ease-out;
                }
            `}</style>
        </Card>
    );
}
