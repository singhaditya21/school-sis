import type { NextConfig } from "next";
import { createRequire } from "module";
import { dirname } from "path";

const require = createRequire(import.meta.url);
const moduleRoot = (specifier: string) => dirname(require.resolve(specifier));

const securityHeaders = [
    {
        key: 'X-Frame-Options',
        value: 'DENY',
    },
    {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
    },
    {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
    },
    {
        key: 'X-DNS-Prefetch-Control',
        value: 'on',
    },
    {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
    },
    {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
    },
    {
        key: 'Content-Security-Policy',
        value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.stripe.com https://js.stripe.com https://checkout.razorpay.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: blob: https:",
            "connect-src 'self' https://api.stripe.com https://lumberjack.razorpay.com https://*.razorpay.com",
            "frame-src https://checkout.stripe.com https://js.stripe.com https://api.razorpay.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ].join('; '),
    },
];

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
