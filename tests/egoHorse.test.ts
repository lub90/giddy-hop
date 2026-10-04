import { describe, expect, it } from 'vitest';
import { horseLayers, LAYER_OVERVIEW, playerLayer } from '../src/render/layers';
import { egoHorseSvg, shade } from '../src/ui/egoHorse';

describe('Rider view: drawn own horse instead of the 3D box model', () => {
  it('the own 3D horse is hidden in the own view, visible to everyone else and the overview', () => {
    const layers = horseLayers(1, 4, false);
    expect(layers).toContain(LAYER_OVERVIEW);
    expect(layers).toContain(playerLayer(0));
    expect(layers).toContain(playerLayer(2));
    expect(layers).toContain(playerLayer(3));
    expect(layers).not.toContain(playerLayer(1));
  });

  it('during the finish celebration the own view shows the 3D horse again', () => {
    expect(horseLayers(1, 4, true)).toContain(playerLayer(1));
  });

  it('is drawn in the horse colors and the player color', () => {
    const svg = egoHorseSvg('#8b5a2b', '#2b1a0e', '#ff4f81');
    expect(svg).toContain('#8b5a2b');
    expect(svg).toContain('#2b1a0e');
    expect(svg).toContain('#ff4f81');
    // Unique gradient ids, so several overlays on one page do not clash.
    const ids = (s: string) => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    const other = egoHorseSvg('#8b5a2b', '#2b1a0e', '#ff4f81');
    expect(ids(svg).some((id) => ids(other).includes(id))).toBe(false);
  });

  it('shades colors lighter and darker', () => {
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#808080', 0)).toBe('#808080');
  });
});
