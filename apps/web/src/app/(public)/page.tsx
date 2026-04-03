import Link from 'next/link';
import { ArrowRight, Bot, ShieldCheck, Zap, LineChart, Globe, Users } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="flex flex-col min-h-screen overflow-x-hidden animate-fade-in">
            {/* HERO SECTION */}
            <section className="relative min-h-[90vh] flex items-center justify-center pt-24 pb-16 overflow-hidden bg-slate-900 bg-[url('/hero-abstract.png')] bg-cover bg-center bg-no-repeat">
                {/* Abstract Background Vectors / Overlays */}
                <div className="absolute inset-0 z-0 bg-slate-900/60 backdrop-blur-[2px]"></div>
                <div className="absolute inset-0 z-0 opacity-40">
                    <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/30 blur-[120px]"></div>
                    <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-violet-600/20 blur-[150px]"></div>
                    <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full bg-sky-500/20 blur-[100px]"></div>
                </div>

                <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white space-y-8">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-sm text-sm font-medium mb-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
                        <span className="flex h-2 w-2 rounded-full bg-emerald-400"></span>
                        Scholar Mind Enterprise v2.0 Live
                    </div>
                    
                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight max-w-5xl mx-auto animate-slide-in">
                        The Operating System for <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">Modern Schools</span>.
                    </h1>
                    
                    <p className="max-w-2xl mx-auto text-xl text-gray-300 animate-slide-in" style={{ animationDelay: '0.2s' }}>
                        Transform campus management with our multi-tenant SaaS architecture. Native AI agents, granular economics, and autonomous compliance.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 animate-fade-in" style={{ animationDelay: '0.3s' }}>
                        <Link href="/apply-online" className="w-full sm:w-auto px-8 py-4 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg transition-all shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_rgba(79,70,229,0.6)] hover:-translate-y-1">
                            Deploy Infrastructure
                        </Link>
                        <Link href="#features" className="w-full sm:w-auto px-8 py-4 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-lg transition-all ring-1 ring-white/20 backdrop-blur-md">
                            Explore Architecture
                        </Link>
                    </div>
                </div>
            </section>

            {/* TRUST BANNER */}
            <section className="py-12 border-b border-gray-200 bg-white">
                <div className="max-w-7xl mx-auto px-4 text-center">
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-8">Trusted by Regional Campuses</p>
                    <div className="flex flex-wrap justify-center gap-12 opacity-60 grayscale filter">
                        {/* Dummy logos relying on typography since no images */}
                        <div className="text-2xl font-bold flex items-center gap-2"><Globe className="text-gray-900"/> GlobalEd Academy</div>
                        <div className="text-2xl font-extrabold font-serif italic line-through decoration-indigo-400">St. Xavier Trust</div>
                        <div className="text-2xl font-black uppercase tracking-tighter">Delhi Public Schools</div>
                        <div className="text-2xl font-mono text-gray-800">GEMS Education</div>
                    </div>
                </div>
            </section>

            {/* BENTO GRID FEATURES */}
            <section id="features" className="py-24 bg-slate-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="mb-16 text-center max-w-3xl mx-auto">
                        <h2 className="text-3xl md:text-5xl font-extrabold text-gray-900 tracking-tight mb-4">Unprecedented Control & Telemetry</h2>
                        <p className="text-xl text-gray-500">Scholar Mind replaces fragmented tools with a singular, monolithic data layer enhanced by generative AI.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[320px]">
                        
                        {/* Box 1: Large Span */}
                        <div className="md:col-span-2 relative bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-8 overflow-hidden group hover:shadow-2xl transition-all border border-indigo-800/50">
                            <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-700">
                                <Bot size={180} className="text-indigo-400" />
                            </div>
                            <div className="relative z-10 h-full flex flex-col justify-end max-w-md">
                                <div className="p-3 bg-indigo-500/20 w-fit rounded-xl backdrop-blur-md mb-4 border border-indigo-400/30">
                                    <Zap className="text-indigo-300" />
                                </div>
                                <h3 className="text-3xl font-bold text-white mb-2">Native AI Agents</h3>
                                <p className="text-indigo-200">26 specialized agents monitor fees, defaults, attendance patterns, and HR workloads with real-time token metering.</p>
                            </div>
                        </div>

                        {/* Box 2: Square */}
                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-200 hover:shadow-xl hover:border-gray-300 transition-all group">
                            <div className="h-full flex flex-col justify-between">
                                <div className="p-3 bg-emerald-50 w-fit rounded-xl group-hover:bg-emerald-100 transition-colors">
                                    <ShieldCheck className="text-emerald-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Platform Auditing</h3>
                                    <p className="text-gray-500 text-sm leading-relaxed">Centralized telemetry array intercepts destructive tech actions safeguarding cross-node integrity automatically.</p>
                                </div>
                            </div>
                        </div>

                        {/* Box 3: Square */}
                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-200 hover:shadow-xl hover:border-gray-300 transition-all group">
                            <div className="h-full flex flex-col justify-between">
                                <div className="p-3 bg-rose-50 w-fit rounded-xl group-hover:bg-rose-100 transition-colors">
                                    <Globe className="text-rose-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Autonomous Deployment</h3>
                                    <p className="text-gray-500 text-sm leading-relaxed">Spin up isolated Postgres enclave hierarchies across precise AWS and Azure cloud regions dynamically.</p>
                                </div>
                            </div>
                        </div>

                        {/* Box 4: Large Span bottom */}
                        <div className="md:col-span-2 bg-gradient-to-r from-slate-100 to-white rounded-3xl p-8 shadow-sm border border-gray-200 relative overflow-hidden group hover:shadow-xl transition-all">
                            <div className="absolute right-[-10%] bottom-[-10%] w-[60%] h-[120%] bg-indigo-50/50 rounded-full blur-3xl group-hover:bg-indigo-100 transition-colors"></div>
                            <div className="relative z-10 h-full flex flex-col justify-center max-w-lg">
                                <div className="flex gap-4 mb-4">
                                    <div className="p-3 bg-white shadow-sm border border-gray-100 rounded-xl"><LineChart className="text-indigo-600" /></div>
                                    <div className="p-3 bg-white shadow-sm border border-gray-100 rounded-xl"><Users className="text-indigo-600" /></div>
                                </div>
                                <h3 className="text-3xl font-bold text-gray-900 mb-3">Enterprise White Labeling</h3>
                                <p className="text-gray-600 text-lg">Inject custom domain masks (`school.clientdomain.com`), primary CSS theme colors, and broadcast cross-node notifications securely.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* FINAL CTA */}
            <section id="demo" className="relative py-24 bg-indigo-600 overflow-hidden text-center">
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-[-50%] left-1/2 -translate-x-1/2 w-full max-w-4xl h-[200%] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                </div>
                <div className="relative z-10 max-w-4xl mx-auto px-4">
                    <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-6">Ready to scale your institution?</h2>
                    <p className="text-xl text-indigo-100 mb-10 max-w-2xl mx-auto">
                        Join the waiting list or deploy an inaugural tenant database right now. Scholar Mind handles the infrastructure. You handle the education.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <Link href="/apply-online" className="px-8 py-4 rounded-full bg-white text-indigo-600 font-extrabold text-lg transition-transform hover:-translate-y-1 shadow-2xl">
                            Start Free Trial
                        </Link>
                        <Link href="/login" className="px-8 py-4 rounded-full bg-indigo-700 text-white font-bold text-lg transition-colors border border-indigo-500 hover:bg-indigo-800 hover:border-white/20">
                            Super Admin Login
                        </Link>
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 py-12 text-sm text-center">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex items-center justify-center gap-3 mb-6">
                        <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center text-white font-bold text-xs ring-1 ring-white/20">
                            SM
                        </div>
                        <span className="text-white font-bold tracking-widest uppercase">ScholarMind</span>
                    </div>
                    <p>© 2026 ScholarMind Technologies Inc. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
