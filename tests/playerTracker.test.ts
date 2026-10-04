import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { PlayerTracker } from '../src/pose/playerTracker';
import { makeFrame, makePose, simulate, type PersonSpec } from './helpers/poseFactory';

const newTracker = () => {
  const c = structuredClone(CONFIG);
  return new PlayerTracker({ tracking: c.tracking, maxPlayers: c.maxPlayers, gestures: c });
};

/** Feeds a scene (list of people, may vary over time) into the tracker. */
function feed(tracker: PlayerTracker, seconds: number, scene: (t: number) => PersonSpec[], register: boolean, from = 0) {
  return simulate(seconds, (t) => tracker.update(makeFrame(t, scene(t).map(makePose)), register), from);
}

describe('PlayerTracker – registration by raising an arm', () => {
  it('registers a child who holds an arm up long enough', () => {
    const tr = newTracker();
    feed(tr, 1.2, () => [{ x: 640, arm: 'right', trackId: 1 }], true);
    expect(tr.slots).toHaveLength(1);
  });

  it('shows progress but does not register a short wave', () => {
    const tr = newTracker();
    feed(tr, 0.4, () => [{ x: 640, arm: 'left', trackId: 1 }], true);
    expect(tr.slots).toHaveLength(0);
    expect(tr.candidates[0].progress).toBeGreaterThan(0.3);
  });

  it('ignores bystanders who do not raise an arm', () => {
    const tr = newTracker();
    feed(tr, 1.5, () => [
      { x: 300, arm: 'right', trackId: 1 },
      { x: 900, trackId: 2 },
    ], true);
    expect(tr.slots).toHaveLength(1);
    expect(tr.candidates).toHaveLength(1);
  });

  it('accepts at most four players', () => {
    const tr = newTracker();
    const xs = [150, 400, 650, 900, 1150];
    feed(tr, 1.5, () => xs.map((x, i) => ({ x, arm: 'right' as const, trackId: i + 1 })), true);
    expect(tr.slots).toHaveLength(4);
  });

  it('orders players left to right (player 1 = leftmost child)', () => {
    const tr = newTracker();
    let t = feed(tr, 1.2, () => [{ x: 1000, arm: 'right', trackId: 1 }], true);
    feed(tr, 1.2, () => [{ x: 1000, trackId: 1 }, { x: 250, arm: 'left', trackId: 2 }], true, t);
    expect(tr.slots.map((s) => Math.round(s.anchor!.x * 1280))).toEqual([250, 1000]);
  });

  it('frees the slot of a child who walks away during registration', () => {
    const tr = newTracker();
    const t = feed(tr, 1.2, () => [{ x: 640, arm: 'right', trackId: 1 }], true);
    feed(tr, 4, () => [], true, t);
    expect(tr.slots).toHaveLength(0);
  });

  it('does not register new players during the race', () => {
    const tr = newTracker();
    feed(tr, 1.5, () => [{ x: 640, arm: 'right', trackId: 1 }], false);
    expect(tr.slots).toHaveLength(0);
  });

  it('supports keyboard-only players for testing', () => {
    const tr = newTracker();
    tr.addKeyboardPlayer();
    feed(tr, 5, () => [], true);
    expect(tr.slots).toHaveLength(1);
    expect(tr.slots[0].kind).toBe('keyboard');
  });
});

describe('PlayerTracker – stable identity during the race', () => {
  /** Registers three kids standing at the given x positions. */
  function registered(xs: number[]) {
    const tr = newTracker();
    const t = feed(tr, 1.2, () => xs.map((x, i) => ({ x, arm: 'right' as const, trackId: i + 1 })), true);
    const uids = tr.slots.map((s) => s.uid);
    return { tr, t, uids };
  }

  it('keeps each child on their horse when one child is briefly not detected', () => {
    // This was the bug in the first prototype: index = n-th person from the left.
    const { tr, t, uids } = registered([300, 640, 980]);
    feed(tr, 0.5, () => [{ x: 640, trackId: 2 }, { x: 980, trackId: 3 }], false, t);
    expect(tr.slots[0].uid).toBe(uids[0]);
    expect(tr.slots[0].pose).toBeNull();
    expect(Math.round(tr.slots[1].pose!.center.x * 1280)).toBe(640);
    expect(Math.round(tr.slots[2].pose!.center.x * 1280)).toBe(980);
  });

  it('ignores a bystander walking into the picture', () => {
    const { tr, t } = registered([300, 980]);
    feed(tr, 1, () => [{ x: 300, trackId: 1 }, { x: 640, arm: 'right', trackId: 9 }, { x: 980, trackId: 2 }], false, t);
    expect(tr.slots).toHaveLength(2);
    expect(tr.slots.every((s) => Math.abs(s.pose!.center.x * 1280 - 640) > 100)).toBe(true);
  });

  it('recovers by position when MoveNet assigns new tracker ids', () => {
    const { tr, t } = registered([300, 980]);
    feed(tr, 0.5, () => [{ x: 985, trackId: 50 }, { x: 305, trackId: 51 }], false, t);
    expect(Math.round(tr.slots[0].pose!.center.x * 1280)).toBe(305);
    expect(Math.round(tr.slots[1].pose!.center.x * 1280)).toBe(985);
  });

  it('follows a child who slowly drifts sideways', () => {
    const { tr, t } = registered([300, 980]);
    feed(tr, 4, (dt) => [{ x: 300 + (dt - t) * 60, trackId: 1 }, { x: 980, trackId: 2 }], false, t);
    expect(tr.slots[0].pose).not.toBeNull();
    expect(tr.slots[0].anchor!.x * 1280).toBeGreaterThan(500);
  });

  it('feeds each player’s own movements into their gesture analyzer', () => {
    const { tr, t } = registered([300, 980]);
    feed(tr, 1, () => [{ x: 300, lean: 50, trackId: 1 }, { x: 980, lean: -50, trackId: 2 }], false, t);
    expect(tr.slots[0].gestures.steer).toBeGreaterThan(0.5);
    expect(tr.slots[1].gestures.steer).toBeLessThan(-0.5);
  });
});
