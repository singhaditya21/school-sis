import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: 'standalone',
    typescript: {
        // Type errors must be fixed — no silent failures in production
        ignoreBuildErrors: false,
    },
    eslint: {
        // Lint errors must be fixed before deployment
        ignoreDuringBuilds: false,
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

