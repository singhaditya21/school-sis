import type { NextConfig } from "next";
import { createRequire } from "module";
import { dirname } from "path";
import {
    apiSecurityHeaders,
    bearerUrlNoReferrerHeaders,
    securityHeaders,
} from "./src/lib/security/headers";

const nodeRequire = createRequire(import.meta.url);
const moduleRoot = (specifier: string) => dirname(nodeRequire.resolve(specifier));

const nextConfig: NextConfig = {
    output: 'standalone',
    poweredByHeader: false,
    compress: true,
    // devIndicators: {
    //     appIsrStatus: false,
    //     buildActivity: false,
    // },
    typescript: {
        ignoreBuildErrors: process.env.NEXT_IGNORE_TYPE_ERRORS === 'true',
    },
    transpilePackages: ['@school-sis/api'],
    webpack(config) {
        config.resolve ??= {};
        config.resolve.alias = {
            ...(config.resolve.alias ?? {}),
            pg: moduleRoot('pg'),
        };
        return config;
    },
    experimental: {
        serverActions: {
            bodySizeLimit: '6mb',
        },
    },
    async headers() {
        return [
            {
                source: '/manifest.webmanifest',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=3600, stale-while-revalidate=86400',
                    },
                ],
            },
            {
                // Apply security headers to all routes
                source: '/(.*)',
                headers: [...securityHeaders],
            },
            {
                // Prevent bearer payment tokens in /pay/* URLs from leaking via Referer
                source: '/pay/:path*',
                headers: [...bearerUrlNoReferrerHeaders],
            },
            {
                // Prevent signed certificate/gate-pass tokens in /verify/* URLs from leaking via Referer
                source: '/verify/:path*',
                headers: [...bearerUrlNoReferrerHeaders],
            },
            {
                // Enforce strict non-document CSP on all JSON/API endpoints
                source: '/api/:path*',
                headers: [...apiSecurityHeaders],
            },
        ];
    },
};

export default nextConfig;
