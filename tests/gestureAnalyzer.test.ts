import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { GestureAnalyzer } from '../src/input/gestureAnalyzer';
import { makePose, simulate, type PersonSpec } from './helpers/poseFactory';

const cfg = () => structuredClone(CONFIG);

/** Feeds a person whose spec may change over time into an analyzer. */
function run(
  seconds: number,
  spec: (t: number) => PersonSpec | null,
  g = new GestureAnalyzer(cfg()),
  from = 0,
  onFrame?: (g: GestureAnalyzer, t: number) => void,
) {
  let jumps = 0;
  const end = simulate(seconds, (t) => {
    const s = spec(t);
    g.update(s ? makePose(s) : null, t);
    if (g.consumeJump()) jumps++;
    onFrame?.(g, t);
  }, from);
  return { g, jumps, end };
}

/** Deterministic pseudo-random jitter like real keypoint noise. */
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff - 0.5;
  };
}

/** Rhythmic bouncing: whole body moves up/down with the given amplitude (in torso lengths). */
const bounce = (amp: number, hz = 2, torso = 120, x = 640) => (t: number): PersonSpec => ({
  x,
  torso,
  hipY: 450 + Math.sin(t * 2 * Math.PI * hz) * amp * torso,
});

/** A person tilting their upper body sideways by `degrees` (positive = to their right). */
const tilted = (degrees: number, torso = 120, extra: Partial<PersonSpec> = {}) => (): PersonSpec => ({
  x: 640,
  torso,
  lean: Math.tan((degrees * Math.PI) / 180) * torso,
  ...extra,
});

describe('GestureAnalyzer – steering by leaning sideways', () => {
  it('steers right when leaning right', () => {
    const { g } = run(1, tilted(22));
    expect(g.steer).toBeGreaterThan(0.5);
    expect(g.leanDegrees).toBeCloseTo(22, 0);
  });

  it('steers left when leaning left', () => {
    const { g } = run(1, tilted(-22));
    expect(g.steer).toBeLessThan(-0.5);
  });

  it('small wobbles while standing upright barely steer', () => {
    const { g } = run(1, (t) => tilted(Math.sin(t * 13) * 4)());
    expect(Math.abs(g.steer)).toBeLessThan(0.03);
  });

  it('follows a soft curve: little response at small tilts, then rising smoothly', () => {
    const steerAt = (deg: number) => run(1.5, tilted(deg)).g.steer;
    const values = [0, 3, 6, 9, 12, 16, 20, 24, 28].map(steerAt);
    expect(steerAt(6)).toBeLessThan(0.1);
    expect(steerAt(14)).toBeLessThan(0.35);
    // Strictly increasing and without a sudden step anywhere.
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
      expect(values[i] - values[i - 1]).toBeLessThan(0.3);
    }
    expect(steerAt(CONFIG.steer.fullLeanDegrees + 2)).toBeGreaterThan(0.95);
  });

  it('is independent of where the person stands in the picture', () => {
    const left = run(1, tilted(15, 120, { x: 200 })).g.steer;
    const right = run(1, tilted(15, 120, { x: 1100 })).g.steer;
    expect(left).toBeCloseTo(right, 5);
  });

  it('steers the same for a small child far away and an adult close to the camera', () => {
    const child = run(1, tilted(18, 60)).g.steer;
    const adult = run(1, tilted(18, 220)).g.steer;
    expect(child).toBeGreaterThan(0.2);
    expect(child).toBeCloseTo(adult, 2);
  });

  it('does not depend on body proportions (narrow vs. broad shoulders)', () => {
    const narrow = run(1, tilted(18, 120, { shoulderRatio: 0.55 })).g.steer;
    const broad = run(1, tilted(18, 120, { shoulderRatio: 1.1 })).g.steer;
    expect(narrow).toBeCloseTo(broad, 2);
  });
});

describe('GestureAnalyzer – speed by bounce cadence', () => {
  it('stands still when the person does not move', () => {
    expect(run(3, () => ({ x: 640 })).g.drive).toBeLessThan(0.02);
  });

  it('ignores keypoint jitter while standing still', () => {
    const r = noise(1);
    const { g } = run(4, () => ({ x: 640 + r() * 3, hipY: 450 + r() * 3 }));
    expect(g.drive).toBeLessThan(0.1);
  });

  it('speeds up with rhythmic bouncing', () => {
    const { g } = run(3, bounce(0.08, 2));
    expect(g.cadence).toBeCloseTo(2, 0);
    expect(g.drive).toBeGreaterThan(0.6);
  });

  it('faster bouncing means more speed', () => {
    const slow = run(4, bounce(0.08, 1.1)).g.drive;
    const fast = run(4, bounce(0.08, 2.2)).g.drive;
    expect(slow).toBeGreaterThan(0.1);
    expect(fast).toBeGreaterThan(slow + 0.3);
  });

  it('the bounce cadence matters, not how big the bounce is', () => {
    const small = run(4, bounce(0.05, 1.6)).g.drive;
    const big = run(4, bounce(0.18, 1.6)).g.drive;
    expect(Math.abs(small - big)).toBeLessThan(0.1);
  });

  it('keeps a steady speed while bouncing steadily (no jerky ups and downs)', () => {
    const r = noise(7);
    const drives: number[] = [];
    run(6, (t) => ({ ...bounce(0.08, 1.8)(t), hipY: bounce(0.08, 1.8)(t).hipY! + r() * 2 }), undefined, 0, (g, t) => {
      if (t > 3) drives.push(g.drive);
    });
    expect(Math.max(...drives) - Math.min(...drives)).toBeLessThan(0.1);
  });

  it('also reacts to rocking forward and back (shoulders dip towards the camera)', () => {
    const { g } = run(3, (t) => ({ x: 640, shoulderDrop: (1 + Math.sin(t * 2 * Math.PI * 1.8)) * 0.15 * 120 }));
    expect(g.drive).toBeGreaterThan(0.4);
  });

  it('does not depend on the person size / distance to the camera', () => {
    const near = run(3, bounce(0.08, 2, 200)).g.drive;
    const far = run(3, bounce(0.08, 2, 60)).g.drive;
    expect(Math.abs(near - far)).toBeLessThan(0.05);
  });

  it('slows down smoothly when the person stops', () => {
    const { g, end } = run(3, bounce(0.08, 2));
    run(2.5, () => ({ x: 640 }), g, end);
    expect(g.drive).toBeLessThan(0.1);
  });

  it('slows down when the person is no longer detected', () => {
    const { g, end } = run(3, bounce(0.08, 2));
    run(2.5, () => null, g, end);
    expect(g.tracked).toBe(false);
    expect(g.drive).toBeLessThan(0.1);
  });
});

describe('GestureAnalyzer – jumping must be a real jump', () => {
  /** Stands, then jumps (rises `height` torso lengths within 0.15 s, 0.25 s in the air). */
  const jumpAt = (start: number, height = 0.6, base: (t: number) => PersonSpec = () => ({ x: 640 })) => (t: number): PersonSpec => {
    const dt = t - start;
    const rise = dt < 0 ? 0 : dt < 0.15 ? dt / 0.15 : dt < 0.4 ? 1 : Math.max(0, 1 - (dt - 0.4) / 0.15);
    const b = base(t);
    return { ...b, hipY: (b.hipY ?? 450) - rise * height * (b.torso ?? 120) };
  };

  it('detects a real jump exactly once', () => {
    expect(run(2, jumpAt(1)).jumps).toBe(1);
  });

  it('detects a jump in the middle of galloping', () => {
    expect(run(4, jumpAt(2, 0.6, bounce(0.06, 2))).jumps).toBe(1);
  });

  it('counts two separate jumps', () => {
    const twoJumps = (t: number) => (t < 1.6 ? jumpAt(0.5)(t) : jumpAt(2.2)(t));
    expect(run(3.5, twoJumps).jumps).toBe(2);
  });

  it('does not mistake energetic galloping for a jump', () => {
    expect(run(6, bounce(0.12, 2.5)).jumps).toBe(0);
  });

  it('does not mistake rocking forward/back for a jump (only the shoulders move)', () => {
    expect(run(5, (t) => ({ x: 640, shoulderDrop: (1 + Math.sin(t * 2 * Math.PI * 2)) * 0.3 * 120 })).jumps).toBe(0);
  });

  it('ignores a single-frame detection glitch', () => {
    const glitch = (t: number): PersonSpec => ({ x: 640, hipY: Math.abs(t - 1) < 0.02 ? 450 - 0.8 * 120 : 450 });
    expect(run(2, glitch).jumps).toBe(0);
  });

  it('ignores noisy keypoints and slowly walking away from the camera', () => {
    const r = noise(3);
    expect(run(5, (t) => ({ x: 640 + r() * 4, hipY: 450 - t * 15 + r() * 4 })).jumps).toBe(0);
  });

  it('works for children far away and adults close to the camera alike', () => {
    expect(run(2, jumpAt(1, 0.6, () => ({ x: 640, torso: 60 }))).jumps).toBe(1);
    expect(run(2, jumpAt(1, 0.6, () => ({ x: 640, torso: 220 }))).jumps).toBe(1);
  });

  it('a lower threshold makes jumping easier (tunable in the debug panel)', () => {
    expect(run(2, jumpAt(1, 0.25)).jumps).toBe(0);
    const c = cfg();
    c.jump.minRise = 0.15;
    expect(run(2, jumpAt(1, 0.25), new GestureAnalyzer(c)).jumps).toBe(1);
  });
});
