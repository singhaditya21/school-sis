'use client';

import Link from 'next/link';
import { Database, Server, AppWindow, Cpu, ShieldAlert, ArrowLeft, Terminal, X, Network } from 'lucide-react';
import { useEffect, useState } from 'react';

type AccentColor = 'brass' | 'emerald' | 'parchment' | 'sky';

const ACCENT_STYLES: Record<AccentColor, { glow: string; badge: string }> = {
    brass: {
        glow: 'bg-brass',
        badge: 'bg-brass/15 text-brass-light border-brass/40',
    },
    emerald: {
        glow: 'bg-emerald-500',
        badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    },
    parchment: {
        glow: 'bg-parchment',
        badge: 'bg-white/10 text-parchment border-parchment/30',
    },
    sky: {
        glow: 'bg-sky-400',
        badge: 'bg-sky-400/15 text-sky-200 border-sky-400/35',
    },
};

type TechSpec = {
    id: string;
    title: string;
    badge: string;
    iconColor: AccentColor;
    terminalText: string;
    features: string[];
    description: string;
};

const TECH_SPECS: Record<string, TechSpec> = {
    website: {
        id: 'website',
        title: 'apps/website (Public Surface)',
        badge: 'ISOLATED MARKETING RUNTIME',
        iconColor: 'parchment',
        terminalText: `> pnpm --filter website build\n> static route generation active...\n[OK] Zero database credentials in environment\n[OK] Strict CSP & security headers bound\n> ready on isolated edge origin`,
        features: [
            "Zero-DB static & edge surface isolated from tenant data",
            "SEO-optimized pages for institutional evaluation",
            "Authenticated proxy bridge to core lead intake"
        ],
        description: "Segregated public runtime ensuring marketing updates and anonymous web traffic remain structurally isolated from tenant operational databases."
    },
    web: {
        id: 'web',
        title: 'apps/web (Institutional Core)',
        badge: 'TENANT-ISOLATED SAAS RUNTIME',
        iconColor: 'emerald',
        terminalText: `> pnpm --filter @school-sis/web start\n> binding middleware auth & CSP nonce guards...\n[SEC] Session + TOTP MFA verification active\n[SYS] Role-based portal boundaries enforced\n> serving tenant workspaces`,
        features: [
            "Per-request CSP nonces & strict RBAC route gating",
            "Mandatory TOTP MFA for administrative roles",
            "Typed Server Actions with audit-log provenance"
        ],
        description: "The operational core of ScholarMind powering Principal, Finance, Registrar, Teacher, Parent, and Student portals behind strict authentication and role boundaries."
    },
    bridge: {
        id: 'bridge',
        title: 'Authenticated Intake Bridge',
        badge: 'ROUTE HANDLER: /api/leads',
        iconColor: 'brass',
        terminalText: `> HTTPS POST /api/leads intercepted...\n[AUTH] Validating proxy secret & origin.\n[OK] Zod schema & rate-limit checks passed.\n> Persisting institutional inquiry.\n[OK] Lead recorded with audit timestamp.`,
        features: [
            "Strict origin allowlisting & shared-secret verification",
            "Zod schema validation & abuse rate limiting",
            "Zero direct database exposure to public marketing routes"
        ],
        description: "Controlled boundary endpoint connecting public pilot inquiries to the platform intake queue without exposing internal credentials."
    },
    turbo: {
        id: 'turbo',
        title: 'Turborepo Governance Pipeline',
        badge: 'MONOREPO WORKSPACE',
        iconColor: 'parchment',
        terminalText: `> pnpm audit:ci && pnpm test:unit && pnpm build\n[AUDIT] RLS matrix: 146/146 tables verified\n[AUDIT] SQL column & migration checks passed\n[TEST] 95 unit suites green\n> Release artifact verified.`,
        features: [
            "10 automated CI security, SQL, and RLS policy gates",
            "Deterministic prebuilt artifacts promoted after health probes",
            "Shared TypeScript & ESLint contracts across packages"
        ],
        description: "Unified monorepo build and release governance ensuring every commit passes SQL schema verification, RLS coverage checks, and unit tests before deployment."
    },
    runtime: {
        id: 'runtime',
        title: 'Pinned Regional Compute',
        badge: 'CLOUD DEPLOYMENT (SIN1)',
        iconColor: 'sky',
        terminalText: `> Staging prebuilt candidate (--skip-domain)...\n[PROBE] /api/health -> status: ok, region: sin1\n[MIGRATE] Advisory-locked SQL migrations verified\n[ALIAS] Promoting verified deployment to production`,
        features: [
            "Staged candidate verification before domain promotion",
            "Pinned sin1 compute co-located with primary database",
            "Automated REST rollback on failed health or smoke checks"
        ],
        description: "Managed serverless execution co-located in Singapore (sin1) for low-latency Indian & international campus operations with zero-downtime promotion."
    },
    jobs: {
        id: 'jobs',
        title: 'Transactional Outbox & Jobs',
        badge: 'ASYNC QUEUE & DISPATCH',
        iconColor: 'brass',
        terminalText: `> POST /api/jobs/dispatch\n[QUEUE] Claiming due background_jobs rows...\n[RLS] Tenant context bound per job execution\n[SEND] Draining notification_outbox (WhatsApp/Email)\n> Dispatch cycle complete.`,
        features: [
            "Postgres-backed job queue with retry & dead-letter controls",
            "Transactional notification outbox preventing duplicate sends",
            "Per-job tenant RLS context enforcement"
        ],
        description: "Asynchronous worker layer ensuring fee receipts, reminders, and admissions notices are queued durably inside Postgres and dispatched reliably."
    },
    db: {
        id: 'db',
        title: 'PostgreSQL RLS Enclave',
        badge: 'MULTI-TENANT VAULT',
        iconColor: 'emerald',
        terminalText: `> BEGIN; SELECT set_config('app.tenant_id', $1, true);\n[RLS] FORCE ROW LEVEL SECURITY active on tenant tables\n[CRYPTO] AES-256-GCM field encryption verified\n> COMMIT;`,
        features: [
            "PostgreSQL Row-Level Security across all tenant tables",
            "Transaction-scoped withTenant() connection discipline",
            "Immutable financial ledger & sensitive-data audit trail"
        ],
        description: "Multi-tenant Neon PostgreSQL enclave enforcing mathematical tenant isolation via Row-Level Security policies on every transaction."
    }
};

export default function ArchitectureDeepDive() {
    const [activeNode, setActiveNode] = useState<string | null>(null);

    useEffect(() => {
        if (activeNode) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = 'unset';
        return () => { document.body.style.overflow = 'unset' };
    }, [activeNode]);

    const selectedSpec = activeNode ? TECH_SPECS[activeNode] : null;

    return (
        <div className="min-h-screen bg-oxford-dark overflow-x-hidden overflow-y-auto text-slate-200 relative pb-32">
            
            {/* AMBIENT OXFORD & BRASS BLUEPRINT GLOWS */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[8%] left-[18%] w-[34%] h-[34%] rounded-full bg-oxford/60 blur-[150px]"></div>
                <div className="absolute top-[38%] right-[12%] w-[36%] h-[36%] rounded-full bg-brass/15 blur-[150px]"></div>
                <div
                    className="absolute inset-0 opacity-20"
                    style={{
                        backgroundImage:
                            'radial-gradient(rgba(212, 155, 67, 0.22) 1px, transparent 1px)',
                        backgroundSize: '24px 24px',
                    }}
                ></div>
            </div>

            {/* HEADER */}
            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-6">
                <Link href="/" className="inline-flex items-center gap-2 text-brass-light hover:text-parchment font-bold mb-8 transition-colors group">
                    <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform"/> Back to Platform Overview
                </Link>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-brass-light mb-3">
                            Institutional Security &amp; Tenancy Blueprint
                        </p>
                        <h1 className="text-5xl md:text-6xl font-black text-white tracking-tight mb-4">
                            Tenant-Isolated<br/>
                            <span className="text-brass-light">Platform Architecture.</span>
                        </h1>
                        <p className="text-xl text-slate-300 max-w-3xl leading-relaxed">
                            Inspect how ScholarMind separates public discovery surfaces from authenticated campus workloads, background job dispatch, and row-level-security PostgreSQL enclaves.
                        </p>
                    </div>
                </div>
            </div>

            {/* CANVAS WRAPPER - FIXED 900x800 BOX FOR FLAWLESS ALIGNMENT */}
            <div className={`relative z-10 w-[900px] h-[800px] mx-auto mt-10 transition-all duration-500 ${activeNode ? 'opacity-30 blur-md pointer-events-none' : ''}`}>
                
                {/* BACKDROP GRID - Architectural Blueprint Card */}
                <div className="absolute inset-0 border border-brass/25 bg-oxford/40 rounded-[3rem] shadow-2xl"></div>

                {/* TURBOREPO BORDER BOX */}
                <div onClick={() => setActiveNode('turbo')} className="absolute top-[30px] left-[70px] w-[760px] h-[220px] border-2 border-dashed border-brass/40 rounded-3xl group hover:border-brass-light hover:bg-brass/5 cursor-pointer transition-all flex items-end justify-center pb-2 z-0">
                    <span className="text-brass-light tracking-widest uppercase font-bold text-xs bg-oxford-dark px-4 py-0.5 rounded-full border border-brass/30">Turborepo Governance &amp; CI Audit Boundary</span>
                </div>

                {/* SVG PERFECT VECTOR CONNECTORS */}
                <svg className="absolute inset-0 w-[900px] h-[800px] pointer-events-none z-10" viewBox="0 0 900 800">
                    <defs>
                        <filter id="glow-connector" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="2.5" result="blur" />
                            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                    </defs>

                    {/* Marketing -> Bridge */}
                    <path d="M 270 200 C 270 235, 450 235, 450 270" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                    <path d="M 270 200 C 270 235, 450 235, 450 270" fill="none" stroke="#D49B43" strokeWidth="3.5" strokeDasharray="18 180" strokeLinecap="round" filter="url(#glow-connector)"/>

                    {/* SaaS Web -> Bridge */}
                    <path d="M 630 200 C 630 235, 450 235, 450 270" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                    <path d="M 630 200 C 630 235, 450 235, 450 270" fill="none" stroke="#D49B43" strokeWidth="3.5" strokeDasharray="28 240" strokeLinecap="round" filter="url(#glow-connector)"/>

                    {/* Bridge -> Vercel Runtime */}
                    <path d="M 450 370 C 450 410, 270 410, 270 450" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                    <path d="M 450 370 C 450 410, 270 410, 270 450" fill="none" stroke="#93C5FD" strokeWidth="3.5" strokeDasharray="20 150" strokeLinecap="round" filter="url(#glow-connector)"/>

                    {/* Bridge -> Job Runner */}
                    <path d="M 450 370 C 450 410, 630 410, 630 450" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                    <path d="M 450 370 C 450 410, 630 410, 630 450" fill="none" stroke="#D49B43" strokeWidth="3.5" strokeDasharray="25 180" strokeLinecap="round" filter="url(#glow-connector)"/>

                    {/* Vercel Runtime -> Database */}
                    <path d="M 270 550 C 270 590, 450 590, 450 630" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                    <path d="M 270 550 C 270 590, 450 590, 450 630" fill="none" stroke="#34D399" strokeWidth="3.5" strokeDasharray="30 200" strokeLinecap="round" filter="url(#glow-connector)"/>

                    {/* Job Runner -> Database */}
                    <path d="M 630 550 C 630 590, 450 590, 450 630" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
                    <path d="M 630 550 C 630 590, 450 590, 450 630" fill="none" stroke="#34D399" strokeWidth="3.5" strokeDasharray="25 190" strokeLinecap="round" filter="url(#glow-connector)"/>
                </svg>

                {/* 1. Marketing Node */}
                <div onClick={() => setActiveNode('website')} className="absolute top-[100px] left-[150px] w-[240px] h-[100px] bg-oxford-dark/90 backdrop-blur-xl border border-parchment/30 rounded-2xl flex items-center p-4 hover:border-brass-light hover:scale-[1.03] transition-all cursor-pointer z-20 group">
                    <div className="w-12 h-12 flex-shrink-0 bg-white/10 text-parchment flex items-center justify-center rounded-xl mr-4 border border-parchment/30 group-hover:bg-brass group-hover:text-white transition-colors"><AppWindow size={24}/></div>
                    <div>
                        <h3 className="font-bold text-white leading-tight">apps/website</h3>
                        <p className="text-[10px] text-parchment/80 uppercase tracking-wider font-mono mt-1">Public Surface</p>
                    </div>
                </div>

                {/* 2. SaaS Core Node */}
                <div onClick={() => setActiveNode('web')} className="absolute top-[100px] left-[510px] w-[240px] h-[100px] bg-oxford-dark/90 backdrop-blur-xl border border-emerald-400/35 rounded-2xl flex items-center p-4 hover:border-emerald-400 hover:scale-[1.03] transition-all cursor-pointer z-20 group">
                    <div className="w-12 h-12 flex-shrink-0 bg-emerald-500/15 text-emerald-300 flex items-center justify-center rounded-xl mr-4 border border-emerald-400/35 group-hover:bg-emerald-500 group-hover:text-white transition-colors"><ShieldAlert size={24}/></div>
                    <div>
                        <h3 className="font-bold text-white leading-tight">apps/web</h3>
                        <p className="text-[10px] text-emerald-300 uppercase tracking-wider font-mono mt-1">Institutional Core</p>
                    </div>
                </div>

                {/* 3. API Bridge Node */}
                <div onClick={() => setActiveNode('bridge')} className="absolute top-[270px] left-[330px] w-[240px] h-[100px] bg-oxford border-2 border-brass/60 rounded-2xl flex items-center p-4 hover:border-brass-light hover:scale-[1.03] transition-all cursor-pointer z-30 group shadow-xl">
                    <div className="w-12 h-12 flex-shrink-0 bg-brass/20 text-brass-light flex items-center justify-center rounded-xl mr-4 border border-brass/45 group-hover:bg-brass group-hover:text-white transition-colors"><Network size={24}/></div>
                    <div>
                        <h3 className="font-bold text-white leading-tight font-mono text-sm">/api/leads</h3>
                        <p className="text-[10px] text-brass-light uppercase tracking-wider font-mono mt-1">Authenticated Bridge</p>
                    </div>
                </div>

                {/* 4. Vercel Runtime Node */}
                <div onClick={() => setActiveNode('runtime')} className="absolute top-[450px] left-[150px] w-[240px] h-[100px] bg-oxford-dark/90 backdrop-blur-xl border border-sky-400/35 rounded-2xl flex items-center p-4 hover:border-sky-300 hover:scale-[1.03] transition-all cursor-pointer z-20 group">
                    <div className="w-12 h-12 flex-shrink-0 bg-sky-400/15 text-sky-200 flex items-center justify-center rounded-xl mr-4 border border-sky-400/35 group-hover:bg-sky-500 group-hover:text-white transition-colors"><Server size={24}/></div>
                    <div>
                        <h3 className="font-bold text-white leading-tight">Regional Compute</h3>
                        <p className="text-[10px] text-sky-200 uppercase tracking-wider font-mono mt-1">Pinned sin1 Region</p>
                    </div>
                </div>

                {/* 5. Job Runner Node */}
                <div onClick={() => setActiveNode('jobs')} className="absolute top-[450px] left-[510px] w-[240px] h-[100px] bg-oxford-dark/90 backdrop-blur-xl border border-brass/40 rounded-2xl flex items-center p-4 hover:border-brass-light hover:scale-[1.03] transition-all cursor-pointer z-20 group">
                    <div className="w-12 h-12 flex-shrink-0 bg-brass/20 text-brass-light flex items-center justify-center rounded-xl mr-4 border border-brass/40 group-hover:bg-brass group-hover:text-white transition-colors"><Cpu size={24}/></div>
                    <div>
                        <h3 className="font-bold text-white leading-tight">Background Jobs</h3>
                        <p className="text-[10px] text-brass-light uppercase tracking-wider font-mono mt-1">Outbox &amp; Dispatch</p>
                    </div>
                </div>

                {/* 6. Postgres Vault */}
                <div onClick={() => setActiveNode('db')} className="absolute top-[630px] left-[330px] w-[240px] h-[100px] bg-oxford border-2 border-emerald-400/50 rounded-[2rem] flex items-center p-4 hover:border-emerald-300 hover:scale-[1.03] transition-all cursor-pointer z-20 group shadow-2xl">
                    <div className="w-12 h-12 flex-shrink-0 bg-emerald-500/20 text-emerald-300 flex items-center justify-center rounded-full mr-4 border border-emerald-400/40"><Database size={24}/></div>
                    <div>
                        <h3 className="font-black text-white leading-tight text-lg">Postgres Enclave</h3>
                        <p className="text-[10px] text-emerald-300 uppercase tracking-widest font-mono mt-1">RLS Multi-Tenant Vault</p>
                    </div>
                </div>

            </div>

             {/* EXPANSION DEEP-DIVE MODAL */}
             {activeNode && selectedSpec && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    
                    <div 
                        className="absolute inset-0 bg-oxford-dark/85 backdrop-blur-md cursor-pointer" 
                        onClick={() => setActiveNode(null)}
                    ></div>

                    <div className="relative w-full max-w-5xl h-[80vh] bg-oxford-dark border border-brass/35 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                        
                        <div className="h-14 bg-oxford border-b border-brass/25 flex items-center px-6 justify-between select-none">
                            <div className="flex gap-2.5">
                                <span className="w-3 h-3 rounded-full bg-rose-400/80"></span>
                                <span className="w-3 h-3 rounded-full bg-brass-light/90"></span>
                                <span className="w-3 h-3 rounded-full bg-emerald-400/80"></span>
                            </div>
                            <span className="text-xs font-mono text-parchment/80 ml-4 hidden sm:block tracking-widest uppercase">SCHOLARMIND · ARCHITECTURE INSPECTOR ({selectedSpec.id})</span>
                            <button onClick={() => setActiveNode(null)} className="text-slate-300 hover:text-white transition-colors bg-white/10 p-2 rounded-full hover:bg-brass">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex flex-col md:flex-row h-[calc(100%-3.5rem)]">
                            
                            {/* Left Panel: Verification Trace */}
                            <div className="w-full md:w-1/2 bg-oxford-dark p-8 border-r border-brass/20 flex flex-col font-mono text-sm text-parchment overflow-hidden relative">
                                <div className="flex items-center gap-3 text-brass-light mb-6 border-b border-brass/20 pb-3 uppercase tracking-widest font-bold text-xs"><Terminal size={16}/> VERIFICATION_TRACE.LOG</div>
                                
                                <pre className="whitespace-pre-wrap leading-loose text-slate-200">
                                    {selectedSpec.terminalText}
                                </pre>

                                <div className="mt-2 w-2.5 h-4 bg-brass-light animate-pulse opacity-80 rounded-sm"></div>
                            </div>

                            {/* Right Panel: Architectural Specification */}
                            <div className="w-full md:w-1/2 p-10 md:p-14 flex flex-col justify-center bg-oxford/50 relative overflow-y-auto">
                                <div className={`absolute top-10 right-10 w-80 h-80 blur-[120px] rounded-full pointer-events-none opacity-20 ${ACCENT_STYLES[selectedSpec.iconColor].glow}`}></div>

                                <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs font-bold font-mono tracking-widest mb-6 w-fit border uppercase ${ACCENT_STYLES[selectedSpec.iconColor].badge}`}>
                                    {selectedSpec.badge}
                                </span>

                                <h2 className="text-3xl md:text-4xl font-black text-white mb-5 tracking-tight leading-tight">
                                    {selectedSpec.title}
                                </h2>

                                <p className="text-slate-300 text-base md:text-lg leading-relaxed mb-8 border-l-2 border-brass/50 pl-5">
                                    {selectedSpec.description}
                                </p>

                                <div className="space-y-3.5">
                                    {selectedSpec.features.map((feature: string, idx: number) => (
                                        <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                                            <div className="h-7 w-7 rounded-full bg-brass/20 border border-brass/40 flex items-center justify-center flex-shrink-0">
                                                <div className="h-2.5 w-2.5 rounded-full bg-brass-light"></div>
                                            </div>
                                            <span className="text-sm md:text-base font-medium text-slate-200">{feature}</span>
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
