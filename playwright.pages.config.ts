import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * The same end-to-end tests against a build for a sub-path, as on GitHub
 * Pages (https://<user>.github.io/<repository>/). Run: npm run e2e:subpath
 */
const SUB_PATH = '/giddy-hop/';
const PORT = 4174;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://localhost:${PORT}${SUB_PATH}` },
  webServer: {
    command: `npm run build -- --base ${SUB_PATH} && npx vite preview --base ${SUB_PATH} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${SUB_PATH}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
