import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { GAIT_LABELS, gaitOf } from '../src/game/gait';
import { Race } from '../src/game/race';
import { Track } from '../src/game/track';
import { hintFor, toastFor, type HudState } from '../src/ui/hud';

const T = CONFIG.hud.gaitThresholds;

describe('Speed gauge – Schritt / Trab / Galopp', () => {
  it('maps the speed fraction to the gait', () => {
    expect(gaitOf(0, T)).toBe('walk');
    expect(gaitOf(T.trot - 0.01, T)).toBe('walk');
    expect(gaitOf(T.trot, T)).toBe('trot');
    expect(gaitOf(T.gallop - 0.01, T)).toBe('trot');
    expect(gaitOf(T.gallop, T)).toBe('gallop');
    expect(gaitOf(1, T)).toBe('gallop');
  });

  it('uses German labels for the kids', () => {
    expect(Object.values(GAIT_LABELS)).toEqual(['Schritt', 'Trab', 'Galopp']);
  });

  it('a trotting horse without input is shown as "Schritt", full bouncing as "Galopp"', () => {
    expect(gaitOf(CONFIG.horse.minSpeed / CONFIG.horse.maxSpeed, T)).toBe('walk');
    expect(gaitOf(1, T)).toBe('gallop');
  });
});

const base: HudState = {
  carrots: 0,
  faults: 0,
  time: 0,
  progress: 0,
  speed: 0.5,
  slowdown: null,
  jumpZone: false,
  lostTracking: false,
  steerHint: 0,
  finished: false,
};

describe('HUD hint line', () => {
  it('is empty while riding normally', () => {
    expect(hintFor(base).text).toBe('');
  });

  it('explains why the horse is slower: grass or rail, with the way back', () => {
    const grass = hintFor({ ...base, slowdown: 'grass', steerHint: -1 });
    expect(grass.text).toContain('Wiese');
    expect(grass.text).toContain('links');
    expect(grass.warn).toBe(true);
    const rail = hintFor({ ...base, slowdown: 'rail', steerHint: 1 });
    expect(rail.text).toContain('Zaun');
    expect(rail.text).toContain('rechts');
  });

  it('warns about lost tracking first', () => {
    expect(hintFor({ ...base, lostTracking: true, slowdown: 'rail' }).text).toContain('sehe dich nicht');
  });

  it('gives a gentle steering hint near the edge of the sand', () => {
    const h = hintFor({ ...base, steerHint: 1 });
    expect(h.text).toContain('rechts');
    expect(h.warn).toBe(false);
  });
});

describe('Race.slowdownReason', () => {
  const track = new Track({ halfWidth: 3.5, shoulder: 1.5, segments: [{ kind: 'straight', length: 300 }] });
  const step = (race: Race, steer: number[]) =>
    race.update(1 / 60, steer.map((s) => ({ drive: 1, steer: s, jump: false })));

  it('is null on the sand, "grass" on the shoulder and "rail" at the fence', () => {
    const race = new Race(track, 3, structuredClone(CONFIG));
    race.horses[0].lateral = 3;
    race.horses[1].lateral = -4;
    race.horses[2].lateral = track.railOffset;
    step(race, [0, 0, 1]);
    expect(race.slowdownReason(0)).toBeNull();
    expect(race.slowdownReason(1)).toBe('grass');
    expect(race.slowdownReason(2)).toBe('rail');
  });
});

describe('HUD toasts', () => {
  it('celebrates clean jumps and reports faults', () => {
    expect(toastFor({ type: 'jump-cleared', obstacle: 'wall' })).toContain('Super Sprung');
    expect(toastFor({ type: 'jump-fault', obstacle: 'fence' })).toContain('Abwurf');
    expect(toastFor({ type: 'carrot', obstacle: 'carrot' })).toContain('🥕');
  });

  it('a fault at the water ditch makes a splash', () => {
    expect(toastFor({ type: 'jump-fault', obstacle: 'water' })).toContain('Platsch');
  });

  it('has no toast for a plain jump or the finish', () => {
    expect(toastFor({ type: 'jump' })).toBeNull();
    expect(toastFor({ type: 'finish' })).toBeNull();
  });
});
