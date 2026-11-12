'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { resolveAppUrl } from '@/lib/app-url';

const DARK_HERO_ROUTES = new Set(['/architecture']);

export default function GlobalNavbar() {
    const pathname = usePathname();
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        handleScroll();
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const appUrl = resolveAppUrl();
    const isDarkHeroRoute = Boolean(pathname && DARK_HERO_ROUTES.has(pathname));
    const useLightTheme = scrolled || !isDarkHeroRoute;

    const navSurfaceClass = scrolled
        ? 'bg-ivory/95 backdrop-blur-md border-b border-slate-200/80 shadow-sm py-3'
        : isDarkHeroRoute
          ? 'bg-transparent py-5'
          : 'bg-ivory/90 backdrop-blur-md border-b border-slate-200/70 py-3.5';

    const desktopLinkClass = `text-sm font-medium transition-colors ${
        useLightTheme ? 'text-slate-700 hover:text-oxford' : 'text-slate-200 hover:text-brass-light'
    }`;

    const signInClass = `text-sm font-semibold transition-colors ${
        useLightTheme ? 'text-oxford hover:text-oxford-dark' : 'text-white hover:text-slate-200'
    }`;

    return (
        <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${navSurfaceClass}`}>
            <div className="h-[2px] w-full bg-gradient-to-r from-oxford via-brass to-oxford fixed top-0 left-0" />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center">
                    {/* Oxford Navy & Brass Crest Brand */}
                    <Link href="/" className="flex items-center gap-3 group">
                        <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden ring-1 transition-all ${
                                useLightTheme
                                    ? 'bg-oxford text-ivory ring-brass/50 shadow-sm'
                                    : 'bg-brass text-ivory ring-brass-light/60 shadow-md'
                            }`}
                        >
                            <span className="absolute inset-x-0 top-0 h-[2px] bg-brass-light" />
                            <svg
                                width={20}
                                height={20}
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                            >
                                <path
                                    d="M12 2.5L4.5 5.75V11.5C4.5 16.35 7.7 20.78 12 22C16.3 20.78 19.5 16.35 19.5 11.5V5.75L12 2.5Z"
                                    stroke="currentColor"
                                    strokeWidth="1.75"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <path
                                    d="M8.5 10.5L12 8.5L15.5 10.5L12 12.5L8.5 10.5Z"
                                    fill="#D49B43"
                                    stroke="#D49B43"
                                    strokeWidth="1.2"
                                    strokeLinejoin="round"
                                />
                                <path
                                    d="M9.5 13.25V15.5C9.5 16.35 10.62 17 12 17C13.38 17 14.5 16.35 14.5 15.5V13.25"
                                    stroke="currentColor"
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </div>
                        <span
                            className={`text-xl font-extrabold tracking-tight ${
                                useLightTheme ? 'text-oxford' : 'text-white'
                            }`}
                        >
                            ScholarMind
                        </span>
                    </Link>

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center space-x-7">
                        <Link href="/solutions/ai-agents" className={desktopLinkClass}>
                            Governed AI
                        </Link>
                        <Link href="/pricing" className={desktopLinkClass}>
                            Pricing
                        </Link>
                        <Link href="/guides" className={desktopLinkClass}>
                            Playbooks
                        </Link>
                        <Link href="/tools/dpdp-readiness" className={desktopLinkClass}>
                            DPDP Check
                        </Link>
                        <Link href="/apply-online" className={desktopLinkClass}>
                            Admissions Portal
                        </Link>
                    </div>

                    {/* CTAs */}
                    <div className="hidden md:flex items-center space-x-3.5">
                        <a href={`${appUrl}/login`} className={signInClass}>
                            Sign In
                        </a>
                        <a
                            href={`${appUrl}/setup`}
                            data-testid="navbar-start-workspace"
                            className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${
                                useLightTheme
                                    ? 'border-brass/40 bg-parchment/70 text-oxford hover:bg-parchment'
                                    : 'border-white/25 text-white hover:bg-white/10'
                            }`}
                        >
                            Start Workspace
                        </a>
                        <Link
                            href="/book-demo"
                            className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 group ${
                                useLightTheme
                                    ? 'bg-oxford text-ivory hover:bg-oxford-dark shadow-sm'
                                    : 'bg-ivory text-oxford hover:bg-white shadow-md'
                            }`}
                        >
                            Book Pilot
                            <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                    </div>

                    {/* Mobile menu button */}
                    <div className="flex items-center md:hidden">
                        <button
                            type="button"
                            aria-label="Toggle navigation menu"
                            onClick={() => setMobileOpen(!mobileOpen)}
                            className={useLightTheme ? 'text-oxford' : 'text-white'}
                        >
                            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu Expanded */}
            {mobileOpen && (
                <div className="md:hidden absolute top-full left-0 w-full bg-ivory border-b border-slate-200 shadow-lg py-4 px-4 flex flex-col space-y-3">
                    <Link
                        href="/solutions/ai-agents"
                        onClick={() => setMobileOpen(false)}
                        className="text-slate-700 font-medium px-4 py-2 hover:bg-parchment/60 rounded-lg"
                    >
                        Governed AI
                    </Link>
                    <Link
                        href="/pricing"
                        onClick={() => setMobileOpen(false)}
                        className="text-slate-700 font-medium px-4 py-2 hover:bg-parchment/60 rounded-lg"
                    >
                        Pricing
                    </Link>
                    <Link
                        href="/guides"
                        onClick={() => setMobileOpen(false)}
                        className="text-slate-700 font-medium px-4 py-2 hover:bg-parchment/60 rounded-lg"
                    >
                        Playbooks &amp; Migrations
                    </Link>
                    <Link
                        href="/tools/dpdp-readiness"
                        onClick={() => setMobileOpen(false)}
                        className="text-slate-700 font-medium px-4 py-2 hover:bg-parchment/60 rounded-lg"
                    >
                        2-Min DPDP Readiness Check
                    </Link>
                    <Link
                        href="/apply-online"
                        onClick={() => setMobileOpen(false)}
                        className="text-slate-700 font-medium px-4 py-2 hover:bg-parchment/60 rounded-lg"
                    >
                        Admissions Portal
                    </Link>
                    <div className="h-px bg-slate-200 my-1" />
                    <a
                        href={`${appUrl}/login`}
                        onClick={() => setMobileOpen(false)}
                        className="text-oxford font-semibold px-4 py-2 hover:bg-parchment/60 rounded-lg"
                    >
                        Sign In
                    </a>
                    <a
                        href={`${appUrl}/setup`}
                        onClick={() => setMobileOpen(false)}
                        className="text-center border border-brass/40 bg-parchment text-oxford font-bold px-4 py-3 rounded-xl"
                    >
                        Start Workspace
                    </a>
                    <Link
                        href="/book-demo"
                        onClick={() => setMobileOpen(false)}
                        className="text-center bg-oxford text-ivory font-bold px-4 py-3 rounded-xl shadow-sm"
                    >
                        Book Pilot
                    </Link>
                </div>
            )}
        </nav>
    );
}
