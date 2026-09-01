'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface StudentNavLink {
    href: string;
    icon: string;
    label: string;
}

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
                return (
                    <Link
                        key={href}
                        href={href}
                        className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 md:py-3 rounded-lg transition-colors min-w-[72px] md:min-w-0 ${
                            active
                                ? 'text-violet-700 bg-violet-50 md:bg-muted md:text-foreground border-t-2 md:border-t-0 md:border-l-4 border-violet-600'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                    >
                        <span className={`text-xl md:text-lg ${active ? 'md:text-violet-600' : ''}`}>{icon}</span>
                        <span className={`text-[10px] md:text-sm font-medium ${active ? 'font-semibold' : ''}`}>{label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
