/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const stub = (file: string) => fileURLToPath(new URL(`./src/vendor/${file}`, import.meta.url));

export default defineConfig({
  // Relative paths + everything inlined into one file: dist/index.html also works via double-click.
  base: './',
  plugins: [viteSingleFile()],
  resolve: {
    alias: {
      // pose-detection imports these packages, but we only use MoveNet on WebGL.
      '@mediapipe/pose': stub('mediapipe-pose-stub.ts'),
      '@tensorflow/tfjs-backend-webgpu': stub('tfjs-webgpu-stub.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
