import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Absolute site address for share cards and the sitemap: SITE_URL, or Vercel's production domain at build time. */
const siteUrl = (process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '');

function seo(): Plugin {
  return {
    name: 'aether-seo',
    transformIndexHtml(html) {
      // without a known address, drop the tags that need one rather than publish a broken URL
      return siteUrl ? html.replaceAll('%SITE_URL%', siteUrl) : html.replace(/\s*<(meta|link)[^>]*%SITE_URL%[^>]*>/g, '');
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nDisallow: /api/\n${siteUrl ? `\nSitemap: ${siteUrl}/sitemap.xml\n` : ''}` });
      if (siteUrl) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n</urlset>\n` });
    },
  };
}

// base './' keeps every asset URL relative, so the build can be hosted from any folder.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), seo()],
  // local development: `npm run dev:api` serves the API on 8787
  server: { proxy: { '/api': 'http://localhost:8787', '/p': 'http://localhost:8787' } },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // three's loaders and helpers stay with the lazy chunks that use them
          if (id.includes('node_modules/three/') && !id.includes('/examples/')) return 'three';
          if (id.includes('@react-three') || id.includes('postprocessing')) return 'r3f';
          if (id.includes('gsap') || id.includes('lenis')) return 'motion';
          return undefined;
        },
      },
    },
  },
});
