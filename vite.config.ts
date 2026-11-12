import { defineConfig, type Plugin } from 'vite';
import { ANALYTICS_SNIPPET } from './src/analytics';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

/**
 * Cloudflare Web Analytics on baipix.app/app/: page views only, no cookies. Nothing about the drawings or what
 * people do in the editor is sent. Left out of dev and of the single-file build.
 */
const analytics = (): Plugin => ({
  name: 'baipix-analytics',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('</body>', `<script>${ANALYTICS_SNIPPET}</script></body>`),
});

// `npm run build:single` produces one self-contained index.html (handy for sharing or embedding).
export default defineConfig(({ mode }) => ({
  plugins:
    mode === 'single'
      ? [react(), viteSingleFile()]
      : [
          react(),
          analytics(),
          VitePWA({
            registerType: 'prompt',
            injectRegister: false,
            scope: '/app/',
            includeAssets: ['pwa-192.png', 'pwa-512.png'],
            workbox: {
              globPatterns: ['**/*.{js,css,html,woff,woff2,png}'],
              globIgnores: ['design.html', 'assets/design-*'],
            },
            manifest: {
              name: 'Baipix',
              short_name: 'Baipix',
              description: 'A free online pixel art editor, with the interface of a modern design tool.',
              start_url: '/app/',
              scope: '/app/',
              display: 'standalone',
              background_color: '#f5f5f5',
              theme_color: '#f9f9f9',
              icons: [
                { src: '/app/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
                { src: '/app/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
              ],
            },
          }),
        ],
  base: './',
  // The design system page (design.html) is built next to the editor, except in the single-file build.
  build: mode === 'single' ? {} : { rollupOptions: { input: { main: 'index.html', design: 'design.html' } } },
  // Shown in the main menu, next to the link to the changelog.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __PWA_ENABLED__: mode !== 'single',
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
}));
