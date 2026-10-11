/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const stub = (file: string) => fileURLToPath(new URL(`./src/vendor/${file}`, import.meta.url));

/**
 * Two builds:
 *
 * - `npm run build` → dist/: normal files for any web server. The base path is
 *   "/" by default; a deployment under a sub-path passes it on the command
 *   line (`npm run build -- --base /some-path/`), e.g. the GitHub Pages
 *   workflow. Nothing here depends on where the game is hosted.
 *   It is an installable app (web app manifest) with a service worker that
 *   caches all files on the first visit, so the game then runs offline.
 * - `npm run build:single` → dist-single/index.html: everything (including the
 *   pose model) inlined into one file that also works via double-click (no
 *   service worker there).
 */

/** Installable, offline-capable app. Paths are relative to the base, so it works under any sub-path. */
const pwa = VitePWA({
  // A new version waits until the player confirms the hint "new version – reload".
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
  manifest: {
    name: 'Giddy Hop!',
    short_name: 'Giddy Hop',
    description: 'Webcam horse race for up to four children – ride with your whole body.',
    lang: 'de',
    theme_color: '#14100c',
    background_color: '#14100c',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'landscape',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // Everything the game needs, including the pose model (~9 MB) and own sounds.
    globPatterns: ['**/*.{js,css,html,json,bin,wav,mp3,ogg,m4a,png,svg,webmanifest}'],
    maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
    cacheId: 'giddyhop',
    // Control the page from the first visit, so "reload" can switch to a new version.
    clientsClaim: true,
    cleanupOutdatedCaches: true,
  },
});

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: single ? './' : undefined,
    plugins: single ? [viteSingleFile()] : [pwa],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      // The pose model and three.js are large by nature.
      chunkSizeWarningLimit: 2000,
    },
    resolve: {
      alias: {
        // pose-detection imports these packages, but we only use MoveNet on WebGL.
        '@mediapipe/pose': stub('mediapipe-pose-stub.ts'),
        '@tensorflow/tfjs-backend-webgpu': stub('tfjs-webgpu-stub.ts'),
        // No service worker in the single file (it cannot work via file://).
        ...(single ? { 'virtual:pwa-register': stub('pwa-register-stub.ts') } : {}),
      },
    },
    test: {
      include: ['tests/**/*.test.ts'],
      setupFiles: ['tests/setup.ts'],
    },
  };
});
