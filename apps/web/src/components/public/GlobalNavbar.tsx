'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';

export default function GlobalNavbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
            scrolled ? 'bg-white/80 backdrop-blur-md border-b border-gray-200/50 shadow-sm py-3' : 'bg-transparent py-5'
        }`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center">
                    {/* Brand */}
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                            scrolled ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-white text-indigo-600 shadow-xl'
                        }`}>
                            <span className="text-xl font-bold">SM</span>
                        </div>
                        <span className={`text-xl font-extrabold tracking-tight ${
                            scrolled ? 'text-gray-900' : 'text-white'
                        }`}>
                            ScholarMind
                        </span>
                    </Link>

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center space-x-8">
                        <Link href="/solutions/ai-agents" className={`text-sm font-medium transition-colors hover:text-indigo-400 ${
                            scrolled ? 'text-gray-600 hover:text-indigo-600' : 'text-gray-200'
                        }`}>AI Agents</Link>
                        <Link href="/pricing" className={`text-sm font-medium transition-colors hover:text-indigo-400 ${
                            scrolled ? 'text-gray-600 hover:text-indigo-600' : 'text-gray-200'
                        }`}>Pricing</Link>
                        <Link href="/apply-online" className={`text-sm font-medium transition-colors hover:text-indigo-400 ${
                            scrolled ? 'text-gray-600 hover:text-indigo-600' : 'text-gray-200'
                        }`}>Apply</Link>
                    </div>

                    {/* CTAs */}
                    <div className="hidden md:flex items-center space-x-4">
                        <Link href="/login" className={`text-sm font-bold transition-colors ${
                            scrolled ? 'text-gray-700 hover:text-gray-900' : 'text-white hover:text-gray-200'
                        }`}>
                            Sign In
                        </Link>
                        <Link href="#demo" className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 group ${
                            scrolled ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-600/30' : 'bg-white text-indigo-600 hover:bg-gray-50 hover:shadow-xl hover:-translate-y-0.5'
                        }`}>
                            Book Demo
                            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>

                    {/* Mobile menu button */}
                    <div className="flex items-center md:hidden">
                        <button onClick={() => setMobileOpen(!mobileOpen)} className={`${scrolled ? 'text-gray-900' : 'text-white'}`}>
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
                    <Link href="/apply-online" onClick={() => setMobileOpen(false)} className="text-gray-700 font-medium px-4 py-2 hover:bg-gray-50 rounded-lg">Apply Online</Link>
                    <div className="h-px bg-gray-100 my-2"></div>
                    <Link href="/login" onClick={() => setMobileOpen(false)} className="text-gray-700 font-medium px-4 py-2 hover:bg-gray-50 rounded-lg">Sign In</Link>
                    <Link href="#demo" onClick={() => setMobileOpen(false)} className="text-center bg-indigo-600 text-white font-bold px-4 py-3 rounded-xl shadow-md">Book Demo</Link>
                </div>
            )}
        </nav>
    );
}
