import { performance } from 'node:perf_hooks';

const args = new Map();
const flags = new Set();

for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (!arg.startsWith('--')) continue;

    const [key, inlineValue] = arg.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
        args.set(key, inlineValue);
        continue;
    }

    const next = process.argv[index + 1];
    if (next && !next.startsWith('--')) {
        args.set(key, next);
        index += 1;
    } else {
        flags.add(key);
    }
}

function numberArg(name, fallback, min, max) {
    const raw = args.get(name) || process.env[`LOAD_TEST_${name.toUpperCase().replaceAll('-', '_')}`];
    const value = Number(raw || fallback);
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, value));
}

function listArg(name, fallback) {
    const raw = args.get(name) || process.env[`LOAD_TEST_${name.toUpperCase().replaceAll('-', '_')}`] || fallback;
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function percentile(values, pct) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((pct / 100) * sorted.length) - 1;
    return Math.round(sorted[Math.max(0, index)]);
}

function normalizeBaseUrl(value) {
    return value.replace(/\/+$/, '');
}

const config = {
    baseUrl: normalizeBaseUrl(args.get('base-url') || process.env.LOAD_TEST_BASE_URL || 'http://localhost:3000'),
    durationSeconds: numberArg('duration-seconds', 15, 1, 300),
    concurrency: numberArg('concurrency', 5, 1, 100),
    requestTimeoutMs: numberArg('request-timeout-ms', 5000, 250, 30000),
    maxErrorRate: Number(args.get('max-error-rate') || process.env.LOAD_TEST_MAX_ERROR_RATE || 0.05),
    maxP95Ms: numberArg('max-p95-ms', 1500, 50, 60000),
    paths: listArg('paths', '/api/health,/login'),
    dryRun: flags.has('dry-run') || process.env.LOAD_TEST_DRY_RUN === 'true',
};

async function hit(pathname) {
    const url = `${config.baseUrl}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    const started = performance.now();

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'school-sis-load-test/1.0' },
        });
        const elapsed = performance.now() - started;
        await response.arrayBuffer();

        return {
            ok: response.status < 500,
            status: response.status,
            ms: elapsed,
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            ms: performance.now() - started,
            error: error instanceof Error ? error.message : 'Unknown request error',
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function main() {
    if (config.dryRun) {
        console.log(JSON.stringify({ mode: 'dry-run', config }, null, 2));
        return;
    }

    const deadline = Date.now() + (config.durationSeconds * 1000);
    const results = [];
    let nextPath = 0;

    async function worker() {
        while (Date.now() < deadline) {
            const pathname = config.paths[nextPath % config.paths.length];
            nextPath += 1;
            results.push(await hit(pathname));
        }
    }

    await Promise.all(Array.from({ length: config.concurrency }, () => worker()));

    const latencies = results.map((result) => result.ms);
    const failures = results.filter((result) => !result.ok);
    const byStatus = results.reduce((acc, result) => {
        const status = String(result.status);
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});
    const summary = {
        config,
        requests: results.length,
        failures: failures.length,
        errorRate: results.length ? Math.round((failures.length / results.length) * 10000) / 10000 : 0,
        statusCounts: byStatus,
        latencyMs: {
            p50: percentile(latencies, 50),
            p95: percentile(latencies, 95),
            p99: percentile(latencies, 99),
            max: Math.round(Math.max(0, ...latencies)),
        },
    };

    console.log(JSON.stringify(summary, null, 2));

    if (summary.errorRate > config.maxErrorRate) {
        console.error(`[load:error] Error rate ${summary.errorRate} exceeds ${config.maxErrorRate}.`);
        process.exitCode = 1;
    }

    if (summary.latencyMs.p95 > config.maxP95Ms) {
        console.error(`[load:error] p95 ${summary.latencyMs.p95}ms exceeds ${config.maxP95Ms}ms.`);
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error('[load:error]', error.message);
    process.exit(1);
});
