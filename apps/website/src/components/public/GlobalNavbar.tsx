'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { resolveAppUrl } from '@/lib/app-url';

const DARK_HERO_ROUTES = new Set(['/', '/architecture']);

export default function GlobalNavbar() {
    const pathname = usePathname();
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        // Correct initial state after mount to avoid hydration mismatch
        handleScroll();
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const appUrl = resolveAppUrl();
    const isDarkHeroRoute = Boolean(pathname && DARK_HERO_ROUTES.has(pathname));
    const useLightTheme = scrolled || !isDarkHeroRoute;

    const navSurfaceClass = scrolled
        ? 'bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm py-3'
        : isDarkHeroRoute
          ? 'bg-transparent py-5'
          : 'bg-white/85 backdrop-blur-md border-b border-slate-200/70 py-4';

    const desktopLinkClass = `text-sm font-medium transition-colors ${
        useLightTheme ? 'text-slate-700 hover:text-indigo-600' : 'text-gray-200 hover:text-indigo-400'
    }`;

    const signInClass = `text-sm font-bold transition-colors ${
        useLightTheme ? 'text-slate-700 hover:text-slate-900' : 'text-white hover:text-gray-200'
    }`;

    return (
        <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${navSurfaceClass}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center">
                    {/* Brand */}
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            useLightTheme
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                : 'bg-white text-indigo-600 shadow-xl'
                        }`}>
                            <span className="text-xl font-bold">SM</span>
                        </div>
                        <span className={`text-xl font-extrabold tracking-tight ${
                            useLightTheme ? 'text-slate-900' : 'text-white'
                        }`}>
                            ScholarMind
                        </span>
                    </Link>

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center space-x-8">
                        <Link href="/solutions/ai-agents" className={desktopLinkClass}>AI Agents</Link>
                        <Link href="/pricing" className={desktopLinkClass}>Pricing</Link>
                        <Link href="/apply-online" className={desktopLinkClass}>Apply</Link>
                    </div>

                    {/* CTAs */}
                    <div className="hidden md:flex items-center space-x-4">
                        <a href={`${appUrl}/login`} className={signInClass}>
                            Sign In
                        </a>
                        <a
                            href={`${appUrl}/setup`}
                            data-testid="navbar-start-workspace"
                            className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                                useLightTheme
                                    ? 'border-indigo-200 text-indigo-700 hover:bg-indigo-50'
                                    : 'border-white/25 text-white hover:bg-white/10'
                            }`}
                        >
                            Start Workspace
                        </a>
                        <Link href="/book-demo" className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 group ${
                            useLightTheme
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-600/30'
                                : 'bg-white text-indigo-600 hover:bg-gray-50 hover:shadow-xl hover:-translate-y-0.5'
                        }`}>
                            Book Demo
                            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>

                    {/* Mobile menu button */}
                    <div className="flex items-center md:hidden">
                        <button
                            type="button"
                            aria-label="Toggle navigation menu"
                            onClick={() => setMobileOpen(!mobileOpen)}
                            className={useLightTheme ? 'text-slate-900' : 'text-white'}
                        >
                            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu Expanded */}
            {mobileOpen && (
                <div className="md:hidden absolute top-full left-0 w-full bg-white border-b border-gray-200 shadow-lg py-4 px-4 flex flex-col space-y-4">
                    <Link href="/solutions/ai-agents" onClick={() => setMobileOpen(false)} className="text-gray-700 font-medium px-4 py-2 hover:bg-gray-50 rounded-lg">AI Agents</Link>
                    <Link href="/pricing" onClick={() => setMobileOpen(false)} className="text-gray-700 font-medium px-4 py-2 hover:bg-gray-50 rounded-lg">Pricing</Link>
                    <Link href="/apply-online" onClick={() => setMobileOpen(false)} className="text-gray-700 font-medium px-4 py-2 hover:bg-gray-50 rounded-lg">Apply Preview</Link>
                    <div className="h-px bg-gray-100 my-2"></div>
                    <a href={`${appUrl}/login`} onClick={() => setMobileOpen(false)} className="text-gray-700 font-medium px-4 py-2 hover:bg-gray-50 rounded-lg">Sign In</a>
                    <a href={`${appUrl}/setup`} onClick={() => setMobileOpen(false)} className="text-center border border-indigo-200 text-indigo-700 font-bold px-4 py-3 rounded-xl hover:bg-indigo-50">Start Workspace</a>
                    <Link href="/book-demo" onClick={() => setMobileOpen(false)} className="text-center bg-indigo-600 text-white font-bold px-4 py-3 rounded-xl shadow-md">Book Demo</Link>
                </div>
            )}
        </nav>
    );
}
