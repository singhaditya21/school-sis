'use client';

import Link from 'next/link';
import { Database, Server, AppWindow, Cpu, ShieldAlert, ArrowLeft, Terminal, X, Boxes, Network, FileCode2 } from 'lucide-react';
import { useEffect, useState } from 'react';

const TECH_SPECS: Record<string, any> = {
    website: {
        id: 'website',
        title: 'apps/website (Marketing)',
        badge: 'PUBLIC NEXT.JS 15 RUNTIME',
        iconColor: 'cyan',
        terminalText: `> pnpm --filter website dev\n> turbopack caching engine active...\n[OK] Server-Side Suspense streaming\n[WARN] High-Velocity anonymous traffic\n> ready on localhost:3000`,
        features: [
            "Tailwind v4 GPU-Accelerated Micro-Animations",
            "SEO-Optimized Edge Caching for Google Lighthouse",
            "Cross-Origin API requests bridging to Core Product"
        ],
        description: "The highly creative, hyper-visual public runtime. Segregated from the core SaaS to guarantee marketing iterations cannot accidentally push bugs or break the production software databases."
    },
    web: {
        id: 'web',
        title: 'apps/web (SaaS Core)',
        badge: 'SECURE PRODUCT RUNTIME',
        iconColor: 'emerald',
        terminalText: `> pnpm --filter web dev\n> binding middleware auth guards...\n[SEC] JWT Validation on all wildcard routes\n[SYS] Strict Layout boundaries enforced\n> listening on localhost:3001`,
        features: [
            "100% Login-First Access Gating via Edge Middleware",
            "Secure Server Actions for intense database mutations",
            "Optimistic UI rendering masking heavy Drizzle payloads"
        ],
        description: "The beating heart of Scholar Mind. An un-breachable fortress requiring strict RBAC validations before any components ever render. Completely structurally isolated from the marketing website."
    },
    bridge: {
        id: 'bridge',
        title: 'Cross-Origin API Bridge',
        badge: 'NEXT HANDLER: /api/leads',
        iconColor: 'yellow',
        terminalText: `> HTTP POST request intercepted...\n[CORS] Validating payload source origin.\n[OK] Origin matches allowed-list.\n> Executing Drizzle ORM insert transaction.\n[OK] Lead securely stored in vault.`,
        features: [
            "Strict CORS Origin Whitelisting",
            "Zod Payload Validation rejecting malformed leads instantly",
            "Serverless RPC executing within 50ms total latency"
        ],
        description: "The critical vascular tissue uniting the separated apps. When marketing captures a lead, it fetches across the origin into this exact Node endpoint standing at the edge of the Core SaaS boundary to inject the lead into the database safely."
    },
    turbo: {
        id: 'turbo',
        title: 'Turborepo Task Orchestrator',
        badge: 'MONOREPO WORKSPACE',
        iconColor: 'rose',
        terminalText: `> nx turbo run build\n[CACHE] HIT: packages/ui\n[CACHE] HIT: apps/website\n[TASK] Building apps/web (1 missing)\n> Orchestration complete in 3.4 seconds.`,
        features: [
            "Remote Caching preventing redundant builds natively",
            "Atomic Task Graph compiling massive environments instantly",
            "Shared Configs extracting messy ESLint/TS configs off-node"
        ],
        description: "Vercel's high-performance build system encapsulates the entire project. It allows developer iterations at light-speed by only compiling strictly what changed between the two distinct Next.js micro-frameworks."
    },
    render: {
        id: 'render',
        title: 'Render Node Gateways',
        badge: 'CLOUD DEPLOYMENT',
        iconColor: 'indigo',
        terminalText: `> Deploying container to render-web...\n[SYS] Binding reverse-proxy...\n[OK] TLS 1.3 certificates provisioned.\n[ACT] Rate limiting set to 5000 RPM.\n> Node Cluster globally distributed.`,
        features: [
            "Automatic CI/CD Pipeline tracking Git Commits",
            "DDoS mitigation at the reverse-proxy layer",
            "Containerized environments mapping pure isolated resources"
        ],
        description: "The live hardware executing the code. A secure managed container intercepting raw internet requests and parsing them safely down to the Postgres pipeline."
    },
    db: {
        id: 'db',
        title: 'Drizzle/Postgres Enclave',
        badge: 'PERSISTENT VAULT',
        iconColor: 'fuchsia',
        terminalText: `> querying Drizzle schema maps...\n[SEC] Validating Row-Level-Security (RLS)\n[OK] PgBouncer pool accepted connection.\n> Executing raw transactional JSONB injection.\n[OK] Write successful.`,
        features: [
            "End-to-End TypeScript Type Safety directly mapped to SQL",
            "PgBouncer pooling optimizing concurrent massive scale writes",
            "JSONB schema flexibility for hyper-custom analytic processing"
        ],
        description: "The absolute bottom of the computational funnel. A severely locked-down Multi-Tenant database ensuring data from disparate schools never overlaps mathematically."
    }
};

export default function ArchitectureDeepDive() {
    const [mounted, setMounted] = useState(false);
    const [activeNode, setActiveNode] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (activeNode) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = 'unset';
        return () => { document.body.style.overflow = 'unset' };
    }, [activeNode]);

    if (!mounted) return null;

    const selectedSpec = activeNode ? TECH_SPECS[activeNode] : null;

    return (
        <div className="min-h-screen bg-black overflow-x-hidden overflow-y-auto text-slate-200 relative pb-32">
            
            {/* AMBIENT BACKGROUND GLOWS */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[10%] left-[20%] w-[30%] h-[30%] rounded-full bg-indigo-900/30 blur-[150px] animate-pulse" style={{ animationDuration: '6s' }}></div>
                <div className="absolute top-[40%] right-[10%] w-[40%] h-[40%] rounded-full bg-cyan-900/20 blur-[150px] animate-pulse" style={{ animationDuration: '8s', animationDelay: '2s' }}></div>
                <div className="absolute bottom-[-10%] left-[30%] w-[50%] h-[50%] rounded-full bg-fuchsia-900/20 blur-[150px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '4s' }}></div>
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-[0.07] mix-blend-overlay"></div>
            </div>

            {/* HEADER */}
            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-6">
                <Link href="/" className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-bold mb-8 transition-colors group">
                    <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform"/> Back to Platform Overview
                </Link>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-4">
                    <div>
                        <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-4 animate-[slide-in_0.5s_ease-out]">
                            True Systems<br/>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-500 animate-gradient-x">Monorepo Engine.</span>
                        </h1>
                        <p className="text-xl text-slate-400 max-w-3xl font-light">
                            Trace exactly how our complex multi-application workspace is routed. An absolutely seamless dual-node integration ensuring marketing speed without sacrificing the primary codebase's security scope.
                        </p>
                    </div>
                </div>
            </div>

            {/* CANVAS WRAPPER - FIXED 900x800 BOX FOR FLAWLESS ALIGNMENT */}
            <div className={`relative z-10 w-[900px] h-[800px] mx-auto mt-12 transition-all duration-500 ${activeNode ? 'opacity-30 blur-md pointer-events-none' : 'animate-[fade-in_0.7s_ease-out]'}`}>
                
                {/* BACKDROP GRID - Visual Tech Texture */}
                <div className="absolute inset-0 border border-white/5 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.02)_0%,transparent_100%)] rounded-[3rem]"></div>

                {/* TURBOREPO BORDER BOX */}
                <div onClick={() => setActiveNode('turbo')} className="absolute top-[30px] left-[70px] w-[760px] h-[220px] border-2 border-dashed border-rose-500/30 rounded-3xl group hover:border-rose-500 hover:bg-rose-900/10 cursor-pointer transition-all flex items-end justify-center pb-2 z-0">
                    <span className="text-rose-500 tracking-widest uppercase font-bold text-sm bg-black px-4 group-hover:text-rose-400">Turborepo Workspace Isolation Container</span>
                </div>

                {/* SVG PERFECT VECTOR CONNECTORS */}
                {/* 
                   Math Map:
                   apps/website: centered at (270, 150), bottom boundary Y=200
                   apps/web: centered at (630, 150), bottom boundary Y=200
                   API Bridge: centered at (450, 320), top boundary Y=270, bottom Y=370
                   Render Nodes: centered at (270, 500)
                   AI Sentinels: centered at (630, 500)
                   DB Enclave: centered at (450, 680)
                */}
                <svg className="absolute inset-0 w-[900px] h-[800px] pointer-events-none z-10" viewBox="0 0 900 800">
                    <defs>
                        <filter id="glow-connector" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                    </defs>

                    {/* Marketing -> Bridge */}
                    <path d="M 270 200 C 270 235, 450 235, 450 270" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                    <path d="M 270 200 C 270 235, 450 235, 450 270" fill="none" stroke="#eab308" strokeWidth="4" className="animate-[flow-diagonal_2s_linear_infinite]" strokeDasharray="20 180" strokeLinecap="round" filter="url(#glow-connector)"/>

                    {/* SaaS Web -> Bridge */}
                    <path d="M 630 200 C 630 235, 450 235, 450 270" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                    <path d="M 630 200 C 630 235, 450 235, 450 270" fill="none" stroke="#eab308" strokeWidth="4" className="animate-[flow-diagonal_2.5s_linear_infinite] delay-[1s]" strokeDasharray="30 250" strokeLinecap="round" filter="url(#glow-connector)"/>

                    {/* Bridge -> Render Cloud */}
                    <path d="M 450 370 C 450 410, 270 410, 270 450" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                    <path d="M 450 370 C 450 410, 270 410, 270 450" fill="none" stroke="#6366f1" strokeWidth="4" className="animate-[flow-diagonal_2s_linear_infinite]" strokeDasharray="20 150" strokeLinecap="round" filter="url(#glow-connector)"/>

                    {/* Bridge -> AI Sentinels */}
                    <path d="M 450 370 C 450 410, 630 410, 630 450" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                    <path d="M 450 370 C 450 410, 630 410, 630 450" fill="none" stroke="#d946ef" strokeWidth="4" className="animate-[flow-diagonal_2.5s_linear_infinite]" strokeDasharray="25 180" strokeLinecap="round" filter="url(#glow-connector)"/>

                    {/* Render Cloud -> Database */}
                    <path d="M 270 550 C 270 590, 450 590, 450 630" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                    <path d="M 270 550 C 270 590, 450 590, 450 630" fill="none" stroke="#10b981" strokeWidth="4" className="animate-[flow-diagonal_2s_linear_infinite]" strokeDasharray="30 200" strokeLinecap="round" filter="url(#glow-connector)"/>

                    {/* AI Sentinels -> Database */}
                    <path d="M 630 550 C 630 590, 450 590, 450 630" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                    <path d="M 630 550 C 630 590, 450 590, 450 630" fill="none" stroke="#10b981" strokeWidth="4" className="animate-[flow-diagonal_2.5s_linear_infinite]" strokeDasharray="25 190" strokeLinecap="round" filter="url(#glow-connector)"/>
                </svg>

                {/* THE PIXEL-PERFECT NODES */}
                {/* Node Box size: w-[240px] h-[100px].  Center offset requires left-[Center.X - 120] and top-[Center.Y - 50] */}
                
                {/* 1. Marketing Node (X:270, Y:150) -> Top:100, Left:150 */}
                <div onClick={() => setActiveNode('website')} className="absolute top-[100px] left-[150px] w-[240px] h-[100px] bg-black/60 backdrop-blur-xl border border-cyan-500/30 rounded-2xl flex items-center p-4 hover:bg-cyan-900/30 hover:scale-105 hover:shadow-[0_0_30px_rgba(34,211,238,0.3)] transition-all cursor-pointer z-20 group">
                    <div className="w-12 h-12 flex-shrink-0 bg-cyan-500/20 text-cyan-400 flex items-center justify-center rounded-xl mr-4 border border-cyan-500/40 group-hover:bg-cyan-400 group-hover:text-black transition-colors"><AppWindow size={24}/></div>
                    <div>
                        <h3 className="font-bold text-white leading-tight">apps/website</h3>
                        <p className="text-[10px] text-cyan-400 uppercase tracking-wider font-mono mt-1">Marketing Runtime</p>
                    </div>
                </div>

                {/* 2. SaaS Core Node (X:630, Y:150) -> Top:100, Left:510 */}
                <div onClick={() => setActiveNode('web')} className="absolute top-[100px] left-[510px] w-[240px] h-[100px] bg-black/60 backdrop-blur-xl border border-emerald-500/30 rounded-2xl flex items-center p-4 hover:bg-emerald-900/30 hover:scale-105 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all cursor-pointer z-20 group">
                    <div className="w-12 h-12 flex-shrink-0 bg-emerald-500/20 text-emerald-400 flex items-center justify-center rounded-xl mr-4 border border-emerald-500/40 group-hover:bg-emerald-400 group-hover:text-black transition-colors"><ShieldAlert size={24}/></div>
                    <div>
                        <h3 className="font-bold text-white leading-tight">apps/web</h3>
                        <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-mono mt-1">Primary SaaS Pipeline</p>
                    </div>
                </div>

                {/* 3. API Bridge Node (X:450, Y:320) -> Top:270, Left:330 */}
                <div onClick={() => setActiveNode('bridge')} className="absolute top-[270px] left-[330px] w-[240px] h-[100px] bg-[#222] backdrop-blur-xl border-2 border-yellow-500/50 rounded-2xl flex items-center p-4 hover:bg-yellow-900/30 hover:scale-105 hover:shadow-[0_0_40px_rgba(234,179,8,0.4)] transition-all cursor-pointer z-30 group shadow-[0_0_20px_rgba(234,179,8,0.1)] outline outline-offset-4 outline-yellow-500/10">
                    <div className="w-12 h-12 flex-shrink-0 bg-yellow-500/20 text-yellow-400 flex items-center justify-center rounded-xl mr-4 border border-yellow-500/40 group-hover:bg-yellow-400 group-hover:text-black transition-colors"><Network size={24}/></div>
                    <div>
                        <h3 className="font-bold text-white leading-tight font-mono text-sm">/api/leads</h3>
                        <p className="text-[10px] text-yellow-400 uppercase tracking-wider font-mono mt-1">Cross-Origin Fetch</p>
                    </div>
                </div>

                {/* 4. Render Cloud Node (X:270, Y:500) -> Top:450, Left:150 */}
                <div onClick={() => setActiveNode('render')} className="absolute top-[450px] left-[150px] w-[240px] h-[100px] bg-black/60 backdrop-blur-xl border border-indigo-500/30 rounded-2xl flex items-center p-4 hover:bg-indigo-900/30 hover:scale-105 hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] transition-all cursor-pointer z-20 group">
                    <div className="w-12 h-12 flex-shrink-0 bg-indigo-500/20 text-indigo-400 flex items-center justify-center rounded-xl mr-4 border border-indigo-500/40 group-hover:bg-indigo-400 group-hover:text-black transition-colors"><Server size={24}/></div>
                    <div>
                        <h3 className="font-bold text-white leading-tight">Render Nodes</h3>
                        <p className="text-[10px] text-indigo-400 uppercase tracking-wider font-mono mt-1">Live Cloud Gateway</p>
                    </div>
                </div>

                {/* 5. AI Sentinels Node (X:630, Y:500) -> Top:450, Left:510 */}
                <div onClick={() => setActiveNode('ai')} className="absolute top-[450px] left-[510px] w-[240px] h-[100px] bg-black/60 backdrop-blur-xl border border-fuchsia-500/30 rounded-2xl flex items-center p-4 hover:bg-fuchsia-900/30 hover:scale-105 hover:shadow-[0_0_30px_rgba(217,70,239,0.3)] transition-all cursor-pointer z-20 group">
                    <div className="w-12 h-12 flex-shrink-0 bg-fuchsia-500/20 text-fuchsia-400 flex items-center justify-center rounded-xl mr-4 border border-fuchsia-500/40 group-hover:bg-fuchsia-400 group-hover:text-black transition-colors"><Cpu size={24}/></div>
                    <div>
                        <h3 className="font-bold text-white leading-tight">AI Analytics Core</h3>
                        <p className="text-[10px] text-fuchsia-400 uppercase tracking-wider font-mono mt-1">Vector Math Layer</p>
                    </div>
                </div>

                {/* 6. Postgres Vault (X:450, Y:680) -> Top:630, Left:330 */}
                <div onClick={() => setActiveNode('db')} className="absolute top-[630px] left-[330px] w-[240px] h-[100px] bg-black border-2 border-emerald-500/50 rounded-[2rem] flex items-center p-4 hover:bg-emerald-900/20 hover:scale-105 hover:shadow-[0_0_60px_rgba(16,185,129,0.4)] transition-all cursor-pointer z-20 group shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                    <div className="w-12 h-12 flex-shrink-0 bg-emerald-500/20 text-emerald-400 flex items-center justify-center rounded-full mr-4 border border-emerald-500/40 animate-[pulse_2s_infinite]"><Database size={24}/></div>
                    <div>
                        <h3 className="font-black text-white leading-tight text-lg">Postgres Enclave</h3>
                        <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-mono mt-1">Multi-Tenant Vault</p>
                    </div>
                </div>

            </div>

             {/* EXPANSION DEEP-DIVE MODAL (HACKER UI) */}
             {activeNode && selectedSpec && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-[slide-in_0.3s_ease-out]">
                    
                    {/* Dark Backdrop Hack closing the modal */}
                    <div 
                        className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-pointer" 
                        onClick={() => setActiveNode(null)}
                    ></div>

                    {/* Highly Technical Terminal Overlay Box */}
                    <div className="relative w-full max-w-5xl h-[80vh] bg-[#0a0a0a] border border-[#222] rounded-3xl overflow-hidden shadow-2xl flex flex-col shadow-[0_0_100px_rgba(0,0,0,1)]">
                        
                        {/* Fake Browser/Terminal Header */}
                        <div className="h-14 bg-[#111] border-b border-[#222] flex items-center px-6 justify-between select-none">
                            <div className="flex gap-2.5">
                                <span className="w-3.5 h-3.5 rounded-full bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></span>
                                <span className="w-3.5 h-3.5 rounded-full bg-amber-500/80 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></span>
                                <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                            </div>
                            <span className="text-sm font-mono text-slate-500 ml-4 hidden sm:block tracking-widest">GUEST@SCHOLARMIND: /usr/core/node_{selectedSpec.id}</span>
                            <button onClick={() => setActiveNode(null)} className="text-slate-400 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-rose-500 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex flex-col md:flex-row h-[calc(100%-3.5rem)]">
                            
                            {/* Left Panel: The Pseudo-Terminal */}
                            <div className="w-full md:w-1/2 bg-[#050505] p-8 border-r border-[#222] flex flex-col font-mono text-sm text-green-400 shadow-inner overflow-hidden relative">
                                {/* Decorative Terminal Background Grid */}
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-scales.png')] opacity-[0.03]"></div>
                                
                                <div className="flex items-center gap-3 text-slate-500 mb-6 border-b border-[#222] pb-3 uppercase tracking-widest font-bold"><Terminal size={18}/> SYSTEM_LOGS.OUT</div>
                                
                                <pre className="whitespace-pre-wrap leading-loose animate-[fade-in_0.5s_ease-out]">
                                    {selectedSpec.terminalText}
                                </pre>

                                {/* Blinking Cursor */}
                                <div className="mt-2 w-3 h-5 bg-green-400 animate-pulse opacity-80 rounded-sm"></div>
                            </div>

                            {/* Right Panel: The Marketing Pitch Matrix */}
                            <div className="w-full md:w-1/2 p-10 md:p-14 flex flex-col justify-center bg-black/40 relative overflow-y-auto">
                                {/* Glow Accent relative to iconColor */}
                                <div className={`absolute top-10 right-10 w-80 h-80 blur-[120px] rounded-full pointer-events-none opacity-20 bg-${selectedSpec.iconColor}-500`}></div>

                                <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold font-mono tracking-widest mb-6 w-fit bg-${selectedSpec.iconColor}-500/10 text-${selectedSpec.iconColor}-400 border border-${selectedSpec.iconColor}-500/30 uppercase`}>
                                    {selectedSpec.badge}
                                </span>

                                <h2 className="text-4xl font-black text-white mb-6 tracking-tight leading-tight">
                                    {selectedSpec.title}
                                </h2>

                                <p className="text-slate-400 text-lg leading-relaxed mb-10 font-light border-l-2 border-white/10 pl-6">
                                    {selectedSpec.description}
                                </p>

                                <div className="space-y-4">
                                    {selectedSpec.features.map((feature: string, idx: number) => (
                                        <div key={idx} className="flex items-center gap-5 p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors shadow-sm">
                                            <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                                <div className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]"></div>
                                            </div>
                                            <span className="text-base font-medium text-slate-300">{feature}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}
            
        </div>
    );
}
