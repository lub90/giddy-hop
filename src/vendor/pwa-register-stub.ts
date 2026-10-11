/** Stands in for vite-plugin-pwa's register module in the single-file build (no service worker). */
export function registerSW(): (reload?: boolean) => Promise<void> {
  return async () => {};
}
