import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const webRoot = path.resolve(__dirname, '..');

const requiredFiles = [
    'apps/web/jest.config.js',
    'apps/web/jest.setup.ts',
    'apps/web/playwright.config.ts',
    'apps/web/e2e/test-environment.ts',
    'apps/web/scripts/check-test-architecture.mjs',
    'apps/web/src/__tests__/tenant-isolation.test.ts',
    'apps/web/src/__tests__/storage-service.test.ts',
    'apps/web/src/__tests__/db-tenant-context.test.ts',
    'apps/web/src/__tests__/observability-logger.test.ts',
    'docs/TESTING_QUALITY_ARCHITECTURE.md',
];

const generatedFilesThatMustNotBeTracked = [
    'apps/web/.env.test',
    'apps/web/.env.test.worker',
    'debug_url.txt',
];

function fail(message) {
    console.error(`❌ ${message}`);
    process.exit(1);
}

for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(repoRoot, file))) {
        fail(`Required testing architecture file is missing: ${file}`);
    }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(webRoot, 'package.json'), 'utf8'));
for (const script of ['test:unit', 'test:unit:coverage', 'test:architecture', 'test:e2e:smoke']) {
    if (!packageJson.scripts?.[script]) {
        fail(`apps/web/package.json is missing script: ${script}`);
    }
}

const filesToScan = [
    'apps/web/playwright.config.ts',
    'apps/web/playwright.config.worker.ts',
    'apps/web/e2e/global-setup.ts',
    'apps/web/e2e/global-setup-worker.ts',
    'apps/web/scripts/run-e2e-sql.ts',
];
for (const file of filesToScan) {
    const content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    if (content.includes('/Users/adityasingh')) {
        fail(`Hardcoded local absolute path found in ${file}`);
    }
}

try {
    const tracked = execFileSync('git', ['ls-files', ...generatedFilesThatMustNotBeTracked], {
        cwd: repoRoot,
        encoding: 'utf8',
    })
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (tracked.length > 0) {
        fail(`Generated test runtime files are tracked: ${tracked.join(', ')}`);
    }
} catch {
    console.warn('⚠️  Skipping tracked-file check because git is unavailable.');
}

console.log('✅ Testing architecture contract is valid.');
