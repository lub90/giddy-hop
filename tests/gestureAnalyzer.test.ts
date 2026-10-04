import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { GestureAnalyzer } from '../src/input/gestureAnalyzer';
import { makePose, simulate, type PersonSpec } from './helpers/poseFactory';

const cfg = () => structuredClone(CONFIG);

/** Feeds a person whose spec may change over time into a fresh analyzer. */
function run(seconds: number, spec: (t: number) => PersonSpec | null, g = new GestureAnalyzer(cfg()), from = 0) {
  let jumps = 0;
  const end = simulate(seconds, (t) => {
    const s = spec(t);
    g.update(s ? makePose(s) : null, t);
    if (g.consumeJump()) jumps++;
  }, from);
  return { g, jumps, end };
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
    const { g } = run(1, tilted(20));
    expect(g.steer).toBeGreaterThan(0.5);
    expect(g.leanDegrees).toBeCloseTo(20, 0);
  });

  it('steers left when leaning left', () => {
    const { g } = run(1, tilted(-20));
    expect(g.steer).toBeLessThan(-0.5);
  });

  it('goes straight when standing upright (dead zone absorbs small wobbles)', () => {
    const { g } = run(1, (t) => tilted(Math.sin(t * 13) * 4)());
    expect(Math.abs(g.steer)).toBeLessThan(0.02);
  });

  it('reaches full lock at the configured angle, not before', () => {
    expect(run(1, tilted(CONFIG.steer.fullLeanDegrees + 2)).g.steer).toBeGreaterThan(0.95);
    expect(run(1, tilted(CONFIG.steer.fullLeanDegrees - 8)).g.steer).toBeLessThan(0.8);
  });

  it('is independent of where the person stands in the picture', () => {
    const left = run(1, tilted(15, 120, { x: 200 })).g.steer;
    const right = run(1, tilted(15, 120, { x: 1100 })).g.steer;
    expect(left).toBeCloseTo(right, 5);
  });

  it('steers the same for a small child far away and an adult close to the camera', () => {
    const child = run(1, tilted(15, 60)).g.steer;
    const adult = run(1, tilted(15, 220)).g.steer;
    expect(child).toBeGreaterThan(0.2);
    expect(child).toBeCloseTo(adult, 2);
  });

  it('does not depend on body proportions (narrow vs. broad shoulders)', () => {
    const narrow = run(1, tilted(15, 120, { shoulderRatio: 0.55 })).g.steer;
    const broad = run(1, tilted(15, 120, { shoulderRatio: 1.1 })).g.steer;
    expect(narrow).toBeCloseTo(broad, 2);
  });
});

describe('GestureAnalyzer – speed by bouncing/rocking', () => {
  it('stands still when the child does not move', () => {
    const { g } = run(3, () => ({ x: 640 }));
    expect(g.drive).toBeLessThan(0.05);
  });

  it('speeds up with rhythmic bouncing', () => {
    const { g } = run(3, bounce(0.12));
    expect(g.drive).toBeGreaterThan(0.5);
  });

  it('bouncing harder means more speed', () => {
    const soft = run(3, bounce(0.06)).g.drive;
    const hard = run(3, bounce(0.15)).g.drive;
    expect(hard).toBeGreaterThan(soft);
  });

  it('also reacts to rocking forward and back (shoulders dip towards the camera)', () => {
    const { g } = run(3, (t) => ({ x: 640, shoulderDrop: (1 + Math.sin(t * 2 * Math.PI * 1.5)) * 0.15 * 120 }));
    expect(g.drive).toBeGreaterThan(0.3);
  });

  it('does not depend on the child size / distance to the camera', () => {
    const near = run(3, bounce(0.12, 2, 160)).g.drive;
    const far = run(3, bounce(0.12, 2, 70)).g.drive;
    expect(Math.abs(near - far)).toBeLessThan(0.1);
  });

  it('slows down when the child stops', () => {
    const { g, end } = run(3, bounce(0.12));
    run(2, () => ({ x: 640 }), g, end);
    expect(g.drive).toBeLessThan(0.1);
  });

  it('slows down when the child is no longer detected', () => {
    const { g, end } = run(3, bounce(0.12));
    run(2, () => null, g, end);
    expect(g.tracked).toBe(false);
    expect(g.drive).toBeLessThan(0.1);
  });
});

describe('GestureAnalyzer – jumping by upward velocity', () => {
  /** Stands still, then jumps (rises 0.5 torso lengths within 0.12 s) at t = 1 s. */
  const jumpAt = (start: number) => (t: number): PersonSpec => {
    const dt = t - start;
    const rise = dt < 0 ? 0 : dt < 0.12 ? dt / 0.12 : dt < 0.4 ? 1 : Math.max(0, 1 - (dt - 0.4) / 0.15);
    return { x: 640, hipY: 450 - rise * 0.5 * 120 };
  };

  it('detects a real jump exactly once', () => {
    expect(run(2, jumpAt(1)).jumps).toBe(1);
  });

  it('does not mistake normal bouncing for a jump', () => {
    expect(run(4, bounce(0.12)).jumps).toBe(0);
  });

  it('respects the cooldown between two jumps', () => {
    const c = cfg();
    c.jump.cooldownSeconds = 10;
    const g = new GestureAnalyzer(c);
    const twoJumps = (t: number) => (t < 1.5 ? jumpAt(0.5)(t) : jumpAt(2)(t));
    expect(run(3, twoJumps, g).jumps).toBe(1);
  });

  it('a lower threshold makes jumping easier (tunable in the debug panel)', () => {
    const c = cfg();
    c.jump.upVelocityThreshold = 0.8;
    expect(run(4, bounce(0.12), new GestureAnalyzer(c)).jumps).toBeGreaterThan(0);
  });
});
