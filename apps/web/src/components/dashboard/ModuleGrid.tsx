'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
    Award,
    Bus,
    CalendarClock,
    CheckSquare,
    FileText,
    IndianRupee,
    MessageSquare,
    Receipt,
    ShieldCheck,
    UserPlus,
    Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Module {
    id: string;
    title: string;
    description: string;
    icon: LucideIcon;
    href: string;
    actions?: { label: string; href: string }[];
    featured?: boolean;
    badge?: string;
}

const ADMIN_MODULES: Module[] = [
    {
        id: 'fees',
        title: 'Fees & Dues Intelligence',
        description: 'Track collections, issue 1-click WhatsApp UPI links, and automate reminders',
        icon: IndianRupee,
        href: '/fees',
        featured: true,
        badge: 'Primary',
        actions: [
            { label: 'Generate Invoices', href: '/fees/generate' },
            { label: 'Record Payment', href: '/invoices?status=PENDING' },
            { label: 'Send Reminder', href: '/fees/defaulters' },
        ],
    },
    {
        id: 'concierge',
        title: '2-Way WhatsApp Concierge',
        description: 'Verified guardian menu for instant UPI pay links, receipts, attendance & bus status',
        icon: MessageSquare,
        href: '/messages/concierge',
        badge: 'Habit Loop',
        actions: [
            { label: 'Live Simulator', href: '/messages/concierge' },
            { label: 'Message Log', href: '/messages' },
        ],
    },
    {
        id: 'report-cards',
        title: 'Board Report Card Studio',
        description: 'CBSE, ICSE, NEP 2020 HPC & IB mark sheets with cryptographic QR verification',
        icon: Award,
        href: '/exams/report-cards',
        actions: [
            { label: 'Open Studio', href: '/exams/report-cards' },
            { label: 'Manage Exams', href: '/exams' },
        ],
    },
    {
        id: 'admissions',
        title: 'Admissions CRM',
        description: 'Manage leads, applications, and enrollment pipeline',
        icon: UserPlus,
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
        icon: CalendarClock,
        href: '/timetable',
    },
    {
        id: 'transport',
        title: 'Transport & Dismissal',
        description: 'Routes, stops, vehicle tracking, and verified gate-pass dismissal',
        icon: Bus,
        href: '/transport',
    },
    {
        id: 'consent',
        title: 'Consent & Audit',
        description: 'Guardian consent management and comprehensive audit logs',
        icon: ShieldCheck,
        href: '/consent',
    },
];

const PARENT_MODULES: Module[] = [
    {
        id: 'children',
        title: 'My Children',
        description: 'View profiles, attendance, and academic progress',
        icon: Users,
        href: '/overview',
        featured: true,
    },
    {
        id: 'invoices',
        title: 'Invoices & Dues',
        description: 'View all pending and past invoices',
        icon: Receipt,
        href: '/my-fees',
        actions: [
            { label: 'Pay Now', href: '/my-fees/pay' },
        ],
    },
    {
        id: 'receipts',
        title: 'Payment Receipts',
        description: 'Download and print official payment receipts',
        icon: FileText,
        href: '/my-fees',
    },
    {
        id: 'transport',
        title: 'Transport & Gate Pass',
        description: 'View assigned bus route and verified digital dismissal pass',
        icon: Bus,
        href: '/my-transport',
    },
];

const TEACHER_MODULES: Module[] = [
    {
        id: 'timetable',
        title: "Today's Timetable",
        description: 'Your scheduled periods and room assignments for today',
        icon: CalendarClock,
        href: '/timetable',
        featured: true,
    },
    {
        id: 'attendance',
        title: 'Attendance Register',
        description: 'Mark and submit roll-call attendance in under 30 seconds',
        icon: CheckSquare,
        href: '/attendance',
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
            {modules.map((module) => {
                const Icon = module.icon;
                return (
                    <Card
                        key={module.id}
                        className={`transition-all hover:shadow-md ${
                            module.featured
                                ? 'md:col-span-2 lg:col-span-2 border-brass/40 bg-accent/40'
                                : 'border-border bg-card hover:border-brass/35'
                        }`}
                    >
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3.5">
                                    <div
                                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                                            module.featured
                                                ? 'border-brass/45 bg-primary text-primary-foreground shadow-sm'
                                                : 'border-brass/30 bg-accent text-primary'
                                        }`}
                                    >
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg flex flex-wrap items-center gap-2">
                                            {module.title}
                                            {module.badge && (
                                                <Badge
                                                    variant="outline"
                                                    className="border-brass/40 bg-accent text-accent-foreground text-xs"
                                                >
                                                    {module.badge}
                                                </Badge>
                                            )}
                                        </CardTitle>
                                        <CardDescription className="mt-1">{module.description}</CardDescription>
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
                );
            })}
        </div>
    );
}
