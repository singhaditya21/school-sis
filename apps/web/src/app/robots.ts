import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                disallow: ['/pay/', '/verify/', '/api/', '/hq/', '/platform/'],
            },
        ],
    };
}
