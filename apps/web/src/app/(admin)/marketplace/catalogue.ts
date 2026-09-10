/**
 * Module catalogue.
 *
 * There is no module/plugin table in the schema — entitlements are a `text[]`
 * on `companies.active_modules`. The catalogue below therefore lists only the
 * module codes this codebase actually recognises, and records honestly what
 * each one does today:
 *
 *  - `gatedRoute` codes are enforced by `apps/web/src/proxy.ts`, which
 *    redirects to /upgrade when the code is missing from the session.
 *  - the rest are recognised by the platform company-settings screen and stored
 *    on the company record, but no route or query reads them yet.
 */

export type ModuleDefinition = {
    code: string;
    title: string;
    description: string;
    /** Route this entitlement unlocks, when one exists. */
    gatedRoute: string | null;
    note?: string;
};

export const GATED_MODULES: ModuleDefinition[] = [
    {
        code: 'MULTI_CAMPUS',
        title: 'Multi-Campus HQ',
        description: 'Group headquarters console for schools that run several campuses.',
        gatedRoute: '/hq',
        note: 'The ENTERPRISE entitlement unlocks the same console.',
    },
    {
        code: 'ENTERPRISE',
        title: 'Enterprise',
        description: 'Enterprise entitlement; also unlocks the group headquarters console.',
        gatedRoute: '/hq',
    },
    {
        code: 'HIGHER_ED',
        title: 'Higher Education Suite',
        description: 'University-style programmes, terms and credit structures.',
        gatedRoute: '/university',
    },
    {
        code: 'COACHING',
        title: 'Coaching Institute',
        description: 'Batch-based coaching packages and enrolment.',
        gatedRoute: '/coaching',
    },
    {
        code: 'INTERNATIONAL',
        title: 'International Operations',
        description: 'Visa tracking and host-family management for overseas students.',
        gatedRoute: '/international',
    },
    {
        code: 'AI_AGENTS',
        title: 'ScholarMind AI Agents',
        description: 'Conversational assistant for staff workflows.',
        gatedRoute: '/chat',
        note: 'Schools on a paid tier already have access without this entitlement.',
    },
];

export const RECORDED_MODULES: ModuleDefinition[] = [
    {
        code: 'FEES',
        title: 'Billing & Fees',
        description: 'Fee plans, invoicing and collections.',
        gatedRoute: null,
    },
    {
        code: 'ATTENDANCE',
        title: 'Attendance',
        description: 'Daily and period attendance capture.',
        gatedRoute: null,
    },
    {
        code: 'COMMUNICATION',
        title: 'Communication',
        description: 'Announcements and messaging to staff, students and guardians.',
        gatedRoute: null,
    },
    {
        code: 'TRANSPORT',
        title: 'Transport',
        description: 'Routes, vehicles and driver assignments.',
        gatedRoute: null,
    },
    {
        code: 'HR',
        title: 'HR & Payroll',
        description: 'Staff records, leave and payroll runs.',
        gatedRoute: null,
    },
];

export const ALL_MODULE_CODES: string[] = [...GATED_MODULES, ...RECORDED_MODULES].map(
    (module) => module.code,
);
