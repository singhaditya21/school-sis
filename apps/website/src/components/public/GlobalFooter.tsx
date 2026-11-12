import Link from 'next/link';
import { resolveAppUrl } from '@/lib/app-url';

export default function GlobalFooter() {
    const appUrl = resolveAppUrl();

    return (
        <footer className="bg-oxford-dark text-slate-300 border-t border-brass/30 relative z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 text-sm">
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center gap-2.5">
                        <span className="inline-block h-3 w-3 rounded-full bg-brass" />
                        <span className="text-lg font-extrabold text-ivory tracking-tight">ScholarMind</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                        Institutional Operating System for CBSE, ICSE, IGCSE, IB, and Multi-Campus Educational Trusts. Built for verified fee reconciliation, Tally Prime XML sync, and DPDP Act 2023 Section 9 child-data governance.
                    </p>
                    <p className="text-xs text-slate-400">
                        Headquarters: New Delhi, Delhi, India ·{' '}
                        <a
                            href="https://www.linkedin.com/company/scholarmind-os"
                            target="_blank"
                            rel="noreferrer"
                            className="text-brass-light hover:underline font-semibold"
                        >
                            LinkedIn
                        </a>
                    </p>
                </div>

                <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-brass-light">
                        Platform &amp; Sandbox
                    </h4>
                    <ul className="space-y-2 text-xs">
                        <li>
                            <a href={`${appUrl}/demo`} className="hover:text-ivory transition-colors">
                                1-Click Live CBSE Demo
                            </a>
                        </li>
                        <li>
                            <a href={`${appUrl}/setup`} className="hover:text-ivory transition-colors">
                                Start Campus Workspace (60s)
                            </a>
                        </li>
                        <li>
                            <Link href="/pricing" className="hover:text-ivory transition-colors">
                                INR &amp; USD Pricing
                            </Link>
                        </li>
                        <li>
                            <Link href="/solutions/ai-agents" className="hover:text-ivory transition-colors">
                                Governed AI Copilots
                            </Link>
                        </li>
                        <li>
                            <Link href="/architecture" className="hover:text-ivory transition-colors">
                                Security &amp; RLS Architecture
                            </Link>
                        </li>
                    </ul>
                </div>

                <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-brass-light">
                        Free Tools &amp; Compliance
                    </h4>
                    <ul className="space-y-2 text-xs">
                        <li>
                            <Link href="/tools/dpdp-readiness" className="hover:text-ivory transition-colors">
                                2-Min DPDP Section 9 Scorer
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/guides/cbse-school-erp-tally-prime-integration"
                                className="hover:text-ivory transition-colors"
                            >
                                Tally Prime XML Integration
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/guides/dpdp-act-2023-section-9-compliance-indian-schools"
                                className="hover:text-ivory transition-colors"
                            >
                                DPDP Act 2023 School Guide
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/guides/educational-trust-society-four-eyes-audit-software"
                                className="hover:text-ivory transition-colors"
                            >
                                Trust 4-Eyes Maker-Checker
                            </Link>
                        </li>
                        <li>
                            <Link href="/privacy" className="hover:text-ivory transition-colors">
                                Privacy &amp; Child Data Notice
                            </Link>
                        </li>
                    </ul>
                </div>

                <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-brass-light">
                        48h ERP Migrations
                    </h4>
                    <ul className="space-y-2 text-xs">
                        <li>
                            <Link href="/guides" className="hover:text-ivory transition-colors font-semibold text-ivory">
                                All 22 Playbooks &amp; City Hubs →
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/guides/migrate-entab-campuscare-to-scholarmind"
                                className="hover:text-ivory transition-colors"
                            >
                                Entab CampusCare Migration
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/guides/migrate-fedena-to-scholarmind"
                                className="hover:text-ivory transition-colors"
                            >
                                Fedena Migration Guide
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/guides/migrate-myclassboard-mcb-to-scholarmind"
                                className="hover:text-ivory transition-colors"
                            >
                                MyClassboard (MCB) Migration
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="/guides/migrate-tally-excel-registers-to-scholarmind"
                                className="hover:text-ivory transition-colors"
                            >
                                Tally &amp; Excel Cutover
                            </Link>
                        </li>
                    </ul>
                </div>
            </div>

            <div className="border-t border-white/10 py-5 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                <span>© {new Date().getFullYear()} ScholarMind Institutional Desk. All rights reserved.</span>
                <div className="flex items-center gap-4">
                    <a href="/sitemap.xml" className="hover:text-ivory transition-colors">
                        Sitemap
                    </a>
                    <a href="/llms.txt" className="hover:text-ivory transition-colors">
                        llms.txt
                    </a>
                    <Link href="/book-demo" className="hover:text-ivory transition-colors">
                        Book Pilot
                    </Link>
                </div>
            </div>
        </footer>
    );
}
