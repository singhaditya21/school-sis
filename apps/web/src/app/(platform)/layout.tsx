'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { logoutAction } from '@/lib/actions/auth';
import { LayoutDashboard, Building2, CreditCard, BrainCircuit, Search, LogOut, Earth } from 'lucide-react';

export default function PlatformLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();

    const navItems = [
        { name: 'Global Dashboard', href: '/platform', icon: LayoutDashboard },
        { name: 'Tenant Schools', href: '/platform/tenants', icon: Building2 },
        { name: 'Stripe Billing', href: '/platform/billing', icon: CreditCard },
        { name: 'AI Analytics', href: '/platform/analytics', icon: BrainCircuit },
    ];

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans selection:bg-indigo-500/30">
            {/* Premium Glassmorphic Sidebar */}
            <aside className="w-72 bg-slate-950 text-slate-300 min-h-screen border-r border-white/10 shadow-2xl flex flex-col relative overflow-hidden">
                {/* Background Glow */}
                <div className="absolute top-0 left-0 w-full h-96 bg-indigo-500/10 blur-[100px] pointer-events-none rounded-full transform -translate-y-1/2"></div>
                
                <div className="p-8 border-b border-white/5 relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
                            <Earth className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg tracking-tight text-white">ScholarMind HQ</h1>
                            <p className="text-xs text-indigo-400 font-medium uppercase tracking-wider">Command Center</p>
                        </div>
                    </div>
                </div>

                <nav className="p-6 flex-1 space-y-2 relative z-10">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || (item.href !== '/platform' && pathname.startsWith(item.href));
                        const Icon = item.icon;
                        return (
                            <Link 
                                key={item.name} 
                                href={item.href} 
                                className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group ${
                                    isActive 
                                    ? 'bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/20 shadow-inner' 
                                    : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
                                }`}
                            >
                                <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                {/* Founder Profile Bottom */}
                <div className="p-6 border-t border-white/5 relative z-10">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-white/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-white">SF</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">SaaS Founder</p>
                            <p className="text-xs text-slate-500 truncate">founder@scholarmind.com</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Layout Area */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50 relative">
                {/* Subtle top gradient */}
                <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-indigo-50/50 to-transparent pointer-events-none"></div>

                <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/60 h-20 px-10 flex items-center justify-between sticky top-0 z-20 flex-shrink-0">
                    <div className="flex items-center gap-4 w-96 relative group">
                        <Search className="w-4 h-4 text-slate-400 absolute left-4 group-focus-within:text-indigo-500 transition-colors" />
                        <input 
                            type="text" 
                            placeholder="Search tenants, transactions, or alerts..."
                            className="w-full pl-11 pr-5 py-2.5 bg-slate-100/50 border border-slate-200 rounded-full text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all shadow-sm"
                        />
                    </div>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={async () => { await logoutAction() }}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-100 border border-transparent rounded-full transition-all"
                        >
                            <LogOut className="w-4 h-4" />
                            Disconnect
                        </button>
                    </div>
                </header>
                <div className="flex-1 overflow-y-auto p-10 relative z-10 pb-24">
                    {children}
                </div>
            </main>
        </div>
    );
}
