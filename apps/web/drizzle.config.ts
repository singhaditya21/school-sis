import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { resolveDatabaseCredentials } from '../../packages/api/src/db/ssl';

const configuredConnectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const commandNeedsDatabase = process.argv.some((argument) =>
    ['migrate', 'push', 'pull', 'studio', 'introspect'].includes(argument),
);
if (!configuredConnectionString && commandNeedsDatabase) {
    throw new Error('DATABASE_URL or DIRECT_URL is required for Drizzle tooling.');
}
// `drizzle-kit check` and schema generation are offline operations, but the
// config type still requires credentials. This local-only placeholder is never
// contacted by those commands.
const connectionString = configuredConnectionString
    || 'postgresql://config-only@localhost:5432/school_sis_config_only';

export default defineConfig({
    schema: '../../packages/api/src/db/schema/index.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: resolveDatabaseCredentials(connectionString),
    verbose: true,
    strict: true,
});
