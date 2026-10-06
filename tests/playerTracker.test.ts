import { describe, expect, it } from 'vitest';
import { feed, newTracker } from './helpers/tracker';

describe('PlayerTracker – registration by raising an arm', () => {
  it('registers a child who holds an arm up long enough', () => {
    const tr = newTracker();
    feed(tr, 1.2, () => [{ x: 640, arm: 'right', trackId: 1 }], 'register');
    expect(tr.slots).toHaveLength(1);
    expect(tr.slots[0].ready).toBe(false);
  });

  it('shows progress but does not register a short wave', () => {
    const tr = newTracker();
    feed(tr, 0.4, () => [{ x: 640, arm: 'left', trackId: 1 }], 'register');
    expect(tr.slots).toHaveLength(0);
    expect(tr.candidates[0].progress).toBeGreaterThan(0.3);
  });

  it('does not register someone raising both arms', () => {
    const tr = newTracker();
    feed(tr, 2, () => [{ x: 640, arm: 'both', trackId: 1 }], 'register');
    expect(tr.slots).toHaveLength(0);
  });

  it('ignores bystanders who do not raise an arm', () => {
    const tr = newTracker();
    feed(tr, 1.5, () => [
      { x: 300, arm: 'right', trackId: 1 },
      { x: 900, trackId: 2 },
    ], 'register');
    expect(tr.slots).toHaveLength(1);
    expect(tr.candidates).toHaveLength(1);
  });

  it('accepts at most four players', () => {
    const tr = newTracker();
    const xs = [150, 400, 650, 900, 1150];
    feed(tr, 1.5, () => xs.map((x, i) => ({ x, arm: 'right' as const, trackId: i + 1 })), 'register');
    expect(tr.slots).toHaveLength(4);
  });

  it('numbers players in registration order, not by position', () => {
    const tr = newTracker();
    const { t } = feed(tr, 1.2, () => [{ x: 1000, arm: 'right', trackId: 1 }], 'register');
    feed(tr, 1.2, () => [{ x: 1000, trackId: 1 }, { x: 250, arm: 'left', trackId: 2 }], 'register', t);
    expect(tr.slots.map((s) => [s.number, Math.round(s.anchor!.x * 1280)])).toEqual([[0, 1000], [1, 250]]);
  });

  it('keeps the numbers of the others when someone leaves, and reuses the free number', () => {
    const tr = newTracker();
    let { t } = feed(tr, 1.2, () => [300, 640, 980].map((x, i) => ({ x, arm: 'right' as const, trackId: i + 1 })), 'register');
    tr.unregister(tr.slots[0]);
    expect(tr.slots.map((s) => s.number)).toEqual([1, 2]);
    ({ t } = feed(tr, 0.3, () => [{ x: 640, trackId: 2 }, { x: 980, trackId: 3 }], 'register', t));
    feed(tr, 1.2, () => [{ x: 640, trackId: 2 }, { x: 980, trackId: 3 }, { x: 150, arm: 'left', trackId: 7 }], 'register', t);
    expect(tr.slots.map((s) => s.number)).toEqual([0, 1, 2]);
    expect(Math.round(tr.slots[0].anchor!.x * 1280)).toBe(150);
  });

  it('frees the slot of a child who walks away during registration', () => {
    const tr = newTracker();
    const { t } = feed(tr, 1.2, () => [{ x: 640, arm: 'right', trackId: 1 }], 'register');
    feed(tr, 4, () => [], 'register', t);
    expect(tr.slots).toHaveLength(0);
  });

  it('does not register new players while loading or during the race', () => {
    for (const mode of ['loading', 'race'] as const) {
      const tr = newTracker();
      feed(tr, 1.5, () => [{ x: 640, arm: 'right', trackId: 1 }], mode);
      expect(tr.slots, mode).toHaveLength(0);
    }
  });

  it('supports keyboard-only players for testing', () => {
    const tr = newTracker();
    tr.addKeyboardPlayer();
    feed(tr, 5, () => [], 'register');
    expect(tr.slots).toHaveLength(1);
    expect(tr.slots[0].kind).toBe('keyboard');
  });
});

describe('PlayerTracker – arm gestures of registered players', () => {
  it('the registering arm does not count again: arms must come down first', () => {
    const tr = newTracker();
    const { events } = feed(tr, 3, () => [{ x: 640, arm: 'right', trackId: 1 }], 'register');
    expect(tr.slots).toHaveLength(1);
    expect(events).toHaveLength(0);
  });

  it('reports "one" after lowering and raising an arm again, and "both" for both arms', () => {
    const tr = newTracker();
    let { t } = feed(tr, 1.2, () => [{ x: 640, arm: 'right', trackId: 1 }], 'register');
    ({ t } = feed(tr, 0.3, () => [{ x: 640, trackId: 1 }], 'register', t));
    const one = feed(tr, 1.2, () => [{ x: 640, arm: 'left', trackId: 1 }], 'register', t);
    expect(one.events.map((e) => e.action)).toEqual(['one']);
    ({ t } = feed(tr, 0.3, () => [{ x: 640, trackId: 1 }], 'register', one.t));
    const both = feed(tr, 1.2, () => [{ x: 640, arm: 'both', trackId: 1 }], 'register', t);
    expect(both.events.map((e) => e.action)).toEqual(['both']);
  });

  it('reports no gestures during the race', () => {
    const tr = newTracker();
    let { t } = feed(tr, 1.2, () => [{ x: 640, arm: 'right', trackId: 1 }], 'register');
    ({ t } = feed(tr, 0.3, () => [{ x: 640, trackId: 1 }], 'race', t));
    expect(feed(tr, 2, () => [{ x: 640, arm: 'both', trackId: 1 }], 'race', t).events).toHaveLength(0);
  });
});

describe('PlayerTracker – stable identity during the race', () => {
  /** Registers kids standing at the given x positions. */
  function registered(xs: number[]) {
    const tr = newTracker();
    const { t } = feed(tr, 1.2, () => xs.map((x, i) => ({ x, arm: 'right' as const, trackId: i + 1 })), 'register');
    const uids = tr.slots.map((s) => s.uid);
    return { tr, t, uids };
  }

  it('keeps each child on their horse when one child is briefly not detected', () => {
    // This was the bug in the first prototype: index = n-th person from the left.
    const { tr, t, uids } = registered([300, 640, 980]);
    feed(tr, 0.5, () => [{ x: 640, trackId: 2 }, { x: 980, trackId: 3 }], 'race', t);
    expect(tr.slots.map((s) => s.uid)).toEqual(uids);
    expect(tr.slots[0].pose).toBeNull();
    expect(Math.round(tr.slots[1].pose!.center.x * 1280)).toBe(640);
    expect(Math.round(tr.slots[2].pose!.center.x * 1280)).toBe(980);
  });

  it('ignores a bystander walking into the picture', () => {
    const { tr, t } = registered([300, 980]);
    feed(tr, 1, () => [{ x: 300, trackId: 1 }, { x: 640, arm: 'right', trackId: 9 }, { x: 980, trackId: 2 }], 'race', t);
    expect(tr.slots).toHaveLength(2);
    expect(tr.slots.every((s) => Math.abs(s.pose!.center.x * 1280 - 640) > 100)).toBe(true);
  });

  it('recovers by position when MoveNet assigns new tracker ids', () => {
    const { tr, t } = registered([300, 980]);
    feed(tr, 0.5, () => [{ x: 985, trackId: 50 }, { x: 305, trackId: 51 }], 'race', t);
    expect(Math.round(tr.slots[0].pose!.center.x * 1280)).toBe(305);
    expect(Math.round(tr.slots[1].pose!.center.x * 1280)).toBe(985);
  });

  it('follows a child who slowly drifts sideways', () => {
    const { tr, t } = registered([300, 980]);
    feed(tr, 4, (dt) => [{ x: 300 + (dt - t) * 60, trackId: 1 }, { x: 980, trackId: 2 }], 'race', t);
    expect(tr.slots[0].pose).not.toBeNull();
    expect(tr.slots[0].anchor!.x * 1280).toBeGreaterThan(500);
  });

  it('feeds each player’s own movements into their gesture analyzer', () => {
    const { tr, t } = registered([300, 980]);
    feed(tr, 1, () => [{ x: 300, lean: 50, trackId: 1 }, { x: 980, lean: -50, trackId: 2 }], 'race', t);
    expect(tr.slots[0].gestures.steer).toBeGreaterThan(0.5);
    expect(tr.slots[1].gestures.steer).toBeLessThan(-0.5);
  });
});

describe('PlayerTracker – two children gesturing at the same time', () => {
  type Spec = { x: number; arm?: 'none' | 'left' | 'right' | 'both'; trackId?: number };
  const A = (arm: Spec['arm'] = 'none', trackId: number | undefined = 1): Spec => ({ x: 560, arm, trackId });
  const B = (arm: Spec['arm'] = 'none', trackId: number | undefined = 2): Spec => ({ x: 740, arm, trackId });

  it('registers both when MoveNet misses one of them in every other frame', () => {
    const tr = newTracker();
    let frame = 0;
    feed(tr, 1.5, () => (frame++ % 2 === 0 ? [A('left'), B('right')] : [A('left')]), 'register');
    expect(tr.slots).toHaveLength(2);
  });

  it('registers both when MoveNet swaps their tracker ids', () => {
    const tr = newTracker();
    feed(tr, 1.5, (t) => (Math.floor(t / 0.2) % 2 === 0 ? [A('left', 1), B('right', 2)] : [A('left', 2), B('right', 1)]), 'register');
    expect(tr.slots).toHaveLength(2);
  });

  it('registers both without tracker ids', () => {
    const tr = newTracker();
    feed(tr, 1.5, () => [A('left', undefined), B('right', undefined)], 'register');
    expect(tr.slots).toHaveLength(2);
  });

  it('registers despite a single frame without the raised wrist', () => {
    const tr = newTracker();
    let frame = 0;
    feed(tr, 1.5, () => [A(frame++ % 6 === 3 ? 'none' : 'left')], 'register');
    expect(tr.slots).toHaveLength(1);
  });

  it('both get ready together, each player stays with their child despite swapped ids', () => {
    const tr = newTracker();
    // Register A, then B.
    let r = feed(tr, 1.2, () => [A('left'), B()], 'register');
    r = feed(tr, 0.4, () => [A(), B()], 'register', r.t);
    r = feed(tr, 1.2, () => [A(), B('left')], 'register', r.t);
    r = feed(tr, 0.4, () => [A(), B()], 'register', r.t);
    expect(tr.slots).toHaveLength(2);
    const [first, second] = tr.slots;
    let frame = 0;
    const { events } = feed(
      tr,
      1.5,
      (t) => {
        const swapped = Math.floor(t / 0.2) % 2 === 1;
        const people = [A('right', swapped ? 2 : 1), B('left', swapped ? 1 : 2)];
        return frame++ % 3 === 1 ? [people[frame % 2]] : people;
      },
      'register',
      r.t,
    );
    expect(events.map((e) => [e.slot.number, e.action]).sort()).toEqual([[first.number, 'one'], [second.number, 'one']]);
    expect(Math.round(first.anchor!.x * 1280)).toBeCloseTo(560, -1);
    expect(Math.round(second.anchor!.x * 1280)).toBeCloseTo(740, -1);
  });
});
