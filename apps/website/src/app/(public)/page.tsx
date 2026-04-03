import Link from 'next/link';
import { Bot, LineChart, ShieldCheck, Zap, Globe, Users, ArrowRight } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="flex flex-col min-h-screen bg-black overflow-x-hidden text-slate-200">
            {/* AMBIENT BACKGROUND GLOWS (CSS AURORA) */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/40 blur-[150px] animate-pulse" style={{ animationDuration: '8s' }}></div>
                <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-fuchsia-900/30 blur-[150px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }}></div>
                <div className="absolute bottom-[-20%] left-[20%] w-[60%] h-[60%] rounded-full bg-cyan-900/20 blur-[150px] animate-pulse" style={{ animationDuration: '12s', animationDelay: '4s' }}></div>
                {/* CSS Grid Pattern Overlay */}
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-20 mix-blend-overlay"></div>
            </div>

            {/* HERO SECTION */}
            <section className="relative z-10 min-h-screen flex items-center justify-center pt-32 pb-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-10 group">
                    <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-2xl hover:bg-white/10 transition-colors mx-auto relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[200%] animate-[slide-in_3s_infinite]"></div>
                        <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span className="text-sm font-bold tracking-widest uppercase text-slate-300">Scholar Mind OS v2.0</span>
                    </div>
                    
                    <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[1.1] max-w-5xl mx-auto">
                        The Edge Compute <br className="hidden md:block"/>
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400 animate-gradient-x">Education Network.</span>
                    </h1>
                    
                    <p className="max-w-2xl mx-auto text-xl md:text-2xl text-slate-400 font-light leading-relaxed">
                        Replace legacy Excel sheets and fragmented portals with a monolithic database powered entirely by autonomous AI sentinels.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
                        <Link href="/book-demo" className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-white text-black font-extrabold text-lg transition-transform hover:scale-105 shadow-[0_0_40px_rgba(255,255,255,0.2)]">
                            Deploy Global Cluster
                            <ArrowRight className="group-hover:translate-x-1 transition-transform" size={20}/>
                        </Link>
                        <Link href="/architecture" className="px-8 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-lg transition-all backdrop-blur-md">
                            Inspect Architecture
                        </Link>
                    </div>

                    {/* Creative Statistics Row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 pt-16 border-t border-white/10 max-w-4xl mx-auto">
                        <div className="flex flex-col items-center">
                            <span className="text-4xl font-black text-indigo-400">26</span>
                            <span className="text-sm font-medium tracking-wide text-slate-500 uppercase mt-2">Active AI Logic Layers</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-4xl font-black text-fuchsia-400">&lt;50ms</span>
                            <span className="text-sm font-medium tracking-wide text-slate-500 uppercase mt-2">Global Query Latency</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-4xl font-black text-emerald-400">99.99%</span>
                            <span className="text-sm font-medium tracking-wide text-slate-500 uppercase mt-2">Guaranteed Uptime</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-4xl font-black text-sky-400">SOC-2</span>
                            <span className="text-sm font-medium tracking-wide text-slate-500 uppercase mt-2">Total Compliance Cap</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* NEON BENTO GRID */}
            <section id="features" className="relative z-10 py-32 border-t border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="mb-20">
                        <h2 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight mb-6 animate-fade-in">Absolute Telemetry.</h2>
                        <p className="text-xl text-slate-400 max-w-2xl animate-fade-in" style={{animationDelay: '100ms'}}>Drop 5 separate SaaS subscriptions in favor of a single unified pipeline injecting artificial intelligence directly into the student lifecycle.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-[360px]">
                        
                        {/* Box 1: Large Span AI - Glassmorphism */}
                        <div className="md:col-span-8 relative bg-black/40 backdrop-blur-xl rounded-3xl p-10 overflow-hidden border border-white/10 hover:border-indigo-500/50 hover:shadow-[0_0_50px_rgba(79,70,229,0.15)] hover:-translate-y-1 transition-all duration-500 group">
                            {/* Abstract Glow inside card */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 blur-3xl rounded-full group-hover:bg-indigo-400/30 transition-colors"></div>
                            
                            <div className="absolute -bottom-10 -right-10 opacity-20 group-hover:scale-110 group-hover:-rotate-12 transition-all duration-700">
                                <Bot size={240} className="text-indigo-400" />
                            </div>
                            
                            <div className="relative z-10 h-full flex flex-col justify-between max-w-lg">
                                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 border border-indigo-500/30 rounded-2xl flex items-center justify-center backdrop-blur-sm shadow-[0_0_15px_rgba(79,70,229,0.2)]">
                                    <Zap className="text-indigo-300" size={32} />
                                </div>
                                <div>
                                    <h3 className="text-4xl font-black text-white mb-4 tracking-tight">26 Native AI Agents</h3>
                                    <p className="text-slate-300 text-lg leading-relaxed">Continuous background inference dynamically flags attendance dropouts and tuition defaults before human admins notice.</p>
                                </div>
                            </div>
                        </div>

                        {/* Box 2: Square - Compliance */}
                        <div className="md:col-span-4 bg-black/40 backdrop-blur-xl rounded-3xl p-10 border border-white/10 hover:border-emerald-500/50 hover:shadow-[0_0_40px_rgba(16,185,129,0.15)] hover:-translate-y-1 transition-all duration-500 group flex flex-col justify-between relative overflow-hidden">
                            <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-emerald-500/10 to-transparent"></div>
                            <div className="relative z-10 w-14 h-14 bg-emerald-500/20 border border-emerald-500/30 rounded-2xl flex items-center justify-center">
                                <ShieldCheck className="text-emerald-400" size={28} />
                            </div>
                            <div className="relative z-10">
                                <h3 className="text-2xl font-bold text-white mb-2">Immutable Logs</h3>
                                <p className="text-slate-400 leading-relaxed">Centralized telemetry intercepts and logs every God-Mode administrative action network-wide.</p>
                            </div>
                        </div>

                        {/* Box 3: Square - Cloud */}
                        <div className="md:col-span-4 bg-black/40 backdrop-blur-xl rounded-3xl p-10 border border-white/10 hover:border-fuchsia-500/50 hover:shadow-[0_0_40px_rgba(217,70,239,0.15)] hover:-translate-y-1 transition-all duration-500 group flex flex-col justify-between">
                            <div className="w-14 h-14 bg-fuchsia-500/20 border border-fuchsia-500/30 rounded-2xl flex items-center justify-center">
                                <Globe className="text-fuchsia-400" size={28} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold text-white mb-2">Autonomous Network</h3>
                                <p className="text-slate-400 leading-relaxed">Spin up isolated Postgres enclaves deployed natively across AWS tracking precise state sovereignty.</p>
                            </div>
                        </div>

                        {/* Box 4: Span - White Label */}
                        <div className="md:col-span-8 bg-black/40 backdrop-blur-xl rounded-3xl p-10 border border-white/10 hover:border-sky-500/50 hover:shadow-[0_0_50px_rgba(14,165,233,0.15)] hover:-translate-y-1 transition-all duration-500 relative overflow-hidden group">
                           <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1/2 h-[150%] bg-gradient-to-l from-sky-500/10 via-sky-500/5 to-transparent rotate-12"></div>
                           <div className="relative z-10 h-full flex flex-col justify-between max-w-md">
                                <div className="flex gap-3">
                                    <div className="w-12 h-12 bg-sky-500/20 border border-sky-500/30 flex items-center justify-center rounded-xl backdrop-blur-sm"><LineChart className="text-sky-300" /></div>
                                    <div className="w-12 h-12 bg-white/10 border border-white/20 flex items-center justify-center rounded-xl backdrop-blur-sm"><Users className="text-sky-300" /></div>
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black text-white mb-3 tracking-tight">Total White Labeling</h3>
                                    <p className="text-slate-300 text-lg">Inject domain masks masking Scholar Mind completely behind your academy's elite customized UI and branding.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* FINAL NEON CTA */}
            <section id="demo" className="relative z-10 py-32 border-t border-white/10 overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-[300px] bg-indigo-600/30 rounded-[100%] blur-[120px] pointer-events-none"></div>
                <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
                    <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-8">Ignite your campus.</h2>
                    <p className="text-2xl text-slate-400 mb-12 font-light">Join the waitlist or deploy an inaugural tenant database right now. Scholar Mind handles the infrastructure instantly.</p>
                    <div className="flex flex-col sm:flex-row justify-center gap-6">
                        <Link href="/book-demo" className="px-10 py-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xl transition-all shadow-[0_0_30px_rgba(79,70,229,0.4)] hover:shadow-[0_0_50px_rgba(79,70,229,0.7)] hover:-translate-y-1">
                            Deploy Database
                        </Link>
                        <a href="https://school-sis.onrender.com/login" className="px-10 py-5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xl transition-all backdrop-blur-md">
                            HQ Admin Login
                        </a>
                    </div>
                </div>
            </section>
        </div>
    );
}
