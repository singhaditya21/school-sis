'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
    BookOpen,
    CalendarDays,
    CheckSquare,
    ClipboardList,
    FileText,
    ReceiptText,
    ShieldCheck,
    UsersRound,
    WalletCards,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CapabilityId } from '@/lib/capabilities/types';

interface Module {
    id: string;
    capabilityId: CapabilityId;
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
        capabilityId: 'payments',
        title: 'Fees & Dues Intelligence',
        description: 'Track collections, analyze defaulters, and automate reminders',
        icon: WalletCards,
        href: '/fees',
        featured: true,
        badge: 'Primary',
        actions: [
            { label: 'Generate Invoices', href: '/app/invoice' },
            { label: 'Record Payment', href: '/app/invoice' },
            { label: 'Send Reminder', href: '/fees/defaulters' },
        ],
    },
    {
        id: 'admissions',
        capabilityId: 'core-sis',
        title: 'Admissions CRM',
        description: 'Manage leads, applications, and enrollment pipeline',
        icon: ClipboardList,
        href: '/admissions',
        actions: [
            { label: 'New Lead', href: '/admissions/new' },
            { label: 'View Pipeline', href: '/admissions' },
        ],
    },
    {
        id: 'timetable',
        capabilityId: 'core-sis',
        title: 'Timetable & Substitution',
        description: 'Schedule classes, manage periods, and assign substitutes',
        icon: CalendarDays,
        href: '/timetable',
        actions: [
            { label: 'View Grid', href: '/timetable/grid' },
        ],
    },
    {
        id: 'consent',
        capabilityId: 'core-sis',
        title: 'Consent & Audit',
        description: 'Guardian consent management and comprehensive audit logs',
        icon: ShieldCheck,
        href: '/consent',
    },
];

const PARENT_MODULES: Module[] = [
    {
        id: 'children',
        capabilityId: 'portals',
        title: 'My Children',
        description: 'View profiles, attendance, and academic progress',
        icon: UsersRound,
        href: '/overview',
        featured: true,
    },
    {
        id: 'invoices',
        capabilityId: 'payments',
        title: 'Invoices & Dues',
        description: 'View all pending and past invoices',
        icon: ReceiptText,
        href: '/my-fees',
        actions: [
            { label: 'Pay Now', href: '/my-fees/pay' },
        ],
    },
    {
        id: 'receipts',
        capabilityId: 'payments',
        title: 'Payment Receipts',
        description: 'Download and print payment receipts',
        icon: FileText,
        href: '/my-fees',
    },
];

const TEACHER_MODULES: Module[] = [
    {
        id: 'timetable',
        capabilityId: 'core-sis',
        title: "Today's Timetable",
        description: 'Your classes for today',
        icon: CalendarDays,
        href: '/timetable',
        featured: true,
    },
    {
        id: 'attendance',
        capabilityId: 'core-sis',
        title: 'Attendance Draft',
        description: 'Mark and submit attendance',
        icon: CheckSquare,
        href: '/attendance',
    },
    {
        id: 'classes',
        capabilityId: 'portals',
        title: 'My Classes',
        description: 'Manage your assigned classes',
        icon: BookOpen,
        href: '/teacher/my-classes',
    },
];

interface ModuleGridProps {
    role: string;
    availableCapabilities: readonly CapabilityId[];
}

export function ModuleGrid({ role, availableCapabilities }: ModuleGridProps) {
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

    const modules = getModules().filter((module) => availableCapabilities.includes(module.capabilityId));

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((module) => {
                const ModuleIcon = module.icon;
                return (
                    <Card
                        key={module.id}
                        className={`transition-shadow hover:shadow-md ${module.featured
                            ? 'border-primary/20 bg-primary/5 md:col-span-2 lg:col-span-2'
                            : ''
                        }`}
                    >
                    <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <ModuleIcon className="size-5" aria-hidden="true" />
                                </span>
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
                );
            })}
        </div>
    );
}
