import { describe, expect, it } from 'vitest';
import { localSampleUrls } from '../src/audio/localSamples';

describe('Own sound recordings from local-assets/', () => {
  const files = {
    '../../local-assets/whinny-2.mp3': 'url-w2',
    '../../local-assets/Whinny-1.wav': 'url-w1',
    '../../local-assets/snort.ogg': 'url-s',
  };

  it('finds the recordings by name prefix (case-insensitive), sorted', () => {
    expect(localSampleUrls('whinny', files)).toEqual(['url-w1', 'url-w2']);
    expect(localSampleUrls('snort', files)).toEqual(['url-s']);
  });

  it('returns nothing when there are no recordings (then the synthesis is used)', () => {
    expect(localSampleUrls('whinny', {})).toEqual([]);
  });
});
