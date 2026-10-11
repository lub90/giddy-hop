/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
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
 * - `npm run build:single` → dist-single/index.html: everything (including the
 *   pose model) inlined into one file that also works via double-click.
 */
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: single ? './' : undefined,
    plugins: single ? [viteSingleFile()] : [],
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
      },
    },
    test: {
      include: ['tests/**/*.test.ts'],
      setupFiles: ['tests/setup.ts'],
    },
  };
});
