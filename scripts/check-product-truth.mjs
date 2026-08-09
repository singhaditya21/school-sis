import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const baselinePath = path.join(root, 'scripts', 'product-truth-baseline.json');
const snapshotMode = process.argv.includes('--snapshot');

const sourceRoots = [
  'apps/web/src/app',
  'apps/web/src/components',
  'apps/web/src/actions',
  'apps/web/src/lib/actions',
  'apps/web/src/lib/services',
  'apps/website/src/app',
  'apps/website/src/components',
  'apps/mobile',
];

const ignoredSegments = new Set([
  '__tests__',
  '__fixtures__',
  'e2e',
  'mocks',
  'node_modules',
  'stories',
]);

const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);

const rules = [
  {
    id: 'local-service-fallback',
    description: 'Production source references a loopback HTTP service.',
    pattern: /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/g,
  },
  {
    id: 'runtime-fixture-language',
    description: 'Production source contains mock/demo/placeholder/fake language that must be retired or gated.',
    // JSX input placeholder attributes are interaction copy, not fabricated
    // product data. Other uses of the word remain reviewable debt.
    pattern: /\b(?:mock(?:ed)?|demo|fabricat(?:e|ed|ion)|fake)\b|\bplaceholder\b(?!\s*=)/gi,
  },
  {
    id: 'fake-delay',
    description: 'A client runtime uses setTimeout; verify it is not simulating persistence or loading.',
    pattern: /setTimeout\s*\(/g,
    applies: (_file, source) => /^\s*['"]use client['"];?/m.test(source),
  },
  {
    id: 'client-random-identity',
    description: 'A client runtime generates random identity-like data.',
    pattern: /(?:Math\.random\s*\(|randomUUID\s*\()/g,
    applies: (_file, source) => /^\s*['"]use client['"];?/m.test(source),
  },
  {
    id: 'inert-control',
    description: 'An obviously inert click handler or hash-only control is present.',
    pattern: /(?:onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}|href\s*=\s*['"]#['"])/g,
  },
  {
    id: 'unsupported-success-claim',
    description: 'A known fabricated success/compliance claim is present.',
    pattern: /(?:System Compliant|Mock save|simulate(?:d)? success|Live Analysis)/gi,
  },
  {
    id: 'raw-form-control',
    description: 'A raw form control bypasses shared UI primitives.',
    pattern: /<(?:button|input|select|textarea)\b/g,
  },
  {
    id: 'direct-palette-utility',
    description: 'A direct Tailwind palette utility bypasses semantic design tokens.',
    pattern: /\b(?:bg|text|border|ring|fill|stroke|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
  },
  {
    id: 'hard-coded-color',
    description: 'A hard-coded hexadecimal color bypasses semantic design tokens.',
    pattern: /#[0-9a-fA-F]{3,8}\b/g,
  },
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ignoredSegments.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (sourceExtensions.has(path.extname(entry.name)) && !/\.(?:test|spec|stories)\.[^.]+$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

function countMatches(source, pattern) {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(source)) count += 1;
  pattern.lastIndex = 0;
  return count;
}

function collectSnapshot() {
  const snapshot = {};
  const files = [...new Set(sourceRoots.flatMap((sourceRoot) => walk(path.join(root, sourceRoot))))].sort();
  for (const absolute of files) {
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    const source = fs.readFileSync(absolute, 'utf8');
    for (const rule of rules) {
      if (rule.applies && !rule.applies(relative, source)) continue;
      const count = countMatches(source, rule.pattern);
      if (count > 0) snapshot[`${rule.id}:${relative}`] = count;
    }
  }

  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  const invariantChecks = [
    {
      id: 'mobile-default-gate',
      file: 'apps/mobile/App.tsx',
      valid: (source) => source.includes('__DEV__')
        && source.includes('EXPO_PUBLIC_MOBILE_INTERNAL_PREVIEW')
        && source.includes('<UnavailableState'),
    },
    {
      id: 'mobile-no-loopback-fallback',
      file: 'apps/mobile/config.ts',
      valid: (source) => !/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)/.test(source),
    },
    {
      id: 'onboarding-company-boundary',
      file: 'apps/web/src/lib/actions/onboarding.ts',
      valid: (source) => source.includes('INSERT INTO companies')
        && /INSERT INTO tenants\s*\([\s\S]*?company_id[\s\S]*?\) VALUES/.test(source)
        && !/INSERT INTO tenants\s*\([\s\S]*?billing_status[\s\S]*?\) VALUES/.test(source),
    },
    {
      id: 'public-admissions-no-fake-success',
      file: 'apps/website/src/app/(public)/apply-online/apply/page.tsx',
      valid: (source) => source.includes("redirect('/apply-online')")
        && !/(?:Math\.random|setTimeout|applicationId)/.test(source),
    },
    {
      id: 'treasury-no-known-fixtures',
      file: 'apps/web/src/app/(admin)/treasury/page.tsx',
      valid: (source) => !/(?:txn_74h284jf|txn_p398d2jk|Challenge Settlement|Interchange rate)/.test(source),
    },
    {
      id: 'marketing-no-unsupported-claims',
      file: 'apps/website/src/app/(public)/page.tsx',
      valid: (source) => !/(?:99\.99%|SOC-?2|26\s+(?:AI\s+)?agents?|<\s*50\s*ms|dedicated AWS enclaves?)/i.test(source),
    },
    {
      id: 'marketing-no-public-list-pricing',
      file: 'apps/website/src/app/(public)/pricing/page.tsx',
      valid: (source) => !/(?:\$10|\$18|\$30|per student\s*\/\s*month)/i.test(source),
    },
    {
      id: 'shared-design-tokens-loaded',
      file: 'apps/web/src/app/layout.tsx',
      valid: (source) => source.includes('@school-sis/design-tokens/tokens.css'),
    },
    {
      id: 'shared-design-tokens-loaded',
      file: 'apps/website/src/app/layout.tsx',
      valid: (source) => source.includes('@school-sis/design-tokens/tokens.css'),
    },
  ];

  for (const invariant of invariantChecks) {
    const absolute = path.join(root, invariant.file);
    const valid = fs.existsSync(absolute) && invariant.valid(read(invariant.file));
    if (!valid) snapshot[`invariant-${invariant.id}:${invariant.file}`] = 1;
  }

  const registrySource = read('apps/web/src/lib/capabilities/registry.ts');
  for (const capabilityId of ['ai', 'coaching', 'compliance', 'higher-education', 'international', 'mobile']) {
    const hidden = new RegExp(`id:\\s*['"]${capabilityId}['"][\\s\\S]*?lifecycle:\\s*['"]HIDDEN['"][\\s\\S]*?owner:`).test(registrySource);
    if (!hidden) {
      snapshot[`invariant-hidden-capability:${capabilityId}`] = 1;
    }
  }

  return Object.fromEntries(Object.entries(snapshot).sort(([left], [right]) => left.localeCompare(right)));
}

const current = collectSnapshot();
if (snapshotMode) {
  process.stdout.write(`${JSON.stringify({ version: 1, findings: current }, null, 2)}\n`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error('Product-truth baseline is missing. Review `node scripts/check-product-truth.mjs --snapshot` and add it intentionally.');
  process.exit(1);
}

const baselineDocument = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const baseline = baselineDocument.findings || {};
const regressions = [];
const improvements = [];

for (const [key, count] of Object.entries(current)) {
  const allowed = Number(baseline[key] || 0);
  if (count > allowed) regressions.push({ key, allowed, count });
}
for (const [key, allowed] of Object.entries(baseline)) {
  const count = Number(current[key] || 0);
  if (count < Number(allowed)) improvements.push({ key, allowed: Number(allowed), count });
}

if (improvements.length > 0) {
  console.log(`Product-truth debt improved in ${improvements.length} file/rule pair(s). Lower the reviewed baseline to lock in the gain.`);
}

if (regressions.length > 0) {
  console.error('Product-truth/design-system debt increased:');
  for (const regression of regressions) {
    console.error(`- ${regression.key}: ${regression.count} (baseline ${regression.allowed})`);
  }
  process.exit(1);
}

console.log(`Product-truth ratchet passed (${Object.keys(current).length} tracked file/rule pair(s), no increases).`);
