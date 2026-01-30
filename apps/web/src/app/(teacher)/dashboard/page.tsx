import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface TodayClass {
    id: string;
    period: number;
    time: string;
    subject: string;
    class: string;
    room: string;
    isNext: boolean;
}

interface QuickStat {
    label: string;
    value: string | number;
    icon: string;
    color: string;
    href?: string;
}

// Mock data for demo
const mockTodayClasses: TodayClass[] = [
    { id: '1', period: 1, time: '8:00 - 8:45', subject: 'Mathematics', class: '10-A', room: 'Room 201', isNext: false },
    { id: '2', period: 2, time: '8:45 - 9:30', subject: 'Mathematics', class: '10-B', room: 'Room 201', isNext: true },
    { id: '3', period: 3, time: '9:45 - 10:30', subject: 'Mathematics', class: '9-A', room: 'Room 105', isNext: false },
    { id: '4', period: 5, time: '11:15 - 12:00', subject: 'Mathematics', class: '11-A', room: 'Room 301', isNext: false },
    { id: '5', period: 6, time: '12:00 - 12:45', subject: 'Mathematics', class: '11-B', room: 'Room 301', isNext: false },
];

export default async function TeacherDashboardPage() {
    const session = await getSession();

    // Get current day name
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    const dayName = days[today.getDay()];
    const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    // Fetch data from backend (with fallback to mock)
    let todayClasses: TodayClass[] = mockTodayClasses;

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/teacher/schedule/today`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            }
        );
        if (response.ok) {
            const data = await response.json();
            if (data.data?.length > 0) {
                todayClasses = data.data;
            }
        }
    } catch (error) {
        console.error('[Teacher Dashboard] API Error:', error);
    }

    const quickStats: QuickStat[] = [
        { label: 'Classes Today', value: todayClasses.length, icon: '📚', color: 'bg-blue-500', href: '/teacher/schedule' },
        { label: 'Pending Attendance', value: 3, icon: '✅', color: 'bg-amber-500', href: '/teacher/attendance' },
        { label: 'Assignments to Grade', value: 12, icon: '📝', color: 'bg-purple-500', href: '/teacher/gradebook' },
        { label: 'Unread Messages', value: 5, icon: '💬', color: 'bg-emerald-500', href: '/teacher/messages' },
    ];

    return (
        <div className="space-y-6">
            {/* Welcome Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white">
                <p className="text-emerald-100 text-sm">{dayName}, {dateStr}</p>
                <h1 className="text-2xl font-bold mt-1">
                    Welcome back! 👋
                </h1>
                <p className="text-emerald-100 mt-2">
                    You have {todayClasses.length} classes scheduled for today.
                </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {quickStats.map((stat, idx) => (
                    <Link
                        key={idx}
                        href={stat.href || '#'}
                        className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center`}>
                                <span className="text-white text-xl">{stat.icon}</span>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                                <p className="text-xs text-gray-500">{stat.label}</p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Today's Schedule */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="font-semibold text-gray-900">📅 Today&apos;s Schedule</h2>
                    <Link href="/teacher/schedule" className="text-sm text-emerald-600 hover:underline">
                        View Full Schedule →
                    </Link>
                </div>
                <div className="divide-y divide-gray-100">
                    {todayClasses.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            No classes scheduled for today 🎉
                        </div>
                    ) : (
                        todayClasses.map((cls) => (
                            <div
                                key={cls.id}
                                className={`p-4 flex items-center gap-4 ${cls.isNext ? 'bg-emerald-50 border-l-4 border-emerald-500' : ''}`}
                            >
                                <div className="w-12 text-center">
                                    <span className="text-2xl font-bold text-gray-300">P{cls.period}</span>
                                </div>
                                <div className="flex-1">
                                    <p className="font-medium text-gray-900">{cls.subject}</p>
                                    <p className="text-sm text-gray-500">
                                        {cls.class} • {cls.room}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-medium text-gray-700">{cls.time}</p>
                                    {cls.isNext && (
                                        <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                                            Up Next
                                        </span>
                                    )}
                                </div>
                                <Link
                                    href={`/teacher/attendance?class=${cls.class}`}
                                    className="px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
                                >
                                    Mark Attendance
                                </Link>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <QuickAction
                    href="/teacher/attendance"
                    icon="✅"
                    title="Mark Attendance"
                    description="Record today's attendance"
                    color="bg-blue-50 text-blue-700"
                />
                <QuickAction
                    href="/teacher/gradebook"
                    icon="📝"
                    title="Enter Marks"
                    description="Grade assignments & tests"
                    color="bg-purple-50 text-purple-700"
                />
                <QuickAction
                    href="/teacher/assignments"
                    icon="📋"
                    title="Assignments"
                    description="Create & manage tasks"
                    color="bg-amber-50 text-amber-700"
                />
                <QuickAction
                    href="/teacher/lesson-plans"
                    icon="📖"
                    title="Lesson Plans"
                    description="Plan your lessons"
                    color="bg-emerald-50 text-emerald-700"
                />
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900">🔔 Recent Activity</h2>
                </div>
                <div className="p-4 space-y-3">
                    <ActivityItem
                        icon="📝"
                        text="New assignment submitted by Rahul Sharma (10-A)"
                        time="10 minutes ago"
                    />
                    <ActivityItem
                        icon="💬"
                        text="Message from Principal regarding PTM schedule"
                        time="1 hour ago"
                    />
                    <ActivityItem
                        icon="📊"
                        text="Test results published for Class 11-A Mathematics"
                        time="Yesterday"
                    />
                </div>
            </div>
        </div>
    );
}

function QuickAction({
    href,
    icon,
    title,
    description,
    color,
}: {
    href: string;
    icon: string;
    title: string;
    description: string;
    color: string;
}) {
    return (
        <Link
            href={href}
            className={`${color} rounded-xl p-4 hover:shadow-md transition-all`}
        >
            <span className="text-3xl">{icon}</span>
            <h3 className="font-semibold mt-2">{title}</h3>
            <p className="text-sm opacity-80">{description}</p>
        </Link>
    );
}

function ActivityItem({
    icon,
    text,
    time,
}: {
    icon: string;
    text: string;
    time: string;
}) {
    return (
        <div className="flex items-start gap-3">
            <span className="text-xl">{icon}</span>
            <div className="flex-1">
                <p className="text-sm text-gray-700">{text}</p>
                <p className="text-xs text-gray-400">{time}</p>
            </div>
        </div>
    );
}
