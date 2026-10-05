/**
 * Optional own sound recordings from the (git-ignored) folder `local-assets/`.
 *
 * Recordings found from the internet often allow private use but no
 * redistribution, so they are never committed. When a matching file exists,
 * it replaces the synthesized sound; otherwise the synthesis is used.
 *
 *   local-assets/whinny*.mp3|wav|ogg|m4a   → whinny at the finish celebration
 *
 * The files are bundled into the build (inlined into dist/index.html).
 */
const files = import.meta.glob('../../local-assets/*.{mp3,wav,ogg,m4a}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** URLs of all local files whose name starts with `prefix` (case-insensitive), sorted by name. */
export function localSampleUrls(prefix: string, sources: Record<string, string> = files): string[] {
  return Object.entries(sources)
    .filter(([path]) => (path.split('/').pop() ?? '').toLowerCase().startsWith(prefix.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url);
}
