/**
 * Optional own sound recordings from the (git-ignored) folder `local-assets/`.
 *
 * Recordings found on the internet often allow private use but no
 * redistribution, so they are never committed. The file name prefix decides
 * what a recording is used for; with several files of one kind, a random one
 * is played each time. Kinds without files keep the synthesized sound.
 *
 *   whinny*  – whinny at the finish celebration
 *   snort*   – snort after the whinny
 *   hoof*    – ONE single hoofbeat (the gait rhythm is made by the code)
 *
 * Formats: mp3, wav, ogg, m4a. Other files in the folder (e.g. reference
 * recordings) are ignored and not bundled. The matching files are inlined into
 * dist/index.html when building, so the game still works by double-click.
 */

export const SAMPLE_KINDS = ['whinny', 'snort', 'hoof'] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number];

const files = import.meta.glob(
  [
    '../../local-assets/{whinny,Whinny,WHINNY}*.{mp3,wav,ogg,m4a}',
    '../../local-assets/{snort,Snort,SNORT}*.{mp3,wav,ogg,m4a}',
    '../../local-assets/{hoof,Hoof,HOOF}*.{mp3,wav,ogg,m4a}',
  ],
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;

/** URLs of all local files whose name starts with `prefix` (case-insensitive), sorted by name. */
export function localSampleUrls(prefix: string, sources: Record<string, string> = files): string[] {
  return Object.entries(sources)
    .filter(([path]) => (path.split('/').pop() ?? '').toLowerCase().startsWith(prefix.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, url]) => url);
}

/** Recordings per kind (empty lists for kinds without files). */
export function localSamples(sources: Record<string, string> = files): Record<SampleKind, string[]> {
  return {
    whinny: localSampleUrls('whinny', sources),
    snort: localSampleUrls('snort', sources),
    hoof: localSampleUrls('hoof', sources),
  };
}

/** Random element (for "a random recording each time"). */
export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T | undefined {
  return items.length === 0 ? undefined : items[Math.floor(random() * items.length) % items.length];
}
