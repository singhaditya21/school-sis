import type { MetadataRoute } from 'next';
import { ALL_SEO_GUIDES, WEBSITE_BASE_URL } from '@/lib/seo-guides';

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date('2026-11-12T00:00:00.000Z');

    const coreRoutes: MetadataRoute.Sitemap = [
        { url: `${WEBSITE_BASE_URL}/`, lastModified, changeFrequency: 'weekly', priority: 1.0 },
        { url: `${WEBSITE_BASE_URL}/pricing`, lastModified, changeFrequency: 'weekly', priority: 0.95 },
        { url: `${WEBSITE_BASE_URL}/solutions/ai-agents`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
        { url: `${WEBSITE_BASE_URL}/architecture`, lastModified, changeFrequency: 'monthly', priority: 0.85 },
        { url: `${WEBSITE_BASE_URL}/guides`, lastModified, changeFrequency: 'weekly', priority: 0.92 },
        { url: `${WEBSITE_BASE_URL}/tools/dpdp-readiness`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
        { url: `${WEBSITE_BASE_URL}/book-demo`, lastModified, changeFrequency: 'monthly', priority: 0.85 },
        { url: `${WEBSITE_BASE_URL}/apply-online`, lastModified, changeFrequency: 'monthly', priority: 0.75 },
        { url: `${WEBSITE_BASE_URL}/privacy`, lastModified, changeFrequency: 'monthly', priority: 0.6 },
    ];

    const guideRoutes: MetadataRoute.Sitemap = ALL_SEO_GUIDES.map((guide) => ({
        url: `${WEBSITE_BASE_URL}/guides/${guide.slug}`,
        lastModified: new Date(`${guide.updatedIso}T00:00:00.000Z`),
        changeFrequency: 'weekly',
        priority: guide.category === 'COMPLIANCE_FINANCE' ? 0.88 : 0.82,
    }));

    return [...coreRoutes, ...guideRoutes];
}
