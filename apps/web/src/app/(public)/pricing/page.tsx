import Link from 'next/link';
import ROICalculator from '@/components/public/ROICalculator';
import { Check } from 'lucide-react';

export default function PricingPage() {
    return (
        <div className="min-h-screen bg-slate-50 pt-28 pb-24 animate-fade-in">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">Transparent Scale. <span className="text-indigo-600">Infinite ROI.</span></h1>
                    <p className="text-xl text-slate-500">Stop paying for five separate platforms. Scholar Mind consolidates your entire educational tech stack with embedded AI intelligence.</p>
                </div>

                {/* PRICING CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
                    
                    {/* CORE */}
                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col hover:border-indigo-300 transition-colors">
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Core Foundation</h3>
                        <p className="text-slate-500 text-sm mb-6 min-h-[40px]">Essential multi-tenant SIS for growing campuses.</p>
                        <div className="mb-6">
                            <span className="text-4xl font-black text-slate-900">$10</span>
                            <span className="text-slate-500"> /student /year</span>
                        </div>
                        <ul className="space-y-4 mb-8 flex-1">
                            <li className="flex gap-3 text-sm text-slate-600"><Check size={18} className="text-indigo-500 shrink-0"/> Global Gradebook & Attendance</li>
                            <li className="flex gap-3 text-sm text-slate-600"><Check size={18} className="text-indigo-500 shrink-0"/> Centralized Parent Portal</li>
                            <li className="flex gap-3 text-sm text-slate-600"><Check size={18} className="text-indigo-500 shrink-0"/> Stripe Fee Processing</li>
                            <li className="flex gap-3 text-sm text-slate-600"><Check size={18} className="text-indigo-500 shrink-0"/> Standard HR Tools</li>
                        </ul>
                        <Link href="/apply-online" className="w-full block text-center py-3 px-4 bg-indigo-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 transition">Get Started</Link>
                    </div>

                    {/* AI PRO (POPULAR) */}
                    <div className="bg-slate-900 rounded-3xl p-8 border border-indigo-500 shadow-2xl shadow-indigo-600/20 flex flex-col relative scale-105 z-10">
                        <div className="absolute top-0 right-8 -translate-y-1/2 bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-md">Most Popular</div>
                        <h3 className="text-xl font-bold text-white mb-2">AI Pro</h3>
                        <p className="text-indigo-200 text-sm mb-6 min-h-[40px]">Advanced intelligence overlay replacing manual workflows.</p>
                        <div className="mb-6">
                            <span className="text-4xl font-black text-white">$18</span>
                            <span className="text-indigo-300"> /student /year</span>
                        </div>
                        <ul className="space-y-4 mb-8 flex-1 text-indigo-100">
                            <li className="flex gap-3 text-sm"><Check size={18} className="text-emerald-400 shrink-0"/> Everything in Core</li>
                            <li className="flex gap-3 text-sm"><Check size={18} className="text-emerald-400 shrink-0"/> 26 Native AI Agents active</li>
                            <li className="flex gap-3 text-sm"><Check size={18} className="text-emerald-400 shrink-0"/> Autonomous Fee Default Prediction</li>
                            <li className="flex gap-3 text-sm"><Check size={18} className="text-emerald-400 shrink-0"/> Churn/Dropout Sentinels</li>
                        </ul>
                        <Link href="/book-demo" className="w-full block text-center py-3 px-4 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 transition shadow-lg">Book Full VIP Demo</Link>
                    </div>

                    {/* ENTERPRISE */}
                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col hover:border-slate-300 transition-colors">
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Enterprise Scale</h3>
                        <p className="text-slate-500 text-sm mb-6 min-h-[40px]">Complete technical autonomy for trust networks.</p>
                        <div className="mb-6">
                            <span className="text-4xl font-black text-slate-900">$30</span>
                            <span className="text-slate-500"> /student /year</span>
                        </div>
                        <ul className="space-y-4 mb-8 flex-1">
                            <li className="flex gap-3 text-sm text-slate-600"><Check size={18} className="text-indigo-500 shrink-0"/> Dedicated AWS/Azure DB Clustering</li>
                            <li className="flex gap-3 text-sm text-slate-600"><Check size={18} className="text-indigo-500 shrink-0"/> Custom Domain Masking</li>
                            <li className="flex gap-3 text-sm text-slate-600"><Check size={18} className="text-indigo-500 shrink-0"/> Private Model Weight Tweaking</li>
                            <li className="flex gap-3 text-sm text-slate-600"><Check size={18} className="text-indigo-500 shrink-0"/> Dedicated God-Mode HQ Portal</li>
                        </ul>
                        <Link href="/book-demo" className="w-full block text-center py-3 px-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition">Contact Enterprise Sales</Link>
                    </div>

                </div>

                {/* ROI CALCULATOR SECTION */}
                <div className="mt-12">
                    <ROICalculator />
                </div>
            </div>
        </div>
    );
}
