import { describe, expect, it, vi } from 'vitest';
import { HoofbeatPlayer } from '../src/audio/hoofbeatPlayer';
import type { Sounds } from '../src/audio/sounds';
import { CONFIG } from '../src/config';
import { Race } from '../src/game/race';
import { Track } from '../src/game/track';
import { beatsBetween, GALLOP_BEATS, WALK_BEATS } from '../src/render/hoofbeats';

const TWO_PI = Math.PI * 2;

describe('Hoofbeat timing', () => {
  it('gallop: three beats per stride ("ta-ta-tamm")', () => {
    expect(beatsBetween(0.001, TWO_PI + 0.001, GALLOP_BEATS)).toHaveLength(3);
  });

  it('walk/trot: four even beats per stride', () => {
    expect(beatsBetween(0.001, TWO_PI + 0.001, WALK_BEATS)).toHaveLength(4);
  });

  it('counts every beat exactly once, however the frames are cut', () => {
    for (const steps of [3, 17, 100]) {
      let n = 0;
      for (let k = 0; k < steps; k++) n += beatsBetween((k / steps) * 5 * TWO_PI, ((k + 1) / steps) * 5 * TWO_PI, GALLOP_BEATS).length;
      expect(n, `${steps} frames`).toBe(15);
    }
  });

  it('nothing when the phase does not advance', () => {
    expect(beatsBetween(2, 2, GALLOP_BEATS)).toEqual([]);
  });
});

describe('HoofbeatPlayer', () => {
  function play(drive: number, seconds: number, setup?: (r: Race) => void) {
    const hoof = vi.fn();
    const player = new HoofbeatPlayer({ hoof } as unknown as Sounds);
    const race = new Race(new Track({ halfWidth: 3.5, shoulder: 4, segments: [{ kind: 'straight', length: 500 }] }), 1, structuredClone(CONFIG));
    setup?.(race);
    for (let i = 0; i < seconds * 60; i++) {
      race.update(1 / 60, [{ drive, steer: 0, jump: false }]);
      player.update(race.horses, CONFIG.horse.maxSpeed, [-0.5], [race.isOffTrack(0)]);
    }
    return hoof;
  }

  it('the faster the horse, the more and the louder the hoofbeats', () => {
    const slow = play(0.2, 4);
    const fast = play(1, 4);
    expect(fast.mock.calls.length).toBeGreaterThan(slow.mock.calls.length * 1.5);
    const loudness = (m: typeof slow) => Math.max(...m.mock.calls.map((c) => c[0] as number));
    expect(loudness(fast)).toBeGreaterThan(loudness(slow));
  });

  it('sounds from the rider’s side of the screen, duller on grass', () => {
    const onSand = play(1, 2);
    expect(onSand.mock.calls[0][1]).toBe(-0.5);
    expect(onSand.mock.calls[0][2]).toBe('sand');
    const onGrass = play(1, 2, (r) => (r.horses[0].lateral = 5));
    expect(onGrass.mock.calls.at(-1)![2]).toBe('grass');
  });

  it('is silent in the air and while standing', () => {
    expect(play(0, 3, (r) => (r.horses[0].stumble = 100)).mock.calls).toHaveLength(0);
  });
});
