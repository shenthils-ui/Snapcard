import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';

// One codebase, two build targets:
//   vite build                    -> server target (dist/), talks to the Express RPC backend
//   vite build --mode standalone  -> standalone target (dist-standalone/), sql.js in the browser
// The standalone flag is statically defined so dead branches (and the sql.js
// wasm) are tree-shaken out of the server build entirely.

// Copies index.html to 404.html so GitHub Pages serves the SPA for deep links
// on a first visit, before any service worker exists.
function spaFallback404() {
  return {
    name: 'snapcard-404-fallback',
    apply: 'build',
    closeBundle: {
      sequential: true,
      order: 'post',
      handler() {
        const dir = this.environment?.config?.build?.outDir || 'dist-standalone';
        const index = path.resolve(dir, 'index.html');
        if (fs.existsSync(index)) fs.copyFileSync(index, path.resolve(dir, '404.html'));
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone';
  // GitHub Pages serves under /<repo-name>/ — the workflow passes VITE_BASE.
  const base = process.env.VITE_BASE || '/';

  return {
    base,
    define: {
      'import.meta.env.VITE_STANDALONE': JSON.stringify(String(standalone)),
    },
    build: {
      outDir: standalone ? 'dist-standalone' : 'dist',
      target: 'es2022',
      emptyOutDir: true,
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'],
        manifest: {
          name: 'Snapcard',
          short_name: 'Snapcard',
          description: 'Local-first, privacy-first loyalty card wallet.',
          display: 'standalone',
          start_url: base,
          scope: base,
          theme_color: '#0f172a',
          background_color: '#0f172a',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Precache everything the app needs offline, including the sql.js wasm.
          globPatterns: ['**/*.{js,css,html,wasm,png,svg,ico,webmanifest}'],
          maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
          navigateFallback: base + 'index.html',
          navigateFallbackDenylist: [/\/api\//],
          // No runtime caching: the core app never calls the network, and
          // Google endpoints (Drive) must never be served from cache.
          runtimeCaching: [],
        },
      }),
      standalone && spaFallback404(),
    ].filter(Boolean),
  };
});
