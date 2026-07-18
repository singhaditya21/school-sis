type EnvIssue = {
    name: string;
    message: string;
};

const BUILD_PHASES = new Set(['build']);

function isBuildPhase() {
    return (
        BUILD_PHASES.has(process.env.npm_lifecycle_event || '') ||
        process.env.NEXT_PHASE === 'phase-production-build'
    );
}

function hasSecret(name: string, minLength = 32) {
    const value = process.env[name];
    return Boolean(value && value.length >= minLength);
}

function requireOneOf(names: string[], minLength = 32): EnvIssue | null {
    if (names.some((name) => hasSecret(name, minLength))) return null;
    return {
        name: names.join(' or '),
        message: `One of ${names.join(', ')} must be set and at least ${minLength} characters.`,
    };
}

function requireSecret(name: string, minLength = 32): EnvIssue | null {
    return hasSecret(name, minLength)
        ? null
        : { name, message: `${name} must be set and at least ${minLength} characters.` };
}

function requireValue(name: string): EnvIssue | null {
    return process.env[name] ? null : { name, message: `${name} must be set.` };
}

function validateDatabaseUrlShape() {
    // Local-first: no cloud SSL is enforced. Just validate the URL shape.
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return;

    let parsed: URL;
    try {
        parsed = new URL(databaseUrl);
    } catch {
        throw new Error('DATABASE_URL must be a valid Postgres URL.');
    }

    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
        throw new Error('DATABASE_URL must use postgres:// or postgresql://.');
    }
}

export function validateSecurityEnvironment() {
    if (isBuildPhase()) return;

    const issues = [
        requireValue('DATABASE_URL'),
        requireSecret('SESSION_SECRET'),
        requireOneOf(['PII_ENCRYPTION_KEY', 'ENCRYPTION_KEY']),
    ].filter(Boolean) as EnvIssue[];

    if (issues.length > 0) {
        throw new Error(
            `Security environment validation failed:\n${issues
                .map((issue) => `- ${issue.message}`)
                .join('\n')}`,
        );
    }

    validateDatabaseUrlShape();
}

export function getSecurityFeatureStatus() {
    return {
        copilot: hasSecret('CEREBRAS_API_KEY', 16),
        agentService: hasSecret('AGENT_API_TOKEN') && Boolean(process.env.AGENT_SERVICE_URL || process.env.AGENT_BASE_URL),
        agentWebhook: hasSecret('AGENT_WEBHOOK_SECRET'),
        iotIngest: hasSecret('IOT_INGEST_SECRET') && Boolean(process.env.IOT_SYSTEM_USER_ID),
        metrics: hasSecret('METRICS_TOKEN'),
        stripe: hasSecret('STRIPE_SECRET_KEY', 16),
        razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    };
}
