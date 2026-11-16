import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base './' keeps every asset URL relative, so the build can be hosted from any folder.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // local development: `npm run dev:api` serves the API on 8787
  server: { proxy: { '/api': 'http://localhost:8787', '/p': 'http://localhost:8787' } },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three';
          if (id.includes('@react-three') || id.includes('postprocessing')) return 'r3f';
          if (id.includes('gsap') || id.includes('lenis')) return 'motion';
          return undefined;
        },
      },
    },
  },
});
