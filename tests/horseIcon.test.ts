import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { horseIconSvg } from '../src/ui/horseIcon';

describe('Horse icon', () => {
  it('is drawn in the coat and mane colors of the horse', () => {
    const svg = horseIconSvg({ coat: '#8b5a2b', mane: '#2b1a0e' });
    expect(svg).toContain('fill="#8b5a2b"');
    expect(svg).toContain('fill="#2b1a0e"');
  });

  it('every player number has its own, clearly different coat', () => {
    expect(CONFIG.horseCoats).toHaveLength(CONFIG.maxPlayers);
    expect(new Set(CONFIG.horseCoats.map((c) => c.coat)).size).toBe(CONFIG.maxPlayers);
  });
});
