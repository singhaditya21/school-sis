import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const snapshotDirectory = `${repoRoot}/apps/web/drizzle/meta`;
const snapshotFiles = readdirSync(snapshotDirectory)
  .filter((name) => /^\d{4}_snapshot\.json$/.test(name))
  .sort((left, right) => left.localeCompare(right, 'en'));
if (snapshotFiles.length === 0) {
  console.error('No Drizzle schema snapshot was found.');
  process.exit(1);
}
const latestSnapshotFile = snapshotFiles.at(-1);
const snapshot = JSON.parse(readFileSync(`${snapshotDirectory}/${latestSnapshotFile}`, 'utf8'));
const rlsSql = readFileSync(`${repoRoot}/packages/api/src/db/migrations/tenant-rls.sql`, 'utf8');

const specialPolicies = new Map([
  ['companies', 'tenant-parent'],
  ['tenants', 'tenant-root'],
  ['grade_subjects', 'tenant-join'],
  ['fee_components', 'tenant-join'],
  ['stops', 'tenant-join'],
  ['exam_schedules', 'tenant-join'],
  ['field_permissions', 'tenant-join'],
  ['metadata_fields', 'tenant-join'],
  ['metadata_layouts', 'tenant-join'],
  ['metadata_records', 'tenant-join'],
  ['metadata_values', 'tenant-join'],
  ['metadata_objects', 'tenant-with-global-read'],
  ['metadata_schema_versions', 'tenant-with-global-read'],
  ['grading_rubrics', 'tenant-join'],
  ['multi_campus_hierarchy', 'tenant-read-platform-write'],
  ['hq_groups', 'tenant-join'],
  ['group_policies', 'tenant-join'],
  ['platform_broadcasts', 'global-tenant-readable'],
  ['marketing_leads', 'platform-only'],
  ['platform_audit_logs', 'platform-only'],
  ['rate_limit_buckets', 'platform-only'],
]);

const tableEntries = Object.entries(snapshot.tables).map(([qualifiedName, definition]) => [
  qualifiedName.replace(/^public\./, ''),
  definition,
]);

const directTenantTables = tableEntries
  .filter(([name, definition]) => definition.columns.tenant_id && !specialPolicies.has(name))
  .map(([name]) => name);
const uncovered = tableEntries
  .filter(([, definition]) => !definition.columns.tenant_id)
  .map(([name]) => name)
  .filter((name) => !specialPolicies.has(name));

const missingEnableRls = [...specialPolicies.keys()].filter(
  (name) => !rlsSql.includes(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`),
);
const missingForceRls = [...specialPolicies.keys()].filter(
  (name) => !rlsSql.includes(`ALTER TABLE public.${name} FORCE ROW LEVEL SECURITY`),
);
const missingCreatePolicy = [...specialPolicies.keys()].filter(
  (name) => !new RegExp(`CREATE\\s+POLICY\\s+[a-z0-9_]+\\s+ON\\s+public\\.${name}\\b`, 'i').test(rlsSql),
);

const requiredDynamicPatterns = [
  { name: 'tenant_id schema discovery', pattern: /c\.column_name\s*=\s*'tenant_id'/i },
  { name: 'dynamic ENABLE RLS', pattern: /EXECUTE\s+format\(\s*'ALTER TABLE %I\.%I ENABLE ROW LEVEL SECURITY'/i },
  { name: 'dynamic FORCE RLS', pattern: /EXECUTE\s+format\(\s*'ALTER TABLE %I\.%I FORCE ROW LEVEL SECURITY'/i },
  { name: 'dynamic tenant policy', pattern: /EXECUTE\s+format\(\s*'CREATE POLICY tenant_isolation_policy ON %I\.%I/i },
];
const missingDynamicMarkers = requiredDynamicPatterns
  .filter(({ pattern }) => !pattern.test(rlsSql))
  .map(({ name }) => name);

if (
  uncovered.length
  || missingEnableRls.length
  || missingForceRls.length
  || missingCreatePolicy.length
  || missingDynamicMarkers.length
) {
  if (uncovered.length) console.error(`Unclassified schema tables: ${uncovered.join(', ')}`);
  if (missingEnableRls.length) console.error(`Special tables missing ENABLE RLS: ${missingEnableRls.join(', ')}`);
  if (missingForceRls.length) console.error(`Special tables missing FORCE RLS: ${missingForceRls.join(', ')}`);
  if (missingCreatePolicy.length) console.error(`Special tables missing CREATE POLICY: ${missingCreatePolicy.join(', ')}`);
  if (missingDynamicMarkers.length) console.error(`Dynamic tenant RLS markers missing: ${missingDynamicMarkers.join(', ')}`);
  process.exit(1);
}

console.info(
  `RLS policy matrix (${latestSnapshotFile}) covers ${tableEntries.length} schema tables: ` +
  `${directTenantTables.length} direct tenant tables and ${specialPolicies.size} explicit special policies.`,
);
