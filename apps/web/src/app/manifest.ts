import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ScholarMind',
    short_name: 'ScholarMind',
    description: 'Multi-tenant school management platform',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0e8074',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
