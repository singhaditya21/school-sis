import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

const appRoot = process.cwd();
const nextDir = path.join(appRoot, '.next');
const staticDir = path.join(nextDir, 'static');
const maxTotalKb = Number(process.env.BUNDLE_MAX_TOTAL_KB || 10000);
const maxRouteKb = Number(process.env.BUNDLE_MAX_ROUTE_KB || 2500);

async function exists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function readJson(filePath) {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...await walk(fullPath));
            continue;
        }
        files.push(fullPath);
    }

    return files;
}

function assetPathFor(filePath) {
    return `static/${path.relative(staticDir, filePath).replaceAll(path.sep, '/')}`;
}

function collectAssets(value, assets = []) {
    if (Array.isArray(value)) {
        for (const item of value) collectAssets(item, assets);
        return assets;
    }

    if (value && typeof value === 'object') {
        for (const item of Object.values(value)) collectAssets(item, assets);
        return assets;
    }

    if (typeof value === 'string' && value.endsWith('.js')) {
        assets.push(value.replace(/^\/_next\//, ''));
    }

    return assets;
}

function parseClientReferenceManifest(source) {
    const sandbox = { globalThis: {} };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { timeout: 1000 });
    return Object.values(sandbox.__RSC_MANIFEST || {});
}

function bytesToKb(value) {
    return Math.round((value / 1024) * 10) / 10;
}

async function main() {
    if (!await exists(staticDir)) {
        throw new Error('Missing .next/static. Run pnpm --filter @school-sis/web run build before bundle analysis.');
    }

    const jsFiles = (await walk(staticDir)).filter((file) => file.endsWith('.js'));
    const chunkStats = new Map();
    let totalBytes = 0;
    let totalGzipBytes = 0;

    for (const file of jsFiles) {
        const buffer = await fs.readFile(file);
        const gzipBytes = gzipSync(buffer).byteLength;
        const asset = assetPathFor(file);
        totalBytes += buffer.byteLength;
        totalGzipBytes += gzipBytes;
        chunkStats.set(asset, {
            asset,
            kb: bytesToKb(buffer.byteLength),
            gzipKb: bytesToKb(gzipBytes),
        });
    }

    const buildManifestPath = path.join(nextDir, 'build-manifest.json');
    const buildManifest = await exists(buildManifestPath) ? await readJson(buildManifestPath) : {};
    const sharedAppAssets = [
        ...(buildManifest.polyfillFiles || []),
        ...(buildManifest.rootMainFiles || []),
    ].filter((asset) => asset.endsWith('.js'));
    const routeStats = [];

    const routeMap = buildManifest.pages || {};
    for (const [route, value] of Object.entries(routeMap)) {
        const assets = [...new Set(collectAssets(value))];
        const size = assets.reduce((sum, asset) => sum + (chunkStats.get(asset)?.kb || 0), 0);
        const gzipSize = assets.reduce((sum, asset) => sum + (chunkStats.get(asset)?.gzipKb || 0), 0);
        if (assets.length > 0) {
            routeStats.push({
                route,
                assetCount: assets.length,
                kb: Math.round(size * 10) / 10,
                gzipKb: Math.round(gzipSize * 10) / 10,
            });
        }
    }

    const appPathsPath = path.join(nextDir, 'server/app-paths-manifest.json');
    const appRoutesPath = path.join(nextDir, 'app-path-routes-manifest.json');
    if (await exists(appPathsPath) && await exists(appRoutesPath)) {
        const appPaths = await readJson(appPathsPath);
        const appRoutes = await readJson(appRoutesPath);

        for (const [appPath, serverFile] of Object.entries(appPaths)) {
            if (!appPath.endsWith('/page')) continue;

            const clientManifestPath = path.join(nextDir, 'server', serverFile.replace(/\.js$/, '_client-reference-manifest.js'));
            const route = appRoutes[appPath] || appPath.replace(/\/page$/, '') || '/';
            const assets = new Set(sharedAppAssets);

            if (await exists(clientManifestPath)) {
                const manifests = parseClientReferenceManifest(await fs.readFile(clientManifestPath, 'utf8'));
                for (const manifest of manifests) {
                    for (const asset of collectAssets(manifest)) assets.add(asset);
                }
            }

            const assetList = [...assets];
            const size = assetList.reduce((sum, asset) => sum + (chunkStats.get(asset)?.kb || 0), 0);
            const gzipSize = assetList.reduce((sum, asset) => sum + (chunkStats.get(asset)?.gzipKb || 0), 0);
            routeStats.push({
                route,
                assetCount: assetList.length,
                kb: Math.round(size * 10) / 10,
                gzipKb: Math.round(gzipSize * 10) / 10,
            });
        }
    }

    routeStats.sort((a, b) => b.kb - a.kb);
    const topChunks = [...chunkStats.values()].sort((a, b) => b.kb - a.kb).slice(0, 15);
    const summary = {
        totalKb: bytesToKb(totalBytes),
        totalGzipKb: bytesToKb(totalGzipBytes),
        maxTotalKb,
        maxRouteKb,
        routeCount: routeStats.length,
        heaviestRoutes: routeStats.slice(0, 20),
        topChunks,
    };

    await fs.writeFile(path.join(nextDir, 'bundle-analysis.json'), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));

    const errors = [];
    if (summary.totalKb > maxTotalKb) {
        errors.push(`Total JavaScript ${summary.totalKb}KB exceeds BUNDLE_MAX_TOTAL_KB=${maxTotalKb}.`);
    }

    const overBudgetRoute = routeStats.find((route) => route.kb > maxRouteKb);
    if (overBudgetRoute) {
        errors.push(`Route ${overBudgetRoute.route} JavaScript ${overBudgetRoute.kb}KB exceeds BUNDLE_MAX_ROUTE_KB=${maxRouteKb}.`);
    }

    if (errors.length > 0) {
        for (const error of errors) console.error(`[bundle:error] ${error}`);
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error('[bundle:error]', error.message);
    process.exit(1);
});
