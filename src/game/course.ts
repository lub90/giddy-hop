import type { CourseDef, ObstacleDef } from './track';

/** Carrots along a curve, on its inner side – a reward for leaning into the turn. */
function innerCarrots(angle: number, radius: number, count: number): ObstacleDef[] {
  const len = (Math.abs(angle) * Math.PI * radius) / 180;
  const lateral = Math.sign(angle) * 2;
  return Array.from({ length: count }, (_, i) => ({ at: (len * (i + 1)) / (count + 1), type: 'carrot' as const, lateral }));
}

/**
 * The fixed parcours (~370 m, roughly one minute of riding).
 * Edit freely: the track, scenery and obstacles are all generated from this.
 */
export const COURSE: CourseDef = {
  halfWidth: 3.5,
  shoulder: 2.5,
  segments: [
    { kind: 'straight', length: 25 },
    { kind: 'straight', length: 30, obstacles: [{ at: 15, type: 'fence' }] },
    { kind: 'curve', angle: 90, radius: 22, obstacles: innerCarrots(90, 22, 3) },
    {
      kind: 'straight',
      length: 40,
      obstacles: [
        { at: 10, type: 'fence' },
        { at: 22, type: 'cone', lateral: 0 },
        { at: 22, type: 'carrot', lateral: -2.2 },
        { at: 33, type: 'fence' },
      ],
    },
    { kind: 'curve', angle: -180, radius: 20, obstacles: innerCarrots(-180, 20, 5) },
    {
      kind: 'straight',
      length: 35,
      obstacles: [
        { at: 10, type: 'fence' },
        { at: 20, type: 'cone', lateral: -1.5 },
        { at: 20, type: 'carrot', lateral: 1.8 },
        { at: 28, type: 'fence' },
      ],
    },
    { kind: 'curve', angle: 90, radius: 25, obstacles: innerCarrots(90, 25, 3) },
    { kind: 'curve', angle: -60, radius: 25, obstacles: innerCarrots(-60, 25, 2) },
    { kind: 'curve', angle: 60, radius: 25, obstacles: innerCarrots(60, 25, 2) },
    { kind: 'straight', length: 30, obstacles: [{ at: 15, type: 'fence' }] },
    { kind: 'straight', length: 20 },
  ],
};
