export type DatabaseSslMode = 'disable' | 'require' | 'verify-full';

export interface DatabaseSslOptions {
    rejectUnauthorized: boolean;
}

export interface DatabaseConnectionOptions {
    connectionString: string;
    ssl: DatabaseSslOptions | undefined;
}

export interface DatabaseCredentials {
    host: string;
    port: number;
    user?: string;
    password?: string;
    database: string;
    ssl: DatabaseSslOptions | undefined;
}

const PG_SSL_QUERY_PARAMETERS = new Set([
    'ssl',
    'sslcert',
    'sslkey',
    'sslmode',
    'sslnegotiation',
    'sslpassword',
    'sslrootcert',
    'uselibpqcompat',
]);

function isLocalDatabaseUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        const hostname = parsed.searchParams.get('host') || parsed.hostname;
        return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname.toLowerCase());
    } catch {
        return false;
    }
}

function parseMode(value: string | undefined): DatabaseSslMode | undefined {
    if (!value) return undefined;
    if (value === 'disable' || value === 'require' || value === 'verify-full') return value;
    throw new Error('DATABASE_SSL_MODE must be one of: disable, require, verify-full.');
}

/**
 * Resolve node-postgres TLS settings without silently downgrading certificate
 * validation. Remote databases default to verify-full semantics. `require` is
 * retained only as an explicit, auditable compatibility waiver for providers
 * that cannot yet present a publicly trusted certificate chain.
 */
export function resolveDatabaseSsl(
    connectionString: string,
    configuredMode = process.env.DATABASE_SSL_MODE,
): DatabaseSslOptions | undefined {
    const local = isLocalDatabaseUrl(connectionString);
    const mode = parseMode(configuredMode) ?? (local ? 'disable' : 'verify-full');

    if (!local && mode === 'disable') {
        throw new Error('DATABASE_SSL_MODE=disable is allowed only for a local database.');
    }

    if (mode === 'disable') return undefined;
    return { rejectUnauthorized: mode === 'verify-full' };
}

/**
 * node-postgres parses connection-string values after top-level Pool options,
 * so embedded SSL parameters can otherwise replace the reviewed `ssl` object.
 * Strip every pg SSL query parameter while retaining unrelated connection
 * parameters, making DATABASE_SSL_MODE the sole TLS policy input.
 */
export function resolveDatabaseConnectionOptions(
    connectionString: string,
    configuredMode = process.env.DATABASE_SSL_MODE,
): DatabaseConnectionOptions {
    let parsed: URL;
    try {
        parsed = new URL(connectionString);
    } catch {
        // Never let the TypeError escape. Node attaches the offending string —
        // password and all — to `err.input`, so console.error(err),
        // util.inspect(err), JSON.stringify(err) and Node's own uncaught-exception
        // banner each print the full credential verbatim.
        //
        // This stayed invisible because GitHub Actions masks registered secrets:
        // a release log showed `input: '[SENSITIVE]'`. A Vercel runtime log does
        // no masking, and this function is on the runtime path, so a malformed
        // DATABASE_URL would have written the live password into it.
        //
        // `err.message` is the constant "Invalid URL" and carries nothing from the
        // input, but re-raising the error object at all keeps `input` attached —
        // hence a fresh Error rather than a rethrow.
        throw new Error('The database connection string is not a valid URL.');
    }
    for (const key of [...parsed.searchParams.keys()]) {
        if (PG_SSL_QUERY_PARAMETERS.has(key.toLowerCase())) {
            parsed.searchParams.delete(key);
        }
    }

    return {
        connectionString: parsed.toString(),
        ssl: resolveDatabaseSsl(connectionString, configuredMode),
    };
}

/**
 * Resolve the host-form credentials required by tools such as Drizzle Kit.
 * Keeping this conversion beside the runtime Pool resolver prevents migration
 * commands from silently using a weaker TLS policy than the application.
 */
export function resolveDatabaseCredentials(
    connectionString: string,
    configuredMode = process.env.DATABASE_SSL_MODE,
): DatabaseCredentials {
    const resolved = resolveDatabaseConnectionOptions(connectionString, configuredMode);
    const parsed = new URL(resolved.connectionString);
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    const host = decodeURIComponent(parsed.searchParams.get('host') || parsed.hostname);
    const port = parsed.port ? Number(parsed.port) : 5432;

    if (!host || !database || !Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error('DATABASE_URL must include a valid host, port, and database name.');
    }

    return {
        host,
        port,
        user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        database,
        ssl: resolved.ssl,
    };
}
