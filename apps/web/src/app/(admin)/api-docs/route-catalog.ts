/**
 * The HTTP routes this deployment actually serves.
 *
 * Every entry corresponds to a real file under apps/web/src/app/api/**\/route.ts, and the
 * methods and auth mode were read out of those handlers. The companion test in
 * ./__tests__/route-catalog.test.ts fails if a route is added, removed or renamed without
 * updating this file, so the page cannot drift back into describing endpoints that do not
 * exist.
 */

export type ApiAuthMode =
    | 'public'
    | 'session'
    | 'session-permission'
    | 'integration-key'
    | 'service-token'
    | 'webhook-signature';

export interface ApiRouteDoc {
    /** Path as served, with [param] segments exactly as the App Router names them. */
    path: string;
    methods: readonly ('GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE')[];
    group: string;
    summary: string;
    auth: ApiAuthMode;
    /** Permission checked by requireApiPermission, when the handler uses one. */
    permission?: string;
    /** Verified query-string parameters. Absent when the handler reads none. */
    query?: readonly { name: string; required: boolean; description: string }[];
    /** Anything a caller would otherwise discover only at runtime. */
    note?: string;
}

export const API_AUTH_MODES: Record<ApiAuthMode, { label: string; description: string }> = {
    public: {
        label: 'Public',
        description: 'No credential required. These endpoints are rate limited and validate their own input.',
    },
    session: {
        label: 'Signed-in session',
        description:
            'Requires the ScholarMind session cookie (requireApiAuth). This is a first-party browser session, not a bearer token.',
    },
    'session-permission': {
        label: 'Session + permission',
        description:
            'Requires the session cookie and the named RBAC permission (requireApiPermission). Returns 401 without a session and 403 without the permission.',
    },
    'integration-key': {
        label: 'Integration API key',
        description:
            'Requires an integration API key sent as "Authorization: Bearer <key>". Keys are issued from /api/integrations/api-keys and are scoped to one tenant.',
    },
    'service-token': {
        label: 'Service token',
        description:
            'Requires a shared server secret sent as "Authorization: Bearer <token>". These are machine-to-machine endpoints; if the secret is unset the route answers 503.',
    },
    'webhook-signature': {
        label: 'Provider signature',
        description:
            'Called by an external provider. Authenticity comes from the provider signature header, not from a ScholarMind credential.',
    },
};

export const API_ROUTES: readonly ApiRouteDoc[] = [
    // ---- Students & enrolment -------------------------------------------------
    {
        path: '/api/students',
        methods: ['POST'],
        group: 'Students',
        summary: 'Create a student record for the session tenant.',
        auth: 'session-permission',
        permission: 'students:write',
    },
    {
        path: '/api/students/[studentId]/archive',
        methods: ['POST'],
        group: 'Students',
        summary: 'Archive a student.',
        auth: 'session-permission',
        permission: 'students:archive',
    },
    {
        path: '/api/students/[studentId]/transfer',
        methods: ['POST'],
        group: 'Students',
        summary: 'Transfer a student to another section or grade.',
        auth: 'session-permission',
        permission: 'students:update',
    },
    {
        path: '/api/csv',
        methods: ['GET', 'POST'],
        group: 'Students',
        summary: 'GET exports an entity as CSV; POST imports a multipart CSV file for that entity.',
        auth: 'session-permission',
        permission: 'students:write',
        query: [{ name: 'entity', required: true, description: 'Entity to export (GET). POST sends it in the form body alongside "file".' }],
    },
    {
        path: '/api/leads',
        methods: ['POST'],
        group: 'Admissions',
        summary: 'Capture a marketing/admission lead from a public form.',
        auth: 'public',
        note: 'Rate limited per client IP; returns 429 when the limit is exceeded.',
    },

    // ---- Attendance, exams, academics ----------------------------------------
    {
        path: '/api/attendance',
        methods: ['POST'],
        group: 'Attendance',
        summary: 'Record attendance for students.',
        auth: 'session-permission',
        permission: 'attendance:write',
    },
    {
        path: '/api/exams',
        methods: ['POST'],
        group: 'Exams',
        summary: 'Create an exam.',
        auth: 'session-permission',
        permission: 'exams:write',
    },
    {
        path: '/api/exams/[examId]/publish',
        methods: ['POST'],
        group: 'Exams',
        summary: 'Publish exam results.',
        auth: 'session-permission',
        permission: 'exams:publish',
    },
    {
        path: '/api/report-cards/[studentId]/[termId]',
        methods: ['GET'],
        group: 'Exams',
        summary: 'Report card PDF for a student and term.',
        auth: 'session',
        note: 'Generated in-process with jsPDF; no external service required. [termId] accepts a term id (all published exams starting inside it) or a single published exam id — unpublished exams are never included, and 404 is returned when nothing published matches. PDF_SERVICE_URL, if set, is tried first as an override.',
    },

    // ---- Fees, payments, finance ---------------------------------------------
    {
        path: '/api/fee-plans',
        methods: ['POST'],
        group: 'Fees',
        summary: 'Create a fee plan and its components in one call.',
        auth: 'session-permission',
        permission: 'fees:write',
    },
    {
        path: '/api/payments',
        methods: ['POST'],
        group: 'Fees',
        summary: 'Record a payment against an invoice.',
        auth: 'session-permission',
        permission: 'payments:create',
    },
    {
        path: '/api/payments/orders',
        methods: ['POST'],
        group: 'Fees',
        summary: 'Create a payment-provider order for an invoice.',
        auth: 'session',
    },
    {
        path: '/api/payments/verify',
        methods: ['POST'],
        group: 'Fees',
        summary: 'Verify a provider payment signature and settle the invoice.',
        auth: 'session',
    },
    {
        path: '/api/payments/stripe',
        methods: ['POST'],
        group: 'Fees',
        summary: 'Create a Stripe payment intent for an invoice.',
        auth: 'session',
    },
    {
        path: '/api/checkout',
        methods: ['POST'],
        group: 'Fees',
        summary: 'Start a subscription checkout session.',
        auth: 'session',
    },
    {
        path: '/api/receipts/[id]/pdf',
        methods: ['GET'],
        group: 'Fees',
        summary: 'Payment receipt PDF.',
        auth: 'session',
        note: 'Generated in-process with jsPDF; no external service required. Carries the school header, receipt number, student, invoice reference, amount in figures and words, and payment method/reference. A legacy payment id in [id] resolves to the receipt issued against it. PDF_SERVICE_URL, if set, is tried first as an override.',
    },
    {
        path: '/api/finance/invoices/[invoiceId]/cancel',
        methods: ['POST'],
        group: 'Finance',
        summary: 'Cancel an invoice.',
        auth: 'session-permission',
        permission: 'fees:approve',
    },
    {
        path: '/api/finance/invoices/[invoiceId]/waive',
        methods: ['POST'],
        group: 'Finance',
        summary: 'Waive an invoice balance.',
        auth: 'session-permission',
        permission: 'fees:approve',
    },
    {
        path: '/api/finance/payments/[paymentId]/refund',
        methods: ['POST'],
        group: 'Finance',
        summary: 'Refund a payment.',
        auth: 'session-permission',
        permission: 'payments:refund',
    },
    {
        path: '/api/payments/webhook',
        methods: ['POST'],
        group: 'Webhooks',
        summary: 'Razorpay payment webhook.',
        auth: 'webhook-signature',
    },
    {
        path: '/api/webhooks/stripe',
        methods: ['POST'],
        group: 'Webhooks',
        summary: 'Stripe webhook.',
        auth: 'webhook-signature',
    },

    // ---- Reporting & analytics ------------------------------------------------
    {
        path: '/api/analytics/bi',
        methods: ['GET', 'POST'],
        group: 'Reporting',
        summary:
            'GET returns the BI catalog snapshot your role may see. POST validates a query ("validate_query") or an export ("validate_export") against the catalog and its approval policies.',
        auth: 'session',
        query: [
            { name: 'scope', required: false, description: 'TENANT (default) or PLATFORM. PLATFORM is only honoured for PLATFORM_ADMIN.' },
            { name: 'tenantId', required: false, description: 'Target tenant. Only PLATFORM_ADMIN may pass a tenant other than their own.' },
        ],
        note: 'This endpoint governs and validates; it does not return rows. Row execution happens in the Reporting Engine screen.',
    },
    {
        path: '/api/exports/cbse-results',
        methods: ['GET'],
        group: 'Reporting',
        summary: 'CBSE List-of-Candidates results export as CSV.',
        auth: 'session-permission',
        permission: 'reports:export',
        query: [
            { name: 'reason', required: true, description: 'Audit reason. Missing or blank returns 400.' },
            { name: 'examId', required: false, description: 'Limit the export to one exam.' },
            { name: 'approvalRequestId', required: false, description: 'Approval to release against. Without it the first call raises one and returns 202.' },
        ],
        note: 'Gated by the data.export_pii workflow approval policy.',
    },
    {
        path: '/api/exports/udise-plus',
        methods: ['GET'],
        group: 'Reporting',
        summary: 'UDISE+ annual enrolment export as CSV.',
        auth: 'session-permission',
        permission: 'reports:export',
        query: [
            { name: 'reason', required: true, description: 'Audit reason.' },
            { name: 'approvalRequestId', required: false, description: 'Approval to release against.' },
        ],
        note: 'Gated by the data.export_pii workflow approval policy.',
    },
    {
        path: '/api/audit-trail',
        methods: ['GET'],
        group: 'Reporting',
        summary: 'Query the tenant audit log.',
        auth: 'session-permission',
        permission: 'audit:read',
        query: [
            { name: 'days', required: false, description: 'Look-back window; defaults to 7 and is capped at 90.' },
            { name: 'action', required: false, description: 'Filter by audit action.' },
            { name: 'entityType', required: false, description: 'Filter by entity type.' },
        ],
    },

    // ---- Metadata platform ----------------------------------------------------
    {
        path: '/api/data/[object_name]',
        methods: ['GET', 'POST'],
        group: 'Metadata',
        summary: 'Read or create records of a metadata-defined object.',
        auth: 'session-permission',
        permission: 'metadata:read (GET) / metadata:create (POST)',
    },

    // ---- Approvals & agents ---------------------------------------------------
    {
        path: '/api/workflow-approvals',
        methods: ['GET', 'POST'],
        group: 'Approvals',
        summary: 'List the tenant approval queue, or raise a new approval request.',
        auth: 'session',
    },
    {
        path: '/api/workflow-approvals/[approvalId]/review',
        methods: ['POST'],
        group: 'Approvals',
        summary: 'Approve or reject an approval request.',
        auth: 'session',
    },
    {
        path: '/api/agents/approvals',
        methods: ['GET', 'POST'],
        group: 'Agents',
        summary: 'List or raise agent action approvals.',
        auth: 'session-permission',
        permission: 'agents:approve',
    },
    {
        path: '/api/agents/approvals/[approvalId]/review',
        methods: ['POST'],
        group: 'Agents',
        summary: 'Review an agent action approval.',
        auth: 'session-permission',
        permission: 'agents:approve',
    },
    {
        path: '/api/agents/[agent]/query-async',
        methods: ['POST'],
        group: 'Agents',
        summary: 'Queue an asynchronous agent query and return a job id.',
        auth: 'session',
    },
    {
        path: '/api/agents/jobs/[jobId]',
        methods: ['GET'],
        group: 'Agents',
        summary: 'Poll an agent job.',
        auth: 'session',
    },
    {
        path: '/api/chat',
        methods: ['POST'],
        group: 'Agents',
        summary: 'Conversational assistant endpoint.',
        auth: 'session',
    },
    {
        path: '/api/copilot',
        methods: ['POST'],
        group: 'Agents',
        summary: 'In-product copilot endpoint.',
        auth: 'session',
    },
    {
        path: '/api/copilot/assist',
        methods: ['GET', 'POST'],
        group: 'Agents',
        summary:
            'One bounded assistant turn over the AI tool registry. GET returns the tools this role may use, the provider state and the tenant budget; POST answers from tool results only and converts any mutating request into a workflow approval.',
        auth: 'session',
    },
    {
        path: '/api/agent-webhook',
        methods: ['POST'],
        group: 'Agents',
        summary: 'Inbound callback for agent runs executed outside the request cycle.',
        auth: 'service-token',
    },

    // ---- Communications & files ----------------------------------------------
    {
        path: '/api/notifications/stream',
        methods: ['GET'],
        group: 'Communications',
        summary: 'Server-sent event stream of live notifications for the signed-in user.',
        auth: 'session',
        note: 'Consume with EventSource; the response is text/event-stream, not JSON.',
    },
    {
        path: '/api/parent/notifications',
        methods: ['GET'],
        group: 'Parent',
        summary: 'Notifications for the signed-in parent.',
        auth: 'session',
    },
    {
        path: '/api/upload',
        methods: ['POST'],
        group: 'Files',
        summary: 'Upload a file into tenant-scoped storage.',
        auth: 'session',
    },
    {
        path: '/api/files/[...path]',
        methods: ['GET'],
        group: 'Files',
        summary: 'Download a tenant-scoped stored file.',
        auth: 'session',
    },

    // ---- Integration platform -------------------------------------------------
    {
        path: '/api/integrations/api-keys',
        methods: ['GET', 'POST'],
        group: 'Integrations',
        summary: 'List or issue integration API keys for the tenant.',
        auth: 'session',
    },
    {
        path: '/api/integrations/api-keys/[id]',
        methods: ['DELETE'],
        group: 'Integrations',
        summary: 'Revoke an integration API key.',
        auth: 'session',
    },
    {
        path: '/api/integrations/registry',
        methods: ['GET', 'POST'],
        group: 'Integrations',
        summary: 'Read the integration registry or update a connection.',
        auth: 'session',
    },
    {
        path: '/api/integrations/audit',
        methods: ['GET'],
        group: 'Integrations',
        summary: 'Integration call audit log.',
        auth: 'session',
    },
    {
        path: '/api/integrations/webhooks/retry',
        methods: ['POST'],
        group: 'Integrations',
        summary: 'Replay a failed outbound webhook delivery.',
        auth: 'webhook-signature',
    },
    {
        path: '/api/integrations/tally/vouchers',
        methods: ['POST'],
        group: 'Integrations',
        summary: 'Export fee collections as Tally-compatible XML vouchers.',
        auth: 'integration-key',
    },
    {
        path: '/api/v1/integrations/tally/vouchers',
        methods: ['POST'],
        group: 'Integrations',
        summary: 'Versioned alias of /api/integrations/tally/vouchers (same handler).',
        auth: 'integration-key',
    },
    {
        path: '/api/v1/integrations/status',
        methods: ['GET'],
        group: 'Integrations',
        summary: 'Integration connection status for the key holder.',
        auth: 'integration-key',
    },
    {
        path: '/api/oneroster/[entity]',
        methods: ['GET'],
        group: 'Integrations',
        summary: 'OneRoster read endpoint (orgs, users, classes, enrollments).',
        auth: 'integration-key',
    },
    {
        path: '/api/v1/oneroster/[entity]',
        methods: ['GET'],
        group: 'Integrations',
        summary: 'Versioned alias of /api/oneroster/[entity] (same handler).',
        auth: 'integration-key',
    },
    {
        path: '/api/scim/v2/Users',
        methods: ['GET', 'POST'],
        group: 'Integrations',
        summary: 'SCIM 2.0 user provisioning: list and create.',
        auth: 'integration-key',
    },
    {
        path: '/api/scim/v2/Users/[id]',
        methods: ['GET', 'PATCH', 'DELETE'],
        group: 'Integrations',
        summary: 'SCIM 2.0 user provisioning: read, patch and deprovision.',
        auth: 'integration-key',
    },
    {
        path: '/api/lti/login',
        methods: ['GET', 'POST'],
        group: 'Integrations',
        summary: 'LTI 1.3 OIDC login initiation.',
        auth: 'public',
    },
    {
        path: '/api/lti/launch',
        methods: ['POST'],
        group: 'Integrations',
        summary: 'LTI 1.3 resource link launch.',
        auth: 'public',
    },
    {
        path: '/api/v1/lti/launch',
        methods: ['POST'],
        group: 'Integrations',
        summary: 'Versioned alias of /api/lti/launch (same handler).',
        auth: 'public',
    },
    {
        path: '/api/iot/ingest',
        methods: ['POST'],
        group: 'Integrations',
        summary: 'Ingest RFID, biometric and GPS events from field hardware.',
        auth: 'service-token',
    },

    // ---- Identity & settings --------------------------------------------------
    {
        path: '/api/auth/token',
        methods: ['GET'],
        group: 'Identity',
        summary: 'Non-sensitive session context for client-side calls.',
        auth: 'session',
    },
    {
        path: '/api/logout',
        methods: ['POST'],
        group: 'Identity',
        summary: 'Destroy the session cookie.',
        auth: 'session',
    },
    {
        path: '/api/identity/users/[userId]/role-change',
        methods: ['POST'],
        group: 'Identity',
        summary: 'Change a user role (approval-gated).',
        auth: 'session-permission',
        permission: 'settings:write',
    },

    // ---- Operations -----------------------------------------------------------
    {
        path: '/api/operator/console',
        methods: ['GET'],
        group: 'Operations',
        summary: 'Operator console counters across queues, notifications, approvals and incidents.',
        auth: 'session',
    },
    {
        path: '/api/jobs/dispatch',
        methods: ['GET', 'POST'],
        group: 'Operations',
        summary: 'Background worker dispatch tick.',
        auth: 'service-token',
    },
    {
        path: '/api/jobs/[jobId]',
        methods: ['GET'],
        group: 'Operations',
        summary: 'Inspect one background job and its notifications.',
        auth: 'session',
    },
    {
        path: '/api/sre/incidents',
        methods: ['GET', 'POST'],
        group: 'Operations',
        summary: 'List incidents, or open one from an alerting pipeline.',
        auth: 'session',
        note: 'GET uses the session; POST also accepts the SRE service token.',
    },
    {
        path: '/api/sre/incidents/[incidentId]',
        methods: ['PATCH'],
        group: 'Operations',
        summary: 'Acknowledge or resolve an incident.',
        auth: 'session',
    },
    {
        path: '/api/sre/status',
        methods: ['GET'],
        group: 'Operations',
        summary: 'SRE status snapshot.',
        auth: 'service-token',
    },
    {
        path: '/api/health',
        methods: ['GET'],
        group: 'Operations',
        summary: 'Liveness probe.',
        auth: 'public',
    },
    {
        path: '/api/ready',
        methods: ['GET'],
        group: 'Operations',
        summary: 'Readiness probe, including database reachability.',
        auth: 'public',
    },
    {
        path: '/api/metrics',
        methods: ['GET'],
        group: 'Operations',
        summary: 'Prometheus exposition format metrics.',
        auth: 'service-token',
    },
    {
        path: '/api/security/csp-report',
        methods: ['POST'],
        group: 'Operations',
        summary: 'Content-Security-Policy violation report sink.',
        auth: 'public',
    },
];

export const API_GROUPS: readonly string[] = Array.from(
    new Set(API_ROUTES.map((route) => route.group)),
);
