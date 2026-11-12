export type GuideCategory = 'COMPLIANCE_FINANCE' | 'MIGRATION' | 'REGIONAL_HUB';

export interface GuideFaq {
    question: string;
    answer: string;
}

export interface GuideComparisonRow {
    dimension: string;
    legacyApproach: string;
    scholarMindStandard: string;
}

export interface SeoGuide {
    slug: string;
    category: GuideCategory;
    categoryLabel: string;
    badge: string;
    title: string;
    metaDescription: string;
    heroSubtitle: string;
    readingMinutes: number;
    updatedIso: string;
    keyMetrics: Array<{ value: string; label: string }>;
    executiveSummary: string[];
    checklistTitle: string;
    checklistItems: Array<{ step: string; detail: string }>;
    comparisonRows: GuideComparisonRow[];
    faqs: GuideFaq[];
}

export const WEBSITE_BASE_URL =
    (process.env.NEXT_PUBLIC_SITE_URL || 'https://school-sis-website.vercel.app').replace(/\/+$/, '');

const COMPLIANCE_GUIDES: SeoGuide[] = [
    {
        slug: 'cbse-school-erp-tally-prime-integration',
        category: 'COMPLIANCE_FINANCE',
        categoryLabel: 'Compliance & Finance',
        badge: 'Tally Prime & Trust Accounting',
        title: 'CBSE School ERP with Tally Prime XML Integration & Bank Reconciliation',
        metaDescription:
            'Eliminate manual voucher re-entry between your CBSE school fee counter and Tally Prime. Export ledger-mapped XML vouchers, enforce 4-eyes concession approvals, and reconcile Razorpay UPI settlements daily.',
        heroSubtitle:
            'Stop re-typing thousands of tuition receipts, bus fee heads, and concession adjustments into Tally Prime every month-end. Map every fee head once and hand your Chartered Accountant an immutable voucher pack.',
        readingMinutes: 6,
        updatedIso: '2026-11-12',
        keyMetrics: [
            { value: '99.5%', label: 'Daily bank-to-voucher match target' },
            { value: '0 hrs', label: 'Duplicate Tally voucher typing' },
            { value: '4-Eyes', label: 'Maker-checker waiver lock' },
            { value: '₹18', label: 'Core plan per student / month' },
        ],
        executiveSummary: [
            'Most Indian K-12 schools run two disconnected financial realities: a front-desk ERP issuing parent fee receipts and an accounts room manually re-entering consolidated or line-item vouchers into Tally Prime days later. That gap creates reconciliation drift, unapproved counter concessions, and painful March statutory audits.',
            'ScholarMind bridges student billing and statutory accounting natively. Every Tuition, Composite Annual Fee, Transport, Lab, and Hostel head maps directly to your Trust or Society Tally ledger names, generating clean Tally Prime XML import files alongside Zoho Books CSV packs.',
            'Combined with Razorpay Route split settlements (sending Tuition directly to the Educational Trust account and Transport directly to the Fleet account) and maker-checker approval locks on every fee waiver or refund, school treasurers close daily cashbooks in minutes.',
        ],
        checklistTitle: '5-Step Tally Prime & Fee Control Rollout',
        checklistItems: [
            {
                step: '1. Map Fee Heads to Exact Tally Ledger Names',
                detail: 'Bind Tuition Fee, Admission Fee, Caution Deposit, and Transport Slabs to your existing Tally Prime chart of accounts in /fees/accounting-sync.',
            },
            {
                step: '2. Activate Razorpay UPI & Split Route Accounts',
                detail: 'Collect 0%-MDR UPI and RuPay payments via signed WhatsApp pay links without commingling Society and Transport bank accounts.',
            },
            {
                step: '3. Lock Counter Concessions Behind 4-Eyes Approval',
                detail: 'Any sibling discount, staff ward waiver, or late-fee reversal requires Principal or Trustee co-signature before altering ledger receivables.',
            },
            {
                step: '4. Export Verified Tally Prime XML Batches',
                detail: 'Download date-bounded Receipt, Credit Note, and Bank Settlement XML vouchers verified against UTR settlement references.',
            },
            {
                step: '5. Preserve Statutory Form 10B / 10BB Evidence',
                detail: 'Give external Trust auditors read-only verification trails linking every student receipt to its exact bank settlement batch.',
            },
        ],
        comparisonRows: [
            {
                dimension: 'Tally Prime Sync',
                legacyApproach: 'Manual Excel pivot tables re-typed into Tally at month-end',
                scholarMindStandard: '1-click Tally Prime XML & Zoho Books export mapped by fee head',
            },
            {
                dimension: 'Concession & Waiver Governance',
                legacyApproach: 'Fee clerk edits invoice amount directly with no audit trail',
                scholarMindStandard: 'Mandatory 4-eyes maker-checker workflow with immutable logs',
            },
            {
                dimension: 'Trust vs Transport Bank Split',
                legacyApproach: 'Single pooling account requiring manual inter-trust transfers',
                scholarMindStandard: 'Native Razorpay Route split settlement at payment capture',
            },
        ],
        faqs: [
            {
                question: 'Does ScholarMind work with existing Tally Prime Gold and Silver installations?',
                answer: 'Yes. ScholarMind generates standard Tally Prime XML voucher envelopes (Receipt, Journal, and Credit Note vouchers) that import directly into Tally Prime Silver or Gold without third-party TDL plugins.',
            },
            {
                question: 'How does ScholarMind handle fee concessions during statutory Trust audits?',
                answer: 'Every concession, scholarship, or late-fee waiver is blocked from unilateral clerk edits and routed through a 4-eyes maker-checker approval queue, recording requester, approver, reason code, and timestamp.',
            },
            {
                question: 'Can we test the Tally Prime XML export before migrating our school?',
                answer: 'Yes. Launch the 1-click CBSE Demo Sandbox (/demo) and visit Accounting Sync (/fees/accounting-sync) to inspect live Tally XML voucher generation immediately.',
            },
        ],
    },
    {
        slug: 'dpdp-act-2023-section-9-compliance-indian-schools',
        category: 'COMPLIANCE_FINANCE',
        categoryLabel: 'Compliance & Finance',
        badge: 'DPDP Act 2023 · Child Data',
        title: 'DPDP Act 2023 Section 9 Compliance Software for Indian Schools',
        metaDescription:
            'How CBSE, ICSE, and IB schools comply with India’s Digital Personal Data Protection (DPDP) Act 2023 Section 9 for students under 18: AES-256-GCM PII encryption, verifiable parental consent, and PostgreSQL RLS isolation.',
        heroSubtitle:
            'Under Section 9 of India’s DPDP Act 2023, every student under 18 is legally classified as a child. Unencrypted Aadhaar spreadsheets, shared admin logins, and cross-tenant database leaks now carry board-level statutory exposure.',
        readingMinutes: 7,
        updatedIso: '2026-11-12',
        keyMetrics: [
            { value: 'AES-256', label: 'Field-level SIV/GCM PII encryption' },
            { value: '146', label: 'PostgreSQL RLS-isolated tables' },
            { value: 'Section 9', label: 'Verifiable guardian consent trail' },
            { value: '0', label: 'Behavioral ad-tracking on minors' },
        ],
        executiveSummary: [
            'Section 9 of the Digital Personal Data Protection (DPDP) Act 2023 imposes strict statutory obligations on Data Fiduciaries processing personal data of children (any individual under 18 years of age). Schools collect the most sensitive child dataset in India: birth dates, guardian contacts, medical allergies, Aadhaar/APAAR identifiers, residential coordinates, and academic evaluations.',
            'Legacy school ERPs built a decade ago store parent phone numbers, emails, and identity numbers in plaintext SQL columns shared across dozens of schools, lack Multi-Factor Authentication (MFA) on registrar roles, and forward raw student PII to external tools without redaction.',
            'ScholarMind was engineered around DPDP Section 9 from day one: sensitive PII fields are encrypted at the application layer with AES-256-GCM / deterministic SIV before hitting PostgreSQL, every campus is fenced by database-enforced Row-Level Security (RLS), privileged staff enforce TOTP MFA, and external LLM prompts automatically scrub Aadhaar, PAN, email, and 10-digit phone numbers before transmission.',
        ],
        checklistTitle: 'Boardroom DPDP Section 9 Readiness Checklist for Schools',
        checklistItems: [
            {
                step: '1. Verifiable Parental Consent Ledger',
                detail: 'Capture timestamped, versioned guardian consent notices across online admissions (/apply-online), parent portals, and WhatsApp communication channels.',
            },
            {
                step: '2. Application-Layer Child & Guardian PII Encryption',
                detail: 'Ensure guardian mobile numbers, email addresses, and government identifiers are encrypted at rest rather than stored in readable CSV backups.',
            },
            {
                step: '3. Strict Prohibition on Child Profiling or Ad Tracking',
                detail: 'Operate zero third-party behavioral ad pixels on student or parent portals in strict alignment with DPDP Section 9(3).',
            },
            {
                step: '4. Role-Scoped Access + TOTP Multi-Factor Authentication',
                detail: 'Enforce least-privilege RBAC across 10 school roles and require TOTP MFA for Super Admin, Principal, Finance, and Registrar logins.',
            },
            {
                step: '5. PII Redaction Before Governed AI Processing',
                detail: 'Strip emails, phone numbers, PAN, and 12-digit Aadhaar patterns automatically before any governed copilot summary is generated.',
            },
        ],
        comparisonRows: [
            {
                dimension: 'Guardian Phone & ID Storage',
                legacyApproach: 'Plaintext database columns exposed in full SQL dumps',
                scholarMindStandard: 'AES-256-GCM & SIV field encryption with key rotation support',
            },
            {
                dimension: 'Multi-School Data Isolation',
                legacyApproach: 'Application WHERE-clause filtering prone to IDOR bugs',
                scholarMindStandard: 'PostgreSQL Row-Level Security (RLS) enforced on 146 tables',
            },
            {
                dimension: 'External AI Privacy',
                legacyApproach: 'Copy-pasting raw student spreadsheets into public chatbots',
                scholarMindStandard: 'Automated PII redaction + zero-retention governed tool spine',
            },
        ],
        faqs: [
            {
                question: 'Does DPDP Act 2023 apply to private CBSE, ICSE, and Educational Trust schools?',
                answer: 'Yes. Any school in India collecting digital personal data of students and parents acts as a Data Fiduciary under the DPDP Act 2023, and because students are under 18, Section 9 child-data safeguards apply directly.',
            },
            {
                question: 'How can our Principal assess our school’s current DPDP readiness in 2 minutes?',
                answer: 'Use ScholarMind’s free 2-Minute School DPDP Readiness Scorer at /tools/dpdp-readiness to generate an instant 8-point compliance score and boardroom remediation memo.',
            },
            {
                question: 'Does ScholarMind sell or monetize parent or student contact data?',
                answer: 'Never. ScholarMind is a pure institutional operating system with zero advertising trackers, zero cross-selling of parent leads, and strict tenant data ownership.',
            },
        ],
    },
    {
        slug: 'educational-trust-society-four-eyes-audit-software',
        category: 'COMPLIANCE_FINANCE',
        categoryLabel: 'Compliance & Finance',
        badge: 'Trust & Society Governance',
        title: 'Educational Trust & Society 4-Eyes Audit & Multi-Campus Treasury Software',
        metaDescription:
            'Governance-first ERP for Indian Educational Trusts and Section 8 School Groups: multi-campus fee velocity, 4-eyes concession approvals, immutable audit logs, and statutory audit readiness.',
        heroSubtitle:
            'Give Trustees, Treasurers, and Secretaries live cross-campus visibility over billed fees, daily collections, overdue ageing buckets, and every single concession granted across your school group.',
        readingMinutes: 6,
        updatedIso: '2026-11-12',
        keyMetrics: [
            { value: '100%', label: 'Waivers gated by maker-checker' },
            { value: 'Live', label: 'Cross-campus executive rollups' },
            { value: 'QR', label: 'Tamper-evident TC & report cards' },
            { value: 'RLS', label: 'Strict campus-by-campus isolation' },
        ],
        executiveSummary: [
            'When an Educational Society or Section 8 Trust grows beyond a single campus, financial visibility usually fractures. Trustees wait weeks for emailed Excel MIS trackers while individual campus counters grant ad-hoc fee discounts or backdated receipt edits that only surface during annual statutory audit.',
            'ScholarMind’s Executive Multi-Campus HQ (/executive) aggregates billed demand, settled collections, 30/60/90+ day overdue ageing, concession ratios, and student attendance across every campus in real time — while keeping each school’s operational data isolated via PostgreSQL Row-Level Security.',
            'Every high-risk financial mutation — fee concessions, invoice write-offs, refunds, and published exam grade changes — passes through a 4-eyes Maker-Checker queue so the initiator can never self-approve their own adjustment.',
        ],
        checklistTitle: 'Multi-Campus Trust Governance Blueprint',
        checklistItems: [
            {
                step: '1. Standardize Fee Heads & Concession Reason Codes',
                detail: 'Define uniform RTE, Sibling, Merit Scholarship, and Staff Ward categories across all Trust campuses.',
            },
            {
                step: '2. Enable Maker-Checker Thresholds',
                detail: 'Require Principal or Group CFO sign-off before any counter waiver or credit note posts to the ledger.',
            },
            {
                step: '3. Monitor Cross-Campus Collection Efficiency Live',
                detail: 'Compare campus-wise collection rates and 90+ day arrears buckets from a single /executive dashboard.',
            },
            {
                step: '4. Issue QR-Verifiable Credentials & Gate Passes',
                detail: 'Prevent forged Transfer Certificates, CBSE report cards, and fee receipts with cryptographic public verification links.',
            },
        ],
        comparisonRows: [
            {
                dimension: 'Cross-Campus Group Reporting',
                legacyApproach: 'Weekly emailed spreadsheets with inconsistent formulas',
                scholarMindStandard: 'Real-time /executive headquarters dashboard across all branches',
            },
            {
                dimension: 'Receipt Cancellation & Refunds',
                legacyApproach: 'Silent deletion or overwrite by single admin user',
                scholarMindStandard: 'Append-only ledger entries gated by 4-eyes approval',
            },
            {
                dimension: 'Document Authenticity',
                legacyApproach: 'Rubber-stamped PDFs vulnerable to tampering',
                scholarMindStandard: 'Cryptographic QR verification on report cards, receipts & passes',
            },
        ],
        faqs: [
            {
                question: 'Can a Campus Principal see only their branch while the Trust Chairman sees all campuses?',
                answer: 'Yes. Campus staff are cryptographically scoped to their single tenant_id via PostgreSQL RLS, while authorized Group HQ roles view aggregated multi-campus metrics in /executive.',
            },
            {
                question: 'Can the person who requests a fee waiver approve it themselves?',
                answer: 'No. ScholarMind enforces strict separation of duties: the approver user ID must differ from the requester user ID on every maker-checker workflow.',
            },
        ],
    },
    {
        slug: 'whatsapp-upi-school-fee-collection-reconciliation',
        category: 'COMPLIANCE_FINANCE',
        categoryLabel: 'Compliance & Finance',
        badge: 'UPI & WhatsApp Recovery',
        title: 'WhatsApp & Razorpay UPI School Fee Collection with Automated Reconciliation',
        metaDescription:
            'Recover overdue school tuition faster without awkward phone calls: send signed 1-tap WhatsApp UPI fee payment links, generate instant PDF receipts, and run governed AI arrears follow-ups.',
        heroSubtitle:
            'Parents rarely ignore school fees out of refusal — they miss clunky parent-portal logins and forgotten passwords. Meet parents on WhatsApp with 1-tap signed UPI payment links that reconcile automatically.',
        readingMinutes: 5,
        updatedIso: '2026-11-12',
        keyMetrics: [
            { value: '1-Tap', label: 'Signed WhatsApp UPI pay link' },
            { value: '₹0', label: 'Optional self-hosted WAHA gateway' },
            { value: 'Instant', label: 'Verified PDF fee receipt' },
            { value: '30/60/90d', label: 'Ageing bucket prioritization' },
        ],
        executiveSummary: [
            'Traditional parent portals see less than 25% monthly login adoption because parents forget usernames, app updates fail, and NetBanking flows time out on mobile networks. Meanwhile, school fee clerks spend hundreds of hours dialing parents manually ahead of quarterly exams.',
            'ScholarMind’s Overdue Fee Recovery Copilot (/fees/defaulters) segments overdue invoices by 1–30, 31–60, 61–90, and 90+ day ageing buckets, drafts polite, context-aware reminders for human review, and dispatches HMAC-signed 1-click payment links over WhatsApp.',
            'Parents tap the link on their phone, pay in 10 seconds via GPay, PhonePe, Paytm, or RuPay without needing a password, and receive an instant receipt while the student ledger updates automatically.',
        ],
        checklistTitle: 'How Frictionless WhatsApp UPI Recovery Works',
        checklistItems: [
            {
                step: '1. Review Ageing Buckets in /fees/defaulters',
                detail: 'Filter overdue balances by grade, instalment, sibling group, and days past due.',
            },
            {
                step: '2. Generate Governed AI Reminder Drafts',
                detail: 'Prepare respectful, tone-calibrated nudges (gentle reminder at 7 days, formal notice at 60+ days) gated by finance staff approval.',
            },
            {
                step: '3. Dispatch via Meta Cloud API or ₹0 Self-Hosted WAHA',
                detail: 'Send reminders through official WhatsApp Cloud API or run our included self-hosted WAHA Docker container at zero per-message markup.',
            },
            {
                step: '4. Auto-Settle Webhook & Issue Receipt',
                detail: 'Razorpay signature-verified webhooks mark the exact invoice paid in real time with idempotent replay protection.',
            },
        ],
        comparisonRows: [
            {
                dimension: 'Parent Payment Experience',
                legacyApproach: 'Download app → reset password → navigate 6 menus → pay',
                scholarMindStandard: 'Tap signed WhatsApp link → approve UPI app → instant PDF receipt',
            },
            {
                dimension: 'WhatsApp Infrastructure Cost',
                legacyApproach: '₹0.80–₹1.20 markup per message charged by ERP vendor',
                scholarMindStandard: 'Bring your own Meta API or ₹0 self-hosted WAHA Docker gateway',
            },
            {
                dimension: 'Webhook Settlement Safety',
                legacyApproach: 'Pending payments stuck in limbo requiring manual bank lookup',
                scholarMindStandard: 'HMAC-verified idempotent webhooks + automated ledger posting',
            },
        ],
        faqs: [
            {
                question: 'Do parents need to install an app or remember a password to pay via the WhatsApp link?',
                answer: 'No. Each invoice link carries a time-bounded cryptographic signature scoped strictly to that invoice, letting parents verify student initials and pay via any UPI app in one tap.',
            },
            {
                question: 'Does the AI copilot message parents without staff permission?',
                answer: 'Never. ScholarMind enforces human-in-the-loop governance: AI copilots draft and prioritize reminders, and an authorized finance officer or principal approves dispatch.',
            },
        ],
    },
];

interface MigrationVendorSpec {
    slug: string;
    vendor: string;
    shortName: string;
    exportQuirks: string;
    whySchoolsSwitch: string;
    sampleHeaders: string;
}

const MIGRATION_SPECS: MigrationVendorSpec[] = [
    {
        slug: 'migrate-fedena-to-scholarmind',
        vendor: 'Fedena',
        shortName: 'Fedena',
        exportQuirks:
            'Fedena student & finance CSV exports often split batch_name (e.g., "2026-Grade 8-A"), immediate_contact_phone, and fee balance remarks across separate sheets.',
        whySchoolsSwitch:
            'Schools outgrowing Fedena switch to ScholarMind for native Tally Prime XML sync, Razorpay Route split settlements, DPDP Section 9 field-level PII encryption, and governed AI copilots.',
        sampleHeaders: 'admission_no, first_name, last_name, batch_name, dob, immediate_contact_name, immediate_contact_phone, balance_due',
    },
    {
        slug: 'migrate-entab-campuscare-to-scholarmind',
        vendor: 'Entab CampusCare',
        shortName: 'Entab',
        exportQuirks:
            'Entab CampusCare exports commonly use Adm_No, Pupil_Name, Class_Section ("Grade 7 - A"), Father_Mobile, and Fee_Arrears with DD/MM/YYYY birth dates.',
        whySchoolsSwitch:
            'CBSE schools switch from Entab CampusCare to modernize clunky desktop-era UIs, eliminate manual Tally voucher re-entry, and unlock 1-tap WhatsApp UPI fee links.',
        sampleHeaders: 'Adm_No, Pupil_Name, DOB, Gender, Class_Section, Father_Name, Father_Mobile, Parent_Email, Fee_Arrears',
    },
    {
        slug: 'migrate-myclassboard-mcb-to-scholarmind',
        vendor: 'MyClassboard (MCB)',
        shortName: 'MyClassboard',
        exportQuirks:
            'MyClassboard exports frequently bundle EnrollmentNo, StudentFullName, ClassSection, ParentContact, and PendingDues with sibling duplicate mobile numbers.',
        whySchoolsSwitch:
            'Multi-branch trusts move from MCB to ScholarMind for database-enforced Row-Level Security, 4-eyes maker-checker waiver controls, and live multi-campus /executive rollups.',
        sampleHeaders: 'EnrollmentNo, StudentFullName, DOB, Gender, ClassSection, ParentName, ParentContact, PendingDues',
    },
    {
        slug: 'migrate-edunext-to-scholarmind',
        vendor: 'Edunext ERP',
        shortName: 'Edunext',
        exportQuirks:
            'Edunext student master sheets combine Scholar_No, Student_Name, Standard, Division, and Father_Mobile alongside quarter-wise fee carryforward columns.',
        whySchoolsSwitch:
            'Principals and Treasurers upgrade from Edunext to gain transparent per-student SaaS pricing (from ₹18/student/mo), zero hidden SMS markups, and verifiable DPDP compliance.',
        sampleHeaders: 'Scholar_No, Student_Name, Birth_Date, Standard, Division, Father_Name, Father_Mobile, Opening_Balance',
    },
    {
        slug: 'migrate-teachmint-to-scholarmind',
        vendor: 'Teachmint',
        shortName: 'Teachmint',
        exportQuirks:
            'Classroom-first exports often contain student_id, name, class, section, and whatsapp_no with partial guardian email or opening balance metadata.',
        whySchoolsSwitch:
            'Growing K-12 institutions graduate from classroom apps to ScholarMind when statutory Trust audits demand Tally Prime XML vouchers, 4-eyes concession locks, and CBSE QR report cards.',
        sampleHeaders: 'student_id, name, dob, gender, class, section, parent_name, whatsapp_no, due_amount',
    },
    {
        slug: 'migrate-tally-excel-registers-to-scholarmind',
        vendor: 'Tally & Excel Registers',
        shortName: 'Tally & Excel',
        exportQuirks:
            'Accountants maintaining student ledgers in Tally or Google Sheets typically export Ledger_Name, Alias_AdmNo, Mobile, and Closing_Balance with inconsistent date formats.',
        whySchoolsSwitch:
            'Schools running on spreadsheets and Tally move to ScholarMind in 48 hours to give parents 1-tap UPI links, automate CBSE attendance & report cards, and keep Tally 100% synced.',
        sampleHeaders: 'Alias_AdmNo, Ledger_Name, Class, Mobile, Email, Closing_Balance, Narration',
    },
];

const MIGRATION_GUIDES: SeoGuide[] = MIGRATION_SPECS.map((spec) => ({
    slug: spec.slug,
    category: 'MIGRATION',
    categoryLabel: '48-Hour ERP Migration',
    badge: `${spec.shortName} → ScholarMind`,
    title: `48-Hour School Migration Guide: ${spec.vendor} to ScholarMind`,
    metaDescription: `Switch from ${spec.vendor} to ScholarMind in 48 hours with zero mid-session disruption. Auto-map ${spec.shortName} CSV exports, link sibling guardians, carry forward opening fee arrears, and keep 1-click batch rollback.`,
    heroSubtitle: `${spec.whySchoolsSwitch} Move mid-year or between academic sessions in 48 hours — with atomic dry-run validation and 1-click batch undo.`,
    readingMinutes: 5,
    updatedIso: '2026-11-12',
    keyMetrics: [
        { value: '48 hrs', label: 'Guided campus cutover' },
        { value: '2,000', label: 'Students validated per batch' },
        { value: 'AES-256', label: 'Guardian PII encrypted on import' },
        { value: '1-Click', label: 'Safe atomic batch rollback' },
    ],
    executiveSummary: [
        `Switching school ERPs used to require 3 months of vendor implementation consultants and risky mid-year data re-entry. ScholarMind’s self-serve migration wizard (/settings/import) includes a dedicated ${spec.vendor} column preset plus an AI-assisted schema mapper for custom spreadsheet columns.`,
        spec.exportQuirks,
        `Before a single database row is written, ScholarMind executes a full dry-run simulation: flagging duplicate admission numbers, auto-grouping siblings who share a parent WhatsApp number into one unified guardian login, normalizing DD/MM/YYYY dates, and staging exact opening fee arrears invoices.`,
    ],
    checklistTitle: `4-Step ${spec.shortName} Cutover Protocol`,
    checklistItems: [
        {
            step: `1. Export Active Student & Arrears CSV from ${spec.shortName}`,
            detail: `Download your student master and pending fee balance sheet (detected headers: ${spec.sampleHeaders}).`,
        },
        {
            step: '2. Run AI-Assisted Column Mapping & Anomaly Check',
            detail: 'Select the preset or click AI Auto-Map in /settings/import — PII digits are masked automatically while columns and date formats are aligned.',
        },
        {
            step: '3. Verify Dry-Run Summary & Sibling Links',
            detail: 'Inspect ready rows, auto-created grades/sections, sibling phone groupings, and exact opening ₹ receivable totals with zero DB mutation.',
        },
        {
            step: '4. Commit Atomically (with 1-Click Rollback Safety)',
            detail: 'Import students, AES-256 encrypted guardians, and opening fee invoices in one transaction — reversible in 1 click prior to payment collection.',
        },
    ],
    comparisonRows: [
        {
            dimension: 'Onboarding Timeline',
            legacyApproach: '6–12 weeks of paid vendor setup and manual Excel cleanup',
            scholarMindStandard: 'Self-serve 48-hour cutover at ₹0 onboarding fee on Core & AI Pro',
        },
        {
            dimension: 'Sibling Guardian Accounts',
            legacyApproach: 'Duplicate parent accounts created per child mobile row',
            scholarMindStandard: 'Automatic phone de-duplication linking siblings under one parent portal',
        },
        {
            dimension: 'Cutover Safety Net',
            legacyApproach: 'Irreversible partial SQL imports requiring vendor support tickets',
            scholarMindStandard: 'Dry-run preview + atomic commit + 1-click batch rollback',
        },
    ],
    faqs: [
        {
            question: `Can we migrate from ${spec.vendor} mid-academic-year without losing pending fee balances?`,
            answer: `Yes. Map your ${spec.shortName} arrears column to Opening Fee Balance during import; ScholarMind automatically generates reconciled opening invoices per student ready for UPI collection and Tally Prime sync.`,
        },
        {
            question: `What happens if our ${spec.shortName} spreadsheet has custom or renamed column headers?`,
            answer: 'ScholarMind combines deterministic alias matching with an AI-assisted header mapper in /settings/import that inspects masked column samples and maps custom headers in seconds.',
        },
        {
            question: 'What if we spot a mistake in our spreadsheet after clicking Commit?',
            answer: 'Every migration batch is stamped with an immutable Batch ID in /settings/import and can be rolled back cleanly in one click before live fee payments are recorded against those invoices.',
        },
    ],
}));

interface CityHubSpec {
    slug: string;
    city: string;
    corridors: string;
    boards: string;
    localContext: string;
}

const CITY_SPECS: CityHubSpec[] = [
    {
        slug: 'cbse-icse-school-erp-delhi-ncr',
        city: 'Delhi NCR',
        corridors: 'New Delhi, Gurugram, Noida, Greater Noida, Faridabad & Ghaziabad',
        boards: 'CBSE, ICSE & IB',
        localContext:
            'Delhi NCR Educational Societies and multi-wing K-12 campuses face intense DoE fee-transparency scrutiny, complex transport route slabs across NCR sectors, and high parent expectations for instant UPI & WhatsApp fee workflows.',
    },
    {
        slug: 'cbse-icse-school-erp-pune',
        city: 'Pune',
        corridors: 'Kothrud, Baner, Wakad, Hinjawadi, Hadapsar, Viman Nagar & Pimpri-Chinchwad',
        boards: 'CBSE, ICSE, SSC & IGCSE',
        localContext:
            'Pune’s fast-expanding Educational Trusts and IT-corridor K-12 schools manage rapid admissions growth, multi-branch society audits under the Maharashtra Public Trusts Act, and high digital parent adoption.',
    },
    {
        slug: 'cbse-icse-school-erp-bengaluru',
        city: 'Bengaluru',
        corridors: 'Whitefield, Sarjapur Road, Bellandur, Hebbal, Yelahanka, Jayanagar & Electronic City',
        boards: 'CBSE, ICSE, IGCSE & IB',
        localContext:
            'Bengaluru school groups serve tech-savvy parents who expect zero-friction mobile UPI links, strict DPDP Act 2023 child-data security, and tamper-evident digital credentials.',
    },
    {
        slug: 'cbse-icse-school-erp-hyderabad',
        city: 'Hyderabad',
        corridors: 'Gachibowli, Kondapur, Kokapet, Kompally, Miyapur, Secunderabad & Banjara Hills',
        boards: 'CBSE, ICSE, IB & State Board',
        localContext:
            'Hyderabad’s multi-campus K-12 networks operate large student fleets and multi-branch admissions funnels that benefit directly from /executive cross-campus fee velocity and Razorpay Route split settlements.',
    },
    {
        slug: 'cbse-icse-school-erp-mumbai',
        city: 'Mumbai & MMR',
        corridors: 'South Mumbai, Bandra, Andheri, Powai, Borivali, Thane & Navi Mumbai',
        boards: 'ICSE, CBSE, IGCSE, IB & SSC',
        localContext:
            'Established Mumbai charitable trusts and high-density urban campuses require airtight 4-eyes maker-checker waiver governance, Tally Prime XML voucher exports, and QR-verified gate dismissal safety.',
    },
    {
        slug: 'cbse-icse-school-erp-chennai',
        city: 'Chennai',
        corridors: 'Anna Nagar, Adyar, Velachery, OMR, Tambaram & Porur',
        boards: 'CBSE, ICSE & Matriculation',
        localContext:
            'Chennai’s respected K-12 trusts prioritize disciplined term-fee reconciliation, high academic rigor across exam gradebooks, and clean statutory accounting trails.',
    },
    {
        slug: 'cbse-icse-school-erp-jaipur',
        city: 'Jaipur',
        corridors: 'Mansarovar, Vaishali Nagar, Jagatpura, Malviya Nagar & Ajmer Road',
        boards: 'CBSE, ICSE & RBSE',
        localContext:
            'Jaipur’s growing senior secondary campuses and multi-school societies use ScholarMind to replace fragmented desktop fee software with cloud UPI reconciliation and 48-hour CSV onboarding.',
    },
    {
        slug: 'cbse-icse-school-erp-lucknow',
        city: 'Lucknow',
        corridors: 'Gomti Nagar, Shaheed Path, Hazratganj, Aliganj & Indira Nagar',
        boards: 'CBSE & ICSE / ISC',
        localContext:
            'Lucknow hosts some of India’s largest multi-branch ICSE and CBSE campus networks, where centralized /executive treasury oversight and 4-eyes counter concession locks prevent revenue leakage.',
    },
    {
        slug: 'cbse-icse-school-erp-ahmedabad',
        city: 'Ahmedabad & Gandhinagar',
        corridors: 'SG Highway, Bopal, Satellite, Prahlad Nagar, Nikol & GIFT/Gandhinagar',
        boards: 'CBSE, ICSE & GSEB',
        localContext:
            'Trustee-led institutions across Ahmedabad and Gandhinagar rely on Tally Prime for statutory trust accounting — making ScholarMind’s 1-click Tally XML sync and maker-checker controls an immediate fit.',
    },
    {
        slug: 'cbse-icse-school-erp-kolkata',
        city: 'Kolkata',
        corridors: 'Salt Lake, New Town, Ballygunge, Alipore, Behala & Howrah',
        boards: 'ICSE, ISC & CBSE',
        localContext:
            'Heritage ICSE and CBSE institutions in Kolkata modernize fee counters, NEP-aligned report cards, and parent communication without risking decades of clean institutional records.',
    },
    {
        slug: 'cbse-icse-school-erp-chandigarh',
        city: 'Chandigarh Tricity',
        corridors: 'Chandigarh Sectors, Mohali, Panchkula & Zirakpur',
        boards: 'CBSE & ICSE',
        localContext:
            'Tricity K-12 schools combine high academic standards with multi-route transport operations, benefiting from automated sibling billing, WhatsApp UPI reminders, and QR-verifiable CBSE report cards.',
    },
    {
        slug: 'cbse-icse-school-erp-kochi',
        city: 'Kochi',
        corridors: 'Kakkanad, Edappally, Panampilly Nagar, Aluva & Tripunithura',
        boards: 'CBSE, ICSE & Kerala State',
        localContext:
            'Kochi’s progressive CBSE and ICSE Trusts adopt ScholarMind for transparent SaaS pricing, encrypted guardian records under DPDP Act 2023, and zero-clerk online admissions.',
    },
];

const REGIONAL_GUIDES: SeoGuide[] = CITY_SPECS.map((city) => ({
    slug: city.slug,
    category: 'REGIONAL_HUB',
    categoryLabel: 'Regional Campus Hub',
    badge: `${city.city} · ${city.boards}`,
    title: `Best ${city.boards} School ERP & Fee Governance Platform in ${city.city}`,
    metaDescription: `Cloud institutional ERP for ${city.boards} schools and Educational Trusts across ${city.city} (${city.corridors}): Razorpay UPI & WhatsApp fee links, Tally Prime XML sync, DPDP Section 9 child-data encryption, and 48-hour ERP migration.`,
    heroSubtitle: `Purpose-built for Principals, Trustees, and Finance Officers across ${city.corridors}. Launch a pre-seeded CBSE sandbox in 1 click or migrate your campus in 48 hours.`,
    readingMinutes: 5,
    updatedIso: '2026-11-12',
    keyMetrics: [
        { value: '₹18–₹28', label: 'Transparent per-student monthly pricing' },
        { value: '48 hrs', label: 'Remote CSV cutover from legacy ERPs' },
        { value: 'Tally XML', label: ' Statutory Trust accounting sync' },
        { value: 'DPDP §9', label: 'Encrypted child & guardian PII' },
    ],
    executiveSummary: [
        city.localContext,
        `With ScholarMind, ${city.city} schools unify admissions (/apply-online), CBSE/ICSE attendance & holistic report cards, Razorpay UPI + signed WhatsApp fee links, 4-eyes concession approvals, and Tally Prime XML exports inside a single PostgreSQL RLS-isolated workspace.`,
        `Because onboarding is 100% self-serve — from the 1-click public CBSE sandbox (/demo) to 60-second workspace provisioning (/setup) and guided CSV import (/settings/import) — campuses in ${city.city} go live in 48 hours without waiting for local reseller visits.`,
    ],
    checklistTitle: `How ${city.city} Schools Evaluate & Go Live in One Weekend`,
    checklistItems: [
        {
            step: '1. Explore the Pre-Seeded CBSE Demo Campus (/demo)',
            detail: 'Inspect live fee ageing, Tally XML exports, admissions scoring, and multi-campus /executive dashboards with zero sign-up.',
        },
        {
            step: '2. Run Free Fee-Leakage & DPDP Readiness Diagnostics',
            detail: 'Quantify locked working capital and benchmark DPDP Act 2023 Section 9 compliance for your Board of Trustees.',
        },
        {
            step: '3. Provision Your Isolated School Workspace (/setup)',
            detail: `Create your ${city.city} campus tenant in 60 seconds with PostgreSQL Row-Level Security and TOTP MFA.`,
        },
        {
            step: '4. Import Legacy Student & Arrears CSV (/settings/import)',
            detail: 'Migrate from Entab, Fedena, MCB, Edunext, or Tally/Excel sheets with dry-run verification and 1-click batch rollback.',
        },
    ],
    comparisonRows: [
        {
            dimension: 'Deployment Speed in ' + city.city,
            legacyApproach: 'Weeks of waiting for local vendor field engineers',
            scholarMindStandard: '60-second cloud workspace + 48-hour guided CSV migration',
        },
        {
            dimension: 'Fee Collection & Tally Sync',
            legacyApproach: 'Cash/cheque queues + manual Tally voucher entry',
            scholarMindStandard: 'Signed WhatsApp UPI links + 1-click Tally Prime XML export',
        },
        {
            dimension: 'Data Security & Compliance',
            legacyApproach: 'Shared plaintext databases without MFA',
            scholarMindStandard: 'DPDP Section 9 AES-256 PII encryption + 146 RLS tables',
        },
    ],
    faqs: [
        {
            question: `How much does ScholarMind cost for a ${city.boards} school in ${city.city}?`,
            answer: 'Core SIS & Fee Governance is ₹18 per active student/month (billed annually) and Governed AI Pro is ₹28 per active student/month, with custom multi-campus pilots for Educational Trusts operating 3+ branches.',
        },
        {
            question: `Can multi-branch school groups in ${city.city} manage all campuses from one Trust login?`,
            answer: 'Yes. Each branch receives strict database-level tenant isolation while Trust Trustees and Group CFOs monitor consolidated billing, collections, arrears ageing, and attendance in /executive.',
        },
        {
            question: `Can we migrate our existing ERP data over a weekend in ${city.city}?`,
            answer: 'Yes. Upload your current student and fee-arrears CSV into /settings/import, review the dry-run validation report, and commit atomically with 1-click rollback protection.',
        },
    ],
}));

export const ALL_SEO_GUIDES: readonly SeoGuide[] = [
    ...COMPLIANCE_GUIDES,
    ...MIGRATION_GUIDES,
    ...REGIONAL_GUIDES,
];

export function getGuideBySlug(slug: string): SeoGuide | undefined {
    return ALL_SEO_GUIDES.find((g) => g.slug === slug);
}

export function getGuidesByCategory(category: GuideCategory): SeoGuide[] {
    return ALL_SEO_GUIDES.filter((g) => g.category === category);
}
