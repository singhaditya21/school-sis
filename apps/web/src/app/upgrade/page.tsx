'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function UpgradeContent() {
    const searchParams = useSearchParams();
    const feature = searchParams.get('feature') || 'premium';

    const featureMap: Record<string, string> = {
        hq: "Group HQ Command Center",
        university: "Higher Education & Degrees",
        coaching: "Coaching Batches & Test Series",
        international: "International Visas & Placements",
        ai: "ScholarMind AI Agents (Pro Tier)",
        premium: "Premium Modules"
    };

    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <p className="text-slate-500">Loading...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-10 rounded-3xl shadow-xl max-w-2xl w-full text-center border border-slate-100">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="text-4xl">🔒</span>
                </div>
                
                <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
                    Upgrade to Unlock {featureMap[feature]}
                </h1>
                
                <p className="text-lg text-slate-600 mb-10 leading-relaxed">
                    This module is restricted to the <strong>AI Pro</strong> and <strong>Enterprise</strong> subscription tiers. 
                    Upgrade your school's plan to access advanced multi-campus management, 
                    AI reasoning agents, and extensive integrations.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10 text-left">
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
                        <h3 className="font-semibold text-slate-900 mb-2">AI Pro Tier</h3>
                        <p className="text-sm text-slate-500 mb-4">$18 / student / year</p>
                        <ul className="text-sm space-y-2 text-slate-700">
                            <li>✓ All 26 AI Agents</li>
                            <li>✓ Event-driven PG Vector Sync</li>
                            <li>✓ Chatbot Guardrails</li>
                        </ul>
                    </div>
                    <div className="p-6 bg-blue-50 rounded-2xl border border-blue-200 ring-2 ring-blue-500 ring-offset-2">
                        <h3 className="font-semibold text-blue-900 mb-2">Enterprise Tier</h3>
                        <p className="text-sm text-blue-600 mb-4">$30 / student / year</p>
                        <ul className="text-sm space-y-2 text-blue-800">
                            <li>✓ Multi-Campus Super Admin</li>
                            <li>✓ Higher Ed & Coaching Branches</li>
                            <li>✓ International Placements</li>
                        </ul>
                    </div>
                </div>

                <div className="flex justify-center gap-4">
                    <button className="px-8 py-4 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200">
                        Contact Sales to Upgrade
                    </button>
                    <button onClick={() => window.history.back()} className="px-8 py-4 bg-white text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors border border-slate-200">
                        Go Back
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function UpgradePaywall() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-500">Loading...</p></div>}>
            <UpgradeContent />
        </Suspense>
    );
}
