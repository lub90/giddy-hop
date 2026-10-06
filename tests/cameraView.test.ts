import { describe, expect, it } from 'vitest';
import { placeLabel, placeRing } from '../src/ui/cameraView';

const W = 800;
const H = 450;
/** Ring radius plus line width: the whole ring must be visible. */
const R = 21;
const inside = (p: { x: number; y: number }) =>
  p.x - R >= 0 && p.x + R <= W && p.y - R >= 0 && p.y + R <= H;

describe('Camera preview – progress rings stay visible', () => {
  it('a candidate ring sits above the head when there is room', () => {
    expect(placeRing(400, 200, W, H)).toEqual({ x: 400, y: 200 });
  });

  it('a candidate whose head is above the picture still gets a full ring', () => {
    for (const [x, y] of [[400, -40], [5, 100], [795, 100], [400, 500]]) expect(inside(placeRing(x, y, W, H))).toBe(true);
  });

  it('a player ring sits above the name label when there is room', () => {
    const label = { x: 400, y: 200, w: 120, h: 28 };
    const ring = placeRing(400, 200, W, H, label);
    expect(ring.x).toBe(400);
    expect(ring.y + R).toBeLessThanOrEqual(label.y - label.h / 2);
  });

  it('at the top edge the player ring moves beside the label instead of leaving the picture', () => {
    const label = placeLabel(400, -60, 120, W, H);
    expect(label.y - 14).toBeGreaterThanOrEqual(0);
    const box = { ...label, w: 120, h: 28 };
    const ring = placeRing(400, -60, W, H, box);
    expect(inside(ring)).toBe(true);
    expect(ring.x - R).toBeGreaterThanOrEqual(box.x + box.w / 2);
  });

  it('at the top right corner the ring goes left of the label', () => {
    const label = placeLabel(790, -60, 120, W, H);
    const box = { ...label, w: 120, h: 28 };
    const ring = placeRing(790, -60, W, H, box);
    expect(inside(ring)).toBe(true);
    expect(ring.x + R).toBeLessThanOrEqual(box.x - box.w / 2);
  });
});
