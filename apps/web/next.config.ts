import type { NextConfig } from "next";
import { createRequire } from "module";
import { dirname } from "path";
import { securityHeaders } from "./src/lib/security/headers";

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
            'drizzle-orm': moduleRoot('drizzle-orm'),
            pg: moduleRoot('pg'),
        };
        return config;
    },
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb',
        },
    },
    async headers() {
        return [
            {
                source: '/_next/static/:path*',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },
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
                headers: securityHeaders,
            },
        ];
    },
};

export default nextConfig;
