import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: 'standalone',
    typescript: {
        // CI runs tsc --noEmit separately; skip during next build to avoid
        // redundant checks that may fail in Docker environments
        ignoreBuildErrors: true,
    },
    eslint: {
        // CI runs next lint separately; skip during next build
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

