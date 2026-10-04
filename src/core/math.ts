export interface Point {
  x: number;
  y: number;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent smoothing: after 1/rate seconds ~63 % of the gap is closed. */
export const damp = (current: number, target: number, ratePerSecond: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-ratePerSecond * dt));

/** Moves `current` towards `target` by at most `maxDelta`. */
export const approach = (current: number, target: number, maxDelta: number): number =>
  current < target ? Math.min(target, current + maxDelta) : Math.max(target, current - maxDelta);

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export const midpoint = (a: Point | undefined, b: Point | undefined): Point | null => {
  if (a && b) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return a ?? b ?? null;
};
