import type { MetadataRoute } from 'next';
import { WEBSITE_BASE_URL } from '@/lib/seo-guides';

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: ['/api/'],
            },
            {
                userAgent: ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Google-Extended'],
                allow: ['/', '/llms.txt', '/guides/', '/tools/', '/pricing', '/architecture', '/solutions/'],
                disallow: ['/api/'],
            },
        ],
        sitemap: `${WEBSITE_BASE_URL}/sitemap.xml`,
        host: WEBSITE_BASE_URL,
    };
}
