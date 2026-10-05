import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { GameFlow } from '../src/game/gameFlow';
import { Race } from '../src/game/race';
import { Track } from '../src/game/track';
import { celebrationPose, MAX_PITCH, rearingsStarted, orbitProgress, ORBIT_SECONDS } from '../src/render/celebration';
import { podiumOrder } from '../src/ui/screens';

const timing = {
  delay: CONFIG.race.celebrationDelaySeconds,
  cycle: CONFIG.race.celebrationCycleSeconds,
  pause: CONFIG.race.celebrationPauseSeconds,
};
const period = timing.cycle + timing.pause;

describe('Finish celebration – camera orbit', () => {
  it('starts at the rider view and ends in front of the horse (180°)', () => {
    expect(orbitProgress(0)).toBe(0);
    expect(orbitProgress(ORBIT_SECONDS / 2)).toBeCloseTo(0.5, 6);
    expect(orbitProgress(ORBIT_SECONDS)).toBe(1);
    expect(orbitProgress(ORBIT_SECONDS * 5)).toBe(1);
  });

  it('moves smoothly (eased, no jumps)', () => {
    let prev = 0;
    for (let t = 0.01; t <= ORBIT_SECONDS; t += 0.01) {
      const p = orbitProgress(t);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p - prev).toBeLessThan(0.02);
      prev = p;
    }
  });
});

describe('Finish celebration – rearing up', () => {
  const pose = (t: number) => celebrationPose(t, timing);

  it('stands normally while galloping out after the finish line', () => {
    expect(pose(0)).toEqual({ pitch: 0, frontLegs: 0, headShake: 0 });
    expect(pose(timing.delay - 0.01).pitch).toBe(0);
  });

  it('rears up, paddles with the front hooves and shakes the head, then lands', () => {
    const mid = timing.delay + timing.cycle * 0.4;
    const samples = Array.from({ length: 40 }, (_, i) => pose(mid + i * 0.01));
    expect(Math.min(...samples.map((p) => p.pitch))).toBeGreaterThan(MAX_PITCH * 0.9);
    // Paddling and head shaking: values change back and forth.
    const legs = samples.map((p) => p.frontLegs);
    const head = samples.map((p) => p.headShake);
    expect(Math.max(...legs) - Math.min(...legs)).toBeGreaterThan(0.5);
    expect(Math.max(...head)).toBeGreaterThan(0.2);
    expect(Math.min(...head)).toBeLessThan(-0.2);
    // Back on all fours at the end of the cycle.
    expect(pose(timing.delay + timing.cycle * 0.95)).toEqual({ pitch: 0, frontLegs: 0, headShake: 0 });
  });

  it('rests on all fours for the pause, then rears up again', () => {
    const rest = { pitch: 0, frontLegs: 0, headShake: 0 };
    for (let t = timing.cycle; t < period; t += 0.1) expect(pose(timing.delay + t)).toEqual(rest);
    const a = pose(timing.delay + timing.cycle * 0.4);
    const b = pose(timing.delay + period + timing.cycle * 0.4);
    expect(b.pitch).toBeCloseTo(a.pitch, 1);
  });

  it('counts the rearings (one whinny each)', () => {
    expect(rearingsStarted(0, timing)).toBe(0);
    expect(rearingsStarted(timing.delay, timing)).toBe(1);
    expect(rearingsStarted(timing.delay + period - 0.01, timing)).toBe(1);
    expect(rearingsStarted(timing.delay + period, timing)).toBe(2);
    expect(rearingsStarted(timing.delay + period * 2.5, timing)).toBe(3);
  });
});

describe('Finish celebration – results timing', () => {
  it('the results wait until the last horse has celebrated at least once', () => {
    const track = new Track({ halfWidth: 3.5, shoulder: 1.5, segments: [{ kind: 'straight', length: 20 }] });
    const flow = new GameFlow(track, structuredClone(CONFIG));
    flow.ready();
    flow.startLoading(1);
    flow.skipLoading();
    let lastFinish = -1;
    let resultsAt = -1;
    let t = 0;
    for (let i = 0; i < 60 * 60 && resultsAt < 0; i++) {
      flow.update(1 / 60, [{ drive: 1, steer: 0, jump: false }]);
      t += 1 / 60;
      if (lastFinish < 0 && flow.race?.isOver) lastFinish = t;
      if (flow.phase === 'results') resultsAt = t;
    }
    expect(resultsAt - lastFinish).toBeGreaterThanOrEqual(timing.delay + timing.cycle - 0.05);
  });

  it('finished horses stop in the run-out (to rear up)', () => {
    const race = new Race(new Track({ halfWidth: 3.5, shoulder: 1.5, segments: [{ kind: 'straight', length: 30 }] }), 1, structuredClone(CONFIG));
    race.horses[0].speed = CONFIG.horse.maxSpeed;
    for (let i = 0; i < 60 * 8; i++) race.update(1 / 60, [{ drive: 1, steer: 0, jump: false }]);
    const h = race.horses[0];
    expect(h.finished).toBe(true);
    // Keeps moving after the race is over (no freeze on the line) …
    expect(h.s - race.track.length).toBeGreaterThan(3);
    // … and comes to a stop within the run-out, while the race clock stands still.
    expect(h.speed).toBe(0);
    expect(h.s - race.track.length).toBeLessThan(Track.RUN_OUT);
    expect(race.time).toBeCloseTo(h.finishTime!, 6);
  });
});

describe('Award ceremony – podium', () => {
  const r = (rank: number) => ({ rank, player: rank - 1 });

  it('places 2nd left, 1st in the middle, 3rd right and 4th next to it', () => {
    expect(podiumOrder([r(1), r(2), r(3), r(4)]).map((x) => x.rank)).toEqual([2, 1, 3, 4]);
  });

  it('works with fewer riders', () => {
    expect(podiumOrder([r(1)]).map((x) => x.rank)).toEqual([1]);
    expect(podiumOrder([r(2), r(1)]).map((x) => x.rank)).toEqual([2, 1]);
  });
});
