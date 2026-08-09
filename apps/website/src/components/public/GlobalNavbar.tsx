'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';

const links = [
    { href: '/architecture', label: 'Architecture' },
    { href: '/solutions/ai-agents', label: 'AI governance' },
    { href: '/pricing', label: 'Packages' },
];

export default function GlobalNavbar() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    return (
        <nav aria-label="Primary navigation" className="fixed inset-x-0 top-0 z-50 border-b border-slate-800 bg-slate-950/95 text-white shadow-sm backdrop-blur-md">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
                <Link href="/" className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-sm font-black shadow-lg shadow-indigo-500/20">SM</span>
                    <span className="text-xl font-extrabold tracking-tight">ScholarMind</span>
                </Link>

                <div className="hidden items-center gap-8 md:flex">
                    {links.map((link) => (
                        <Link key={link.href} href={link.href} className="rounded-md text-sm font-semibold text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                            {link.label}
                        </Link>
                    ))}
                </div>

                <div className="hidden items-center gap-4 md:flex">
                    {appUrl ? (
                        <a href={`${appUrl}/login`} className="rounded-md text-sm font-bold text-slate-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">Sign in</a>
                    ) : null}
                    <Link href="/book-demo" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                        Book a session <ArrowRight aria-hidden="true" size={16} />
                    </Link>
                </div>

                <button
                    type="button"
                    aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
                    aria-expanded={mobileOpen}
                    aria-controls="mobile-navigation"
                    onClick={() => setMobileOpen((open) => !open)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 md:hidden"
                >
                    {mobileOpen ? <X aria-hidden="true" size={24} /> : <Menu aria-hidden="true" size={24} />}
                </button>
            </div>

            {mobileOpen ? (
                <div id="mobile-navigation" className="border-t border-slate-800 bg-slate-950 px-4 py-4 md:hidden">
                    <div className="mx-auto flex max-w-7xl flex-col gap-2">
                        {links.map((link) => (
                            <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className="rounded-lg px-4 py-3 font-semibold text-slate-200 hover:bg-slate-800 hover:text-white">
                                {link.label}
                            </Link>
                        ))}
                        {appUrl ? (
                            <a href={`${appUrl}/login`} onClick={() => setMobileOpen(false)} className="rounded-lg px-4 py-3 font-semibold text-slate-200 hover:bg-slate-800 hover:text-white">Sign in</a>
                        ) : null}
                        <Link href="/book-demo" onClick={() => setMobileOpen(false)} className="mt-2 rounded-xl bg-indigo-500 px-4 py-3 text-center font-bold text-white">Book a session</Link>
                    </div>
                </div>
            ) : null}
        </nav>
    );
}
