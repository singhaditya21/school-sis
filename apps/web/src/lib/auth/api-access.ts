export type ApiAccessBoundary =
    | 'public'
    | 'public-rate-limited'
    | 'session'
    | 'role'
    | 'permission'
    | 'service-bearer'
    | 'provider-webhook'
    | 'integration'
    | 'mock'
    | 'production-disabled'
    | 'mixed';

export type ApiAccessPolicy = {
    prefix: string;
    boundary: ApiAccessBoundary;
    description: string;
    expectedGuardSnippets?: readonly string[];
};

export const API_ACCESS_POLICIES = [
    { prefix: '/api/health', boundary: 'public', description: 'Public health probe.' },
    {
        prefix: '/api/leads',
        boundary: 'public-rate-limited',
        description: 'Public lead capture with IP and email throttling.',
        expectedGuardSnippets: ['consumeRateLimit'],
    },
    {
        prefix: '/api/auth/token',
        boundary: 'session',
        description: 'Session context endpoint.',
        expectedGuardSnippets: ['getSession'],
    },
    {
        prefix: '/api/logout',
        boundary: 'session',
        description: 'Session logout endpoint.',
        expectedGuardSnippets: ['logoutAction'],
    },
    {
        prefix: '/api/agent-webhook',
        boundary: 'service-bearer',
        description: 'Agent incident webhook.',
        expectedGuardSnippets: ['requireBearerServiceAuth'],
    },
    {
        prefix: '/api/agents',
        boundary: 'permission',
        description: 'AI agent APIs require role or approval permissions.',
        expectedGuardSnippets: ['requireApi'],
    },
    {
        prefix: '/api/analytics',
        boundary: 'session',
        description: 'Tenant analytics APIs perform downstream authorization.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/attendance',
        boundary: 'permission',
        description: 'Attendance mutation API.',
        expectedGuardSnippets: ['requireApiPermission'],
    },
    {
        prefix: '/api/audit-trail',
        boundary: 'permission',
        description: 'Audit trail read API.',
        expectedGuardSnippets: ['requireApiPermission'],
    },
    {
        prefix: '/api/chat',
        boundary: 'role',
        description: 'AI chat proxy.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/checkout',
        boundary: 'role',
        description: 'Tenant admin checkout session creation.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/copilot',
        boundary: 'role',
        description: 'Copilot API.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/csv',
        boundary: 'permission',
        description: 'CSV import/export APIs.',
        expectedGuardSnippets: ['requireApiPermission'],
    },
    {
        prefix: '/api/data',
        boundary: 'permission',
        description: 'Dynamic metadata data API.',
        expectedGuardSnippets: ['requireApiPermission'],
    },
    {
        prefix: '/api/exams',
        boundary: 'permission',
        description: 'Exam APIs.',
        expectedGuardSnippets: ['requireApiPermission'],
    },
    {
        prefix: '/api/exports',
        boundary: 'permission',
        description: 'Regulatory export APIs.',
        expectedGuardSnippets: ['requireApiPermission'],
    },
    {
        prefix: '/api/fee-plans',
        boundary: 'permission',
        description: 'Fee plan mutation API.',
        expectedGuardSnippets: ['requireApiPermission'],
    },
    {
        prefix: '/api/files',
        boundary: 'session',
        description: 'Tenant-scoped signed file access.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/finance',
        boundary: 'permission',
        description: 'Controlled finance mutations.',
        expectedGuardSnippets: ['requireApiPermission'],
    },
    {
        prefix: '/api/identity',
        boundary: 'permission',
        description: 'Identity mutations.',
        expectedGuardSnippets: ['requireApiPermission'],
    },
    {
        prefix: '/api/integrations/tally',
        boundary: 'integration',
        description: 'Tally integration endpoint.',
        expectedGuardSnippets: ['authenticateIntegrationRequest'],
    },
    {
        prefix: '/api/integrations/webhooks',
        boundary: 'integration',
        description: 'Webhook integration endpoint.',
        expectedGuardSnippets: ['authenticateIntegrationRequest'],
    },
    {
        prefix: '/api/integrations',
        boundary: 'role',
        description: 'Tenant admin integration management APIs.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/iot',
        boundary: 'service-bearer',
        description: 'IoT ingest API.',
        expectedGuardSnippets: ['requireBearerServiceAuth'],
    },
    {
        prefix: '/api/jobs/dispatch',
        boundary: 'service-bearer',
        description: 'Job dispatcher cron/manual endpoint.',
        expectedGuardSnippets: ['requireBearerServiceAuth'],
    },
    {
        prefix: '/api/jobs',
        boundary: 'role',
        description: 'Tenant admin job inspection API.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/lti',
        boundary: 'integration',
        description: 'LTI integration endpoint.',
        expectedGuardSnippets: ['authenticateIntegrationRequest'],
    },
    {
        prefix: '/api/metrics',
        boundary: 'service-bearer',
        description: 'Metrics scrape endpoint.',
        expectedGuardSnippets: ['requireBearerServiceAuth'],
    },
    {
        prefix: '/api/mock',
        boundary: 'mock',
        description: 'Mock data endpoint, disabled by default in production.',
        expectedGuardSnippets: ['ENABLE_MOCK_API', 'requireBearerServiceAuth'],
    },
    {
        prefix: '/api/notifications',
        boundary: 'session',
        description: 'Notification stream APIs.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/oneroster',
        boundary: 'integration',
        description: 'OneRoster integration API.',
        expectedGuardSnippets: ['handleOneRosterGet'],
    },
    {
        prefix: '/api/operator',
        boundary: 'role',
        description: 'Operator console API.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/parent',
        boundary: 'role',
        description: 'Parent-only APIs.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/payments/webhook',
        boundary: 'provider-webhook',
        description: 'Payment provider webhook endpoint.',
        expectedGuardSnippets: ['signature'],
    },
    {
        prefix: '/api/payments',
        boundary: 'permission',
        description: 'Payment APIs.',
        expectedGuardSnippets: ['requireApi'],
    },
    {
        prefix: '/api/ready',
        boundary: 'service-bearer',
        description: 'Readiness probe.',
        expectedGuardSnippets: ['requireBearerServiceAuth'],
    },
    {
        prefix: '/api/receipts',
        boundary: 'session',
        description: 'Receipt document access.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/report-cards',
        boundary: 'session',
        description: 'Report card document access.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/scim',
        boundary: 'integration',
        description: 'SCIM integration API.',
        expectedGuardSnippets: ['authenticateScimRequest'],
    },
    {
        prefix: '/api/sre/incidents/[incidentId]',
        boundary: 'role',
        description: 'Platform-only incident mutation endpoint.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/sre/incidents',
        boundary: 'mixed',
        description: 'SRE incidents use tenant admin reads and service-token writes.',
        expectedGuardSnippets: ['requireApiAuth', 'requireBearerServiceAuth'],
    },
    {
        prefix: '/api/sre/status',
        boundary: 'service-bearer',
        description: 'SRE status endpoint.',
        expectedGuardSnippets: ['requireBearerServiceAuth'],
    },
    {
        prefix: '/api/students',
        boundary: 'permission',
        description: 'Student APIs.',
        expectedGuardSnippets: ['requireApiPermission'],
    },
    {
        prefix: '/api/upload',
        boundary: 'session',
        description: 'Tenant-scoped upload API.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
    {
        prefix: '/api/v1/integrations/status',
        boundary: 'integration',
        description: 'Versioned integration status API.',
        expectedGuardSnippets: ['authenticateIntegrationRequest'],
    },
    {
        prefix: '/api/v1/integrations/tally',
        boundary: 'integration',
        description: 'Versioned Tally integration alias.',
        expectedGuardSnippets: ["@/app/api/integrations/tally/vouchers/route"],
    },
    {
        prefix: '/api/v1/lti',
        boundary: 'integration',
        description: 'Versioned LTI integration alias.',
        expectedGuardSnippets: ["@/app/api/lti/launch/route"],
    },
    {
        prefix: '/api/v1/oneroster',
        boundary: 'integration',
        description: 'Versioned OneRoster integration API.',
        expectedGuardSnippets: ['handleOneRosterGet'],
    },
    {
        prefix: '/api/webhooks/stripe',
        boundary: 'provider-webhook',
        description: 'Stripe webhook endpoint.',
        expectedGuardSnippets: ['stripe-signature'],
    },
    {
        prefix: '/api/workflow-approvals',
        boundary: 'session',
        description: 'Workflow approval APIs with downstream authorization.',
        expectedGuardSnippets: ['requireApiAuth'],
    },
] as const satisfies readonly ApiAccessPolicy[];

export function normalizeApiPath(pathname: string): string {
    const path = pathname.split('?')[0]?.split('#')[0] || '/';
    if (path.length > 1 && path.endsWith('/')) {
        return path.slice(0, -1);
    }
    return path || '/';
}

export function apiPathMatchesPrefix(pathname: string, prefix: string): boolean {
    const normalizedPath = normalizeApiPath(pathname);
    const normalizedPrefix = normalizeApiPath(prefix);
    return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

export function findApiAccessPolicy(pathname: string): ApiAccessPolicy | null {
    const matching = API_ACCESS_POLICIES
        .filter((policy) => apiPathMatchesPrefix(pathname, policy.prefix))
        .sort((left, right) => normalizeApiPath(right.prefix).length - normalizeApiPath(left.prefix).length);

    return matching[0] ?? null;
}
