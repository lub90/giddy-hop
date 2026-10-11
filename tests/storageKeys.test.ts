import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_CONFIG_STORAGE_KEY } from '../src/debug/debugPanel';

/** All .ts files below a folder. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('Browser storage keys', () => {
  it('all carry the game prefix "giddyhop." (on GitHub Pages all projects of an account share one origin)', () => {
    const keys = new Set<string>();
    for (const file of sources('src')) {
      for (const m of readFileSync(file, 'utf8').matchAll(/'(giddy[a-z]*\.[^']*)'/g)) keys.add(m[1]);
    }
    expect(keys.size).toBeGreaterThan(5);
    // Only read, to take over values tuned before the game was renamed.
    keys.delete(LEGACY_CONFIG_STORAGE_KEY);
    for (const key of keys) expect(key).toMatch(/^giddyhop\./);
  });
});
