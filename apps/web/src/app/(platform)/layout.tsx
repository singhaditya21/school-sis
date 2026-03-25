'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { logoutAction } from '@/lib/actions/auth';

export default function PlatformLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <aside className="w-72 bg-slate-900 text-white min-h-screen border-r border-slate-800 shadow-xl flex flex-col">
                <div className="p-8 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-xl shadow-lg shadow-indigo-500/30">
                            🌍
                        </div>
                        <div>
                            <h1 className="font-bold text-lg tracking-tight">ScholarMind HQ</h1>
                            <p className="text-xs text-slate-400 font-medium">Platform Administration</p>
                        </div>
                    </div>
                </div>

                <nav className="p-6 flex-1 space-y-2">
                    <Link href="/platform" className="flex items-center gap-4 px-4 py-3 rounded-xl bg-indigo-500/10 text-indigo-400 font-medium border border-indigo-500/20">
                        <span className="text-xl">📊</span> Global Dashboard
                    </Link>
                    <Link href="#" className="flex items-center gap-4 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-white transition-colors">
                        <span className="text-xl">🏫</span> Tenant Schools
                    </Link>
                    <Link href="#" className="flex items-center gap-4 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-white transition-colors">
                        <span className="text-xl">💳</span> Stripe Billing
                    </Link>
                    <Link href="#" className="flex items-center gap-4 px-4 py-3 rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-white transition-colors">
                        <span className="text-xl">🤖</span> AI Analytics
                    </Link>
                </nav>
            </aside>

            {/* Main Layout Area */}
            <main className="flex-1 overflow-x-hidden">
                <header className="bg-white border-b border-slate-200 h-20 px-10 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <input 
                            type="text" 
                            placeholder="Find a school tenant (e.g., DPSN)..."
                            className="w-96 px-5 py-2.5 bg-slate-100 border-none rounded-full text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition"
                        />
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-semibold text-slate-900">SaaS Founder</span>
                            <span className="text-xs text-slate-500">Platform Super Admin</span>
                        </div>
                        <button 
                            onClick={async () => { await logoutAction() }}
                            className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
                        >
                            Log Out
                        </button>
                    </div>
                </header>
                <div className="p-10">
                    {children}
                </div>
            </main>
        </div>
    );
}
