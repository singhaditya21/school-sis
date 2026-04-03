import Link from 'next/link';
import { Bot, LineChart, ShieldAlert, BadgeCent } from 'lucide-react';

export default function AIAgentsDeepDivePage() {
    return (
        <div className="min-h-screen bg-slate-50 pt-28 pb-24 animate-fade-in relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                
                {/* HERO HEADER */}
                <div className="text-center max-w-4xl mx-auto mb-20 relative z-10">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-100 text-indigo-700 font-bold mb-6">
                        <Bot size={18} /> Our Differentiator
                    </div>
                    <h1 className="text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-tight mb-6">
                        Stop recording data.<br/>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-emerald-500">Start acting on it.</span>
                    </h1>
                    <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
                        Standard software just stores numbers in a database. Scholar Mind embeds 26 autonomous AI Agents that actively patrol your campus data 24/7.
                    </p>
                    <Link href="/book-demo" className="inline-flex px-8 py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(79,70,229,0.5)] transition-all">
                        See the Agents live
                    </Link>
                </div>

                {/* AGENT MATRIX */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    
                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm group hover:border-indigo-300 transition-all hover:shadow-xl">
                        <div className="w-14 h-14 bg-rose-50 text-rose-600 flex items-center justify-center rounded-2xl mb-6 group-hover:scale-110 transition-transform">
                            <ShieldAlert size={28} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-3">Dropout Sentinel</h3>
                        <p className="text-slate-500 leading-relaxed">Cross-references declining grade structures with sudden attendance gaps to flag students mathematically likely to leave the institution before they ever do.</p>
                    </div>

                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm group hover:border-emerald-300 transition-all hover:shadow-xl">
                        <div className="w-14 h-14 bg-emerald-50 text-emerald-600 flex items-center justify-center rounded-2xl mb-6 group-hover:scale-110 transition-transform">
                            <BadgeCent size={28} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-3">Fee Intelligence</h3>
                        <p className="text-slate-500 leading-relaxed">Scans payment histories to predict which families will likely default on upcoming tuition installments, allowing preemptive financial counseling.</p>
                    </div>

                    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm group hover:border-sky-300 transition-all hover:shadow-xl">
                        <div className="w-14 h-14 bg-sky-50 text-sky-600 flex items-center justify-center rounded-2xl mb-6 group-hover:scale-110 transition-transform">
                            <LineChart size={28} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-3">Resource Load Balancer</h3>
                        <p className="text-slate-500 leading-relaxed">Dynamically maps HR schedules, bus transit routes, and physical campus capacities to optimize overhead budgets.</p>
                    </div>
                </div>

            </div>
        </div>
    );
}
