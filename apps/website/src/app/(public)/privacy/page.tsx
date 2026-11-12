import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Privacy Policy & DPDP Act 2023 Disclosures',
    description:
        'Statutory privacy disclosures under the India Digital Personal Data Protection (DPDP) Act, 2023 covering school Data Fiduciaries, children’s data safeguards, erasure rights, and Grievance Officer contact.',
};

export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-ivory px-4 pb-24 pt-32 text-slate-700">
            <article className="mx-auto max-w-4xl rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm md:p-12">
                <p className="text-sm font-bold uppercase tracking-widest text-brass">
                    Statutory Privacy Policy · India DPDP Act, 2023
                </p>
                <h1 className="mt-3 text-4xl font-black tracking-tight text-oxford">
                    Personal Data Protection &amp; Institutional Governance Notice
                </h1>
                <p className="mt-4 text-sm text-slate-500">
                    Effective Date: November 2026 · Governed by the Digital Personal Data Protection Act, 2023 (Act No. 22 of 2023, Republic of India)
                </p>

                <section className="mt-8 space-y-3">
                    <h2 className="text-xl font-extrabold text-oxford">
                        1. Statutory Roles: Data Fiduciary vs. Data Processor
                    </h2>
                    <p className="leading-7">
                        Under the <strong>India Digital Personal Data Protection (DPDP) Act, 2023</strong>, institutional responsibilities depend on the relationship through which personal data is collected:
                    </p>
                    <ul className="list-disc space-y-2 pl-6 leading-7">
                        <li>
                            <strong>Partner Schools &amp; Educational Trusts as Data Fiduciaries:</strong> For student admissions, academic records, attendance registers, transport corridors, fee ledgers, and staff records hosted in a school&apos;s workspace, the respective school, society, or educational trust determines the purpose and means of processing and acts as the statutory <strong>Data Fiduciary</strong>. ScholarMind processes institutional records strictly as a <strong>Data Processor</strong> under a written Data Processing Agreement (DPA) and documented school administrator instructions.
                        </li>
                        <li>
                            <strong>ScholarMind as Data Fiduciary (Commercial &amp; Pilot Enquiries):</strong> When a school leader, trustee, or administrator submits a demo or pilot enquiry on this website, ScholarMind acts as the <strong>Data Fiduciary</strong> for business contact details (name, work email, institution name, student capacity band, consent timestamp, campaign attribution, and pseudonymous anti-abuse network identifiers).
                        </li>
                    </ul>
                </section>

                <section className="mt-8 space-y-3">
                    <h2 className="text-xl font-extrabold text-oxford">
                        2. Section 9 Safeguards for Children&apos;s Personal Data &amp; Verifiable Parental Consent
                    </h2>
                    <p className="leading-7">
                        K-12 school operations involve personal data of children (individuals under 18 years of age under Section 2(f) of the DPDP Act, 2023). In strict compliance with <strong>Section 9 of the DPDP Act, 2023</strong>:
                    </p>
                    <ul className="list-disc space-y-2 pl-6 leading-7">
                        <li>
                            <strong>Verifiable Parental / Lawful Guardian Consent:</strong> Institutional workspaces provide structured consent-version logging so the school Data Fiduciary obtains and records verifiable consent from the parent or lawful guardian prior to onboarding minor student profiles or guardian communication channels.
                        </li>
                        <li>
                            <strong>Zero Behavioral Tracking or Targeted Advertising to Children:</strong> ScholarMind <strong>strictly prohibits</strong> behavioral monitoring, commercial profiling, third-party ad-tech pixels, data brokerage, or targeted advertising directed at children or guardians across web and mobile surfaces.
                        </li>
                        <li>
                            <strong>No Detrimental Processing:</strong> Student data is isolated per tenant via PostgreSQL Row-Level Security (RLS) and AES-256-GCM field-level encryption for sensitive government/identity fields, and is never used to train external public foundation models.
                        </li>
                    </ul>
                </section>

                <section className="mt-8 space-y-3">
                    <h2 className="text-xl font-extrabold text-oxford">
                        3. Data Retention, Correction &amp; Right to Erasure Workflow (Sections 11–14)
                    </h2>
                    <p className="leading-7">
                        Personal data is retained only as long as necessary to fulfill the specified purpose or comply with applicable Indian laws (including CBSE/ICSE/State Board academic archive rules and statutory tax/financial audit retention):
                    </p>
                    <ul className="list-disc space-y-2 pl-6 leading-7">
                        <li>
                            <strong>Commercial &amp; Demo Enquiries:</strong> Retained for up to <strong>24 months</strong> from last interaction or erased earlier upon consent withdrawal. Data Principals may request access, correction, updating, or erasure directly from ScholarMind.
                        </li>
                        <li>
                            <strong>School Workspace Records:</strong> Parents, guardians, students (upon attaining majority), and staff exercising statutory rights to <strong>Access Summary (Section 11)</strong>, <strong>Correction / Completion / Updating (Section 12)</strong>, <strong>Erasure</strong>, or <strong>Nomination (Section 14)</strong> should submit requests to their school&apos;s administration office, which executes audited erasure and export workflows inside ScholarMind. Where a request reaches ScholarMind directly, we route it to the designated school Data Fiduciary within 48 hours and assist execution unless statutory retention mandates apply.
                        </li>
                        <li>
                            <strong>Post-Termination Purge:</strong> Upon workspace offboarding or contract expiry, institutional backups and live tenant rows are cryptographically purged following the agreed export window (default 30 days) unless retention is required by Indian law.
                        </li>
                    </ul>
                </section>

                <section className="mt-8 space-y-3">
                    <h2 className="text-xl font-extrabold text-oxford">
                        4. Cross-Border Data Processing Disclosures (Section 16)
                    </h2>
                    <p className="leading-7">
                        Production institutional databases and application compute are provisioned in <strong>Asia-Pacific (Mumbai / Singapore)</strong> cloud infrastructure with TLS 1.2+/1.3 encryption in transit, AES-256 encryption at rest, and strict sub-processor agreements covering transactional email, SMS/WhatsApp gateways, payment gateways (UPI / Razorpay / Stripe), and bot-mitigation (Cloudflare Turnstile). ScholarMind does not transfer personal data to any territory restricted by notification of the Central Government under <strong>Section 16 of the DPDP Act, 2023</strong>.
                    </p>
                </section>

                <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50/80 p-6 space-y-3">
                    <h2 className="text-xl font-extrabold text-oxford">
                        5. Designated Grievance Officer &amp; 7-Business-Day Resolution SLA (Section 13)
                    </h2>
                    <p className="leading-7">
                        In accordance with Section 13 of the DPDP Act, 2023 and the Information Technology Rules, Data Principals may address privacy enquiries, consent withdrawals, correction/erasure requests, or grievances to our designated Grievance Officer:
                    </p>
                    <div className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                        <p><strong>Designation:</strong> Data Protection &amp; Grievance Redressal Officer, ScholarMind</p>
                        <p><strong>Email:</strong> <a href="mailto:grievance.privacy@scholarmind.in" className="font-semibold text-oxford underline">grievance.privacy@scholarmind.in</a></p>
                        <p><strong>Acknowledgement Window:</strong> Within 24 hours of receipt with a unique ticket reference</p>
                        <p><strong>Binding Resolution SLA:</strong> Resolved within <strong>7 business days</strong> from receipt of a verifiable request</p>
                    </div>
                    <p className="pt-2 text-xs leading-6 text-slate-600">
                        If a grievance is not resolved satisfactorily within the stipulated timeframe, the Data Principal retains the statutory right under Section 13(3) of the DPDP Act, 2023 to approach the <strong>Data Protection Board of India</strong>.
                    </p>
                </section>

                <div className="mt-8 flex flex-wrap gap-4">
                    <Link
                        href="/book-demo"
                        className="inline-flex rounded-xl bg-oxford px-5 py-3 font-bold text-white hover:bg-oxford-dark"
                    >
                        Return to demo request
                    </Link>
                </div>
            </article>
        </main>
    );
}
