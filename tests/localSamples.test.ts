import { describe, expect, it } from 'vitest';
import { localSampleUrls, localSamples, pickRandom } from '../src/audio/localSamples';

describe('Own sound recordings from local-assets/', () => {
  const files = {
    '../../local-assets/whinny-02.wav': 'url-w2',
    '../../local-assets/Whinny-01.wav': 'url-w1',
    '../../local-assets/snort.ogg': 'url-s',
    '../../local-assets/hoof-sand.mp3': 'url-h1',
    '../../local-assets/HOOF-2.wav': 'url-h2',
  };

  it('finds the recordings by name prefix (case-insensitive), sorted', () => {
    expect(localSampleUrls('whinny', files)).toEqual(['url-w1', 'url-w2']);
    expect(localSampleUrls('snort', files)).toEqual(['url-s']);
  });

  it('groups them into whinny, snort and hoof', () => {
    expect(localSamples(files)).toEqual({
      whinny: ['url-w1', 'url-w2'],
      snort: ['url-s'],
      hoof: ['url-h2', 'url-h1'],
    });
  });

  it('kinds without recordings stay empty (then the synthesis is used)', () => {
    expect(localSamples({})).toEqual({ whinny: [], snort: [], hoof: [] });
  });

  it('picks a random recording each time, covering all of them', () => {
    const items = ['a', 'b', 'c'];
    expect(pickRandom(items, () => 0)).toBe('a');
    expect(pickRandom(items, () => 0.5)).toBe('b');
    expect(pickRandom(items, () => 0.999)).toBe('c');
    expect(pickRandom([], () => 0.5)).toBeUndefined();
    const seen = new Set(Array.from({ length: 200 }, () => pickRandom(items)));
    expect(seen.size).toBe(3);
  });
});
