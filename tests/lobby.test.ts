import { describe, expect, it } from 'vitest';
import { Lobby, type LobbyCommand } from '../src/game/lobby';
import { ArmGestureDetector } from '../src/pose/armGesture';
import type { PlayerTracker, TrackerMode } from '../src/pose/playerTracker';
import { slotStatus } from '../src/ui/screens';
import { makeFrame, makePose, simulate, type PersonSpec } from './helpers/poseFactory';
import { newTracker } from './helpers/tracker';

describe('ArmGestureDetector', () => {
  const run = (det: ArmGestureDetector, arms: (t: number) => 0 | 1 | 2, seconds: number, from = 0) => {
    const actions: string[] = [];
    simulate(seconds, (t) => {
      const a = det.update(arms(t), t, 0.8);
      if (a) actions.push(a);
    }, from);
    return actions;
  };

  it('fires "one" after holding one arm, once per raise', () => {
    expect(run(new ArmGestureDetector(), () => 1, 3)).toEqual(['one']);
  });

  it('fires "both" (and not "one") when the second arm follows shortly', () => {
    expect(run(new ArmGestureDetector(), (t) => (t < 0.3 ? 1 : 2), 2)).toEqual(['both']);
  });

  it('lowering both arms one after another does not fire "one"', () => {
    expect(run(new ArmGestureDetector(), (t) => (t < 1.2 ? 2 : t < 3 ? 1 : 0), 3.5)).toEqual(['both']);
  });

  it('needs the arms lowered between two gestures', () => {
    expect(run(new ArmGestureDetector(), (t) => (t < 1 || t > 1.3 ? 1 : 0), 3)).toEqual(['one', 'one']);
  });

  it('can start blocked until the arms come down (right after registering)', () => {
    expect(run(new ArmGestureDetector(true), () => 1, 3)).toEqual([]);
  });

  describe('with flicker filter', () => {
    const runFiltered = (det: ArmGestureDetector, arms: (t: number) => 0 | 1 | 2, seconds: number) => {
      const actions: { action: string; t: number }[] = [];
      simulate(seconds, (t) => {
        const a = det.update(arms(t), t, 0.8, 0.2);
        if (a) actions.push({ action: a, t });
      });
      return actions;
    };

    it('ignores a wrist missed for a frame, and the hold time stays the same', () => {
      const missing = (t: number) => Math.round(t * 25) % 6 === 3;
      const actions = runFiltered(new ArmGestureDetector(), (t) => (missing(t) ? 0 : 1), 2);
      expect(actions.map((a) => a.action)).toEqual(['one']);
      expect(actions[0].t).toBeLessThan(0.85);
    });

    it('still needs the arms lowered for longer than a flicker between two gestures', () => {
      const brief = (t: number) => (t > 1 && t < 1.1 ? 0 : 1);
      expect(runFiltered(new ArmGestureDetector(), brief, 3).map((a) => a.action)).toEqual(['one']);
      const real = (t: number) => (t > 1 && t < 1.5 ? 0 : 1);
      expect(runFiltered(new ArmGestureDetector(), real, 3).map((a) => a.action)).toEqual(['one', 'one']);
    });
  });
});

/** Scripted lobby scenario: each step is a scene held for some seconds. */
class Scenario {
  readonly tracker = newTracker();
  readonly lobby = new Lobby(this.tracker);
  phase: 'register' | 'loading' = 'register';
  commands: LobbyCommand[] = [];
  private t = 0;

  hold(seconds: number, scene: PersonSpec[]): this {
    const mode: TrackerMode = this.phase;
    this.t = simulate(seconds, (time) => {
      const events = this.tracker.update(makeFrame(time, scene.map(makePose)), mode);
      const cmd = this.lobby.handle(events, this.phase);
      if (cmd) {
        this.commands.push(cmd);
        // Mimic the game flow.
        this.phase = cmd === 'startLoading' ? 'loading' : 'register';
      }
    }, this.t);
    return this;
  }

  /** Raise (arm) for a full gesture, then lower again. */
  gesture(arm: 'left' | 'both', people: PersonSpec[], who: number): this {
    const raised = people.map((p, i) => (i === who ? { ...p, arm } : p));
    return this.hold(1.0, raised).hold(0.3, people);
  }
}

const A: PersonSpec = { x: 300, trackId: 1 };
const B: PersonSpec = { x: 900, trackId: 2 };

function registeredAB(): Scenario {
  return new Scenario().gesture('left', [A, B], 0).gesture('left', [A, B], 1);
}

describe('Lobby – register, ready, loading', () => {
  it('raise an arm = register, raise again = ready', () => {
    const s = new Scenario().gesture('left', [A], 0);
    expect(s.tracker.slots).toHaveLength(1);
    expect(s.tracker.slots[0].ready).toBe(false);
    s.gesture('left', [A], 0);
    expect(s.tracker.slots[0].ready).toBe(true);
  });

  it('starts loading only when all registered players are ready', () => {
    const s = registeredAB().gesture('left', [A, B], 0);
    expect(s.commands).toEqual([]);
    s.gesture('left', [A, B], 1);
    expect(s.commands).toEqual(['startLoading']);
  });

  it('both arms while not ready = unregister', () => {
    const s = registeredAB().gesture('both', [A, B], 0);
    expect(s.tracker.slots.map((p) => p.number)).toEqual([1]);
  });

  it('both arms while ready = take back the ready', () => {
    const s = registeredAB().gesture('left', [A, B], 0).gesture('both', [A, B], 0);
    expect(s.tracker.slots).toHaveLength(2);
    expect(s.tracker.slots[0].ready).toBe(false);
  });

  it('both arms while loading = cancel loading, that player is not ready any more', () => {
    const s = registeredAB().gesture('left', [A, B], 0).gesture('left', [A, B], 1);
    expect(s.phase).toBe('loading');
    s.gesture('both', [A, B], 1);
    expect(s.commands).toEqual(['startLoading', 'cancelLoading']);
    expect(s.tracker.slots.map((p) => p.ready)).toEqual([true, false]);
    // Ready again → loading again.
    s.gesture('left', [A, B], 1);
    expect(s.commands.at(-1)).toBe('startLoading');
  });

  it('one arm while loading does nothing', () => {
    const s = registeredAB().gesture('left', [A, B], 0).gesture('left', [A, B], 1).gesture('left', [A, B], 0);
    expect(s.commands).toEqual(['startLoading']);
  });

  it('starts loading when the only not-ready player walks away', () => {
    const s = registeredAB().gesture('left', [A, B], 0);
    s.hold(4, [A]);
    expect(s.tracker.slots).toHaveLength(1);
    expect(s.commands).toEqual(['startLoading']);
  });

  it('keyboard shortcut and reset', () => {
    const s = registeredAB();
    s.lobby.setAllReady();
    expect(s.lobby.allReady).toBe(true);
    s.lobby.resetReady();
    expect(s.tracker.slots.every((p) => !p.ready)).toBe(true);
  });
});

describe('Lobby cards', () => {
  it('show free, registered, ready and missing players', () => {
    const tr: PlayerTracker = newTracker();
    expect(slotStatus(undefined).state).toBe('free');
    const slot = tr.addKeyboardPlayer()!;
    expect(slotStatus(slot).state).toBe('registered');
    slot.ready = true;
    expect(slotStatus(slot)).toEqual({ text: '✅ bereit!', state: 'ready' });
  });
});
