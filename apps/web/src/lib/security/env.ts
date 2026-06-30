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

    const databaseUrl = process.env.DATABASE_URL || '';
    if (
        process.env.NODE_ENV === 'production' &&
        databaseUrl &&
        !databaseUrl.includes('sslmode=require') &&
        !databaseUrl.includes('sslmode=verify-full') &&
        !databaseUrl.includes('localhost')
    ) {
        console.warn('[security/env] DATABASE_URL should include sslmode=require or sslmode=verify-full in production.');
    }
}

export function getSecurityFeatureStatus() {
    return {
        copilot: hasSecret('CEREBRAS_API_KEY', 16),
        agentWebhook: hasSecret('AGENT_WEBHOOK_SECRET'),
        iotIngest: hasSecret('IOT_INGEST_SECRET') && Boolean(process.env.IOT_SYSTEM_USER_ID),
        metrics: hasSecret('METRICS_TOKEN'),
        stripe: hasSecret('STRIPE_SECRET_KEY', 16),
        razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    };
}
