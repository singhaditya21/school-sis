import type { MetadataRoute } from 'next';

/**
 * Zero-Cost Installable Progressive Web App (PWA) Manifest.
 *
 * Allows parents, teachers, and principals on iOS Safari & Android Chrome to tap
 * "Add to Home Screen" and launch ScholarMind in full-screen standalone mode
 * immediately — with ₹0/$0 Apple Developer ($99/yr) or Play Store fees.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'ScholarMind — Institutional Operating System',
        short_name: 'ScholarMind',
        description:
            'Parent Fee UPI Checkout, Digital Dismissal Gate Pass, Board Report Cards, Teacher Register & Campus Command Center.',
        start_url: '/login',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAF8F4',
        theme_color: '#162B4D',
        categories: ['education', 'finance', 'productivity'],
        icons: [
            {
                src: '/icon.svg',
                sizes: '192x192 512x512',
                type: 'image/svg+xml',
                purpose: 'maskable',
            },
        ],
    };
}
