import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Race } from '../src/game/race';
import { Track, type CourseDef, type ObstacleDef } from '../src/game/track';
import type { PlayerInput } from '../src/input/playerInput';

const DT = 1 / 60;
const cfg = () => structuredClone(CONFIG);

const straight = (length: number, obstacles: ObstacleDef[] = []): CourseDef => ({
  halfWidth: 3.5,
  shoulder: 1.5,
  segments: [{ kind: 'straight', length, obstacles }],
});

const input = (p: Partial<PlayerInput> = {}): PlayerInput => ({ drive: 0, steer: 0, jump: false, ...p });

/** Runs the race; `policy` decides each player's input every frame. */
function ride(race: Race, seconds: number, policy: (player: number, race: Race) => PlayerInput) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    race.update(DT, race.horses.map((_, p) => policy(p, race)));
  }
}

describe('Race – speed', () => {
  it('gallops at full speed with full bouncing', () => {
    const race = new Race(new Track(straight(500)), 1, cfg());
    ride(race, 5, () => input({ drive: 1 }));
    expect(race.horses[0].speed).toBeCloseTo(CONFIG.horse.maxSpeed, 1);
  });

  it('keeps trotting slowly without input – nobody gets stuck', () => {
    const race = new Race(new Track(straight(500)), 1, cfg());
    ride(race, 5, () => input());
    expect(race.horses[0].speed).toBeCloseTo(CONFIG.horse.minSpeed, 1);
    expect(race.horses[0].s).toBeGreaterThan(3);
  });

  it('is slower on the grass shoulder than on the sand', () => {
    const race = new Race(new Track(straight(500)), 2, cfg());
    race.horses[1].lateral = 4.2;
    ride(race, 4, () => input({ drive: 1 }));
    expect(race.horses[1].speed).toBeLessThan(race.horses[0].speed * 0.6);
  });
});

describe('Race – curves (semi-guided steering)', () => {
  const curve = (angle: number): CourseDef => ({
    halfWidth: 3.5,
    shoulder: 1.5,
    segments: [{ kind: 'straight', length: 5 }, { kind: 'curve', angle, radius: 20 }, { kind: 'straight', length: 50 }],
  });

  it('follows the track by itself, but a right curve carries the horse outwards (left)', () => {
    const race = new Race(new Track(curve(90)), 1, cfg());
    race.horses[0].speed = CONFIG.horse.maxSpeed;
    ride(race, 4, () => input({ drive: 1 }));
    expect(race.horses[0].lateral).toBeLessThan(-3.5);
    expect(race.isOffTrack(0)).toBe(true);
  });

  it('a left curve carries the horse outwards to the right', () => {
    const race = new Race(new Track(curve(-90)), 1, cfg());
    race.horses[0].speed = CONFIG.horse.maxSpeed;
    ride(race, 4, () => input({ drive: 1 }));
    expect(race.horses[0].lateral).toBeGreaterThan(3.5);
  });

  it('leaning into the curve keeps the horse on the sand', () => {
    const race = new Race(new Track(curve(90)), 1, cfg());
    race.horses[0].speed = CONFIG.horse.maxSpeed;
    let offTrackFrames = 0;
    ride(race, 4, (p, r) => {
      const h = r.horses[p];
      if (r.isOffTrack(p)) offTrackFrames++;
      // Simple "child": leans right while drifting left of the center.
      return input({ drive: 1, steer: h.lateral < 0 ? 1 : 0.3 });
    });
    expect(offTrackFrames).toBe(0);
  });

  it('cannot leave the track through the rails', () => {
    const race = new Race(new Track(straight(300)), 1, cfg());
    ride(race, 6, () => input({ drive: 1, steer: 1 }));
    expect(race.horses[0].lateral).toBeLessThanOrEqual(race.track.railOffset);
  });
});

describe('Race – jumping with jump zone', () => {
  const fenceAt = 40;
  const fenceTrack = () => new Track(straight(100, [{ at: fenceAt, type: 'fence' }]));

  /** Gallops and jumps once when `distance` meters before the fence. */
  const jumpWhen = (distance: number) => (p: number, r: Race) =>
    input({ drive: 1, jump: Math.abs(fenceAt - distance - r.horses[p].s) < 0.08 });

  it('clears the fence when jumping anywhere inside the jump zone', () => {
    for (const d of [0.5, 3, 6, CONFIG.jumpAssist.zoneBefore - 0.5]) {
      const race = new Race(fenceTrack(), 1, cfg());
      ride(race, 12, jumpWhen(d));
      expect(race.obstacles[0][0].result, `jump ${d} m before`).toBe('cleared');
      expect(race.horses[0].faults).toBe(0);
    }
  });

  it('is airborne and high above the fence when passing it', () => {
    const race = new Race(fenceTrack(), 1, cfg());
    let heightAtFence = 0;
    ride(race, 12, (p, r) => {
      const h = r.horses[p];
      if (Math.abs(h.s - fenceAt) < 0.2) heightAtFence = Math.max(heightAtFence, h.height);
      return jumpWhen(5)(p, r);
    });
    expect(heightAtFence).toBeGreaterThan(CONFIG.obstacles.fenceHeight);
  });

  it('knocks the fence down without a jump: fault and slowdown', () => {
    const race = new Race(fenceTrack(), 1, cfg());
    let speedAfter = Infinity;
    ride(race, 12, (_p, r) => {
      if (r.obstacles[0][0].result === 'hit' && speedAfter === Infinity) speedAfter = r.horses[0].speed;
      return input({ drive: 1 });
    });
    expect(race.obstacles[0][0].result).toBe('hit');
    expect(race.horses[0].faults).toBe(1);
    expect(speedAfter).toBeLessThan(CONFIG.horse.maxSpeed * 0.5);
    expect(race.drainEvents().map((e) => e.type)).toContain('fence-fault');
  });

  it('a jump far too early (outside the zone) does not help', () => {
    const race = new Race(fenceTrack(), 1, cfg());
    ride(race, 12, jumpWhen(25));
    expect(race.obstacles[0][0].result).toBe('hit');
  });
});

describe('Race – carrots and cones', () => {
  it('collects a carrot when riding through it', () => {
    const race = new Race(new Track(straight(60, [{ at: 20, type: 'carrot', lateral: 0 }])), 1, cfg());
    ride(race, 10, () => input({ drive: 1 }));
    expect(race.horses[0].carrots).toBe(1);
  });

  it('misses a carrot on the other side of the track', () => {
    const race = new Race(new Track(straight(60, [{ at: 20, type: 'carrot', lateral: 2.5 }])), 1, cfg());
    ride(race, 10, () => input({ drive: 1 }));
    expect(race.horses[0].carrots).toBe(0);
  });

  it('hitting a cone is a fault, steering around it is not', () => {
    const t = new Track(straight(60, [{ at: 20, type: 'cone', lateral: 0 }]));
    const hit = new Race(t, 1, cfg());
    ride(hit, 10, () => input({ drive: 1 }));
    expect(hit.horses[0].faults).toBe(1);

    const dodge = new Race(t, 1, cfg());
    ride(dodge, 10, (p, r) => input({ drive: 1, steer: r.horses[p].lateral < 2 ? 1 : 0 }));
    expect(dodge.horses[0].faults).toBe(0);
  });

  it('every player has their own carrots and fences', () => {
    const race = new Race(new Track(straight(60, [{ at: 20, type: 'carrot', lateral: 0 }])), 2, cfg());
    race.horses[0].lateral = 0;
    race.horses[1].lateral = 0;
    ride(race, 10, () => input({ drive: 1 }));
    expect(race.horses.map((h) => h.carrots)).toEqual([1, 1]);
  });
});

describe('Race – finish and ranking', () => {
  it('finishes, ranks by time and scores penalties and carrots', () => {
    const race = new Race(new Track(straight(60)), 3, cfg());
    ride(race, 30, (p) => input({ drive: [1, 0.6, 1][p] }));
    race.horses[2].faults = 2;
    race.horses[2].carrots = 1;
    const res = race.results();
    expect(race.isOver).toBe(true);
    expect(res.every((r) => r.finished)).toBe(true);
    expect(res[0].rank).toBe(1);
    expect(res[2].score).toBeCloseTo(res[2].time! + 2 * CONFIG.scoring.faultPenaltySeconds - CONFIG.scoring.carrotBonusSeconds, 6);
    expect(res[2].rank).toBeGreaterThan(res[0].rank);
  });

  it('ends after the timeout and ranks unfinished players by distance', () => {
    const c = cfg();
    c.race.timeoutSeconds = 5;
    const race = new Race(new Track(straight(1000)), 2, c);
    ride(race, 6, (p) => input({ drive: p === 1 ? 1 : 0 }));
    expect(race.isOver).toBe(true);
    const res = race.results();
    expect(res[1].rank).toBe(1);
    expect(res[0].finished).toBe(false);
  });

  it('starts the horses side by side', () => {
    const lat = [0, 1, 2, 3].map((i) => Race.startLateral(i, 4));
    expect(new Set(lat).size).toBe(4);
    expect(lat[0] + lat[3]).toBeCloseTo(0, 6);
  });
});
