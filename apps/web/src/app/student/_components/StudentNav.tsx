'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    CalendarCheck,
    Award,
    BookOpenCheck,
    type LucideIcon,
} from 'lucide-react';

export type StudentNavIconKey = 'overview' | 'attendance' | 'results' | 'homework';

export interface StudentNavLink {
    href: string;
    icon: StudentNavIconKey;
    label: string;
}

const ICONS: Record<StudentNavIconKey, LucideIcon> = {
    overview: LayoutDashboard,
    attendance: CalendarCheck,
    results: Award,
    homework: BookOpenCheck,
};

/**
 * Links are declared in `student/layout.tsx` (a NAV_SOURCES file for
 * scripts/check-navigation-targets.mjs) and passed down, so the CI gate that
 * proves every nav target resolves keeps covering the student portal.
 */
export function StudentNav({ links }: { links: StudentNavLink[] }) {
    const pathname = usePathname();

    return (
        <nav className="flex md:flex-col justify-around md:justify-start p-2 md:p-4 space-x-1 md:space-x-0 md:space-y-1 overflow-x-auto md:overflow-visible">
            {links.map(({ href, icon, label }) => {
                const active = href === '/student' ? pathname === '/student' : pathname.startsWith(href);
                const Icon = ICONS[icon] ?? LayoutDashboard;
                return (
                    <Link
                        key={href}
                        href={href}
                        className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 md:py-2.5 rounded-lg transition-colors min-w-[72px] md:min-w-0 ${
                            active
                                ? 'text-accent-foreground bg-accent border-t-2 md:border-t-0 md:border-l-4 border-brass'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                    >
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-brass' : ''}`} />
                        <span className={`text-[10px] md:text-sm font-medium ${active ? 'font-semibold' : ''}`}>
                            {label}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
