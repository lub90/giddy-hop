import { defineConfig } from '@playwright/test';

/**
 * End-to-end smoke tests against the production build, using the locally
 * installed Microsoft Edge with a fake webcam (no browser download needed).
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'msedge',
    // The UI follows the browser language; most tests check the German texts.
    locale: 'de-DE',
    viewport: { width: 1600, height: 900 },
    permissions: ['camera'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
