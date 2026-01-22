import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    typescript: {
        // Skip type checking during build (types will be checked in IDE)
        ignoreBuildErrors: true,
    },
    eslint: {
        // Skip linting during build (linting happens in dev)
        ignoreDuringBuilds: true,
    },
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb',
        },
    },
    webpack: (config) => {
        config.externals.push({
            'utf-8-validate': 'commonjs utf-8-validate',
            'bufferutil': 'commonjs bufferutil',
        });
        return config;
    },
};

export default nextConfig;

