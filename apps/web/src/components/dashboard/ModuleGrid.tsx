'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Module {
    id: string;
    title: string;
    description: string;
    icon: string;
    href: string;
    actions?: { label: string; href: string }[];
    featured?: boolean;
    badge?: string;
}

const ADMIN_MODULES: Module[] = [
    {
        id: 'fees',
        title: 'Fees & Dues Intelligence',
        description: 'Track collections, analyze defaulters, and automate reminders',
        icon: '💰',
        href: '/fees',
        featured: true,
        badge: 'Primary',
        actions: [
            { label: 'Generate Invoices', href: '/invoices' },
            { label: 'Record Payment', href: '/invoices' },
            { label: 'Send Reminder', href: '/fees/defaulters' },
        ],
    },
    {
        id: 'admissions',
        title: 'Admissions CRM',
        description: 'Manage leads, applications, and enrollment pipeline',
        icon: '📝',
        href: '/admissions',
        actions: [
            { label: 'New Lead', href: '/admissions/new' },
            { label: 'View Pipeline', href: '/admissions' },
        ],
    },
    {
        id: 'timetable',
        title: 'Timetable & Substitution',
        description: 'Schedule classes, manage periods, and assign substitutes',
        icon: '📅',
        href: '/timetable',
        actions: [
            { label: 'View Grid', href: '/timetable/grid' },
        ],
    },
    {
        id: 'transport',
        title: 'Transport',
        description: 'Routes, stops, vehicle tracking, and parent notifications',
        icon: '🚌',
        href: '/transport',
    },
    {
        id: 'consent',
        title: 'Consent & Audit',
        description: 'Guardian consent management and comprehensive audit logs',
        icon: '✅',
        href: '/consent',
    },
];

const PARENT_MODULES: Module[] = [
    {
        id: 'children',
        title: 'My Children',
        description: 'View profiles, attendance, and academic progress',
        icon: '👨‍👩‍👧‍👦',
        href: '/overview',
        featured: true,
    },
    {
        id: 'invoices',
        title: 'Invoices & Dues',
        description: 'View all pending and past invoices',
        icon: '🧾',
        href: '/my-fees',
        actions: [
            { label: 'Pay Now', href: '/my-fees/pay' },
        ],
    },
    {
        id: 'receipts',
        title: 'Payment Receipts',
        description: 'Download and print payment receipts',
        icon: '📄',
        href: '/my-fees',
    },
    {
        id: 'transport',
        title: 'Transport Tracker',
        description: 'Track your child\'s bus in real-time',
        icon: '🚌',
        href: '/my-transport',
    },
];

const TEACHER_MODULES: Module[] = [
    {
        id: 'timetable',
        title: "Today's Timetable",
        description: 'Your classes for today',
        icon: '📅',
        href: '/timetable',
        featured: true,
    },
    {
        id: 'attendance',
        title: 'Attendance Draft',
        description: 'Mark and submit attendance',
        icon: '✓',
        href: '/attendance',
    },
    {
        id: 'classes',
        title: 'My Classes',
        description: 'Manage your assigned classes',
        icon: '📚',
        href: '/classes',
    },
];

interface ModuleGridProps {
    role: string;
}

export function ModuleGrid({ role }: ModuleGridProps) {
    const getModules = () => {
        switch (role) {
            case 'PARENT':
                return PARENT_MODULES;
            case 'TEACHER':
                return TEACHER_MODULES;
            default:
                return ADMIN_MODULES;
        }
    };

    const modules = getModules();

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((module) => (
                <Card
                    key={module.id}
                    className={`transition-all hover:shadow-md ${module.featured
                            ? 'md:col-span-2 lg:col-span-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-950/30 dark:to-purple-950/30'
                            : ''
                        }`}
                >
                    <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-3xl">{module.icon}</span>
                                <div>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        {module.title}
                                        {module.badge && (
                                            <Badge variant="secondary" className="text-xs">
                                                {module.badge}
                                            </Badge>
                                        )}
                                    </CardTitle>
                                    <CardDescription>{module.description}</CardDescription>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            <Button asChild variant="default" size="sm">
                                <Link href={module.href}>Open</Link>
                            </Button>
                            {module.actions?.map((action, i) => (
                                <Button key={i} asChild variant="outline" size="sm">
                                    <Link href={action.href}>{action.label}</Link>
                                </Button>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
