import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Race } from '../src/game/race';
import { JUMP_TYPES, Track, type CourseDef, type ObstacleDef } from '../src/game/track';
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

  it('is equally fast anywhere on the sand, not only on the center line', () => {
    const race = new Race(new Track(straight(500)), 3, cfg());
    [-3.2, 0, 3.2].forEach((l, i) => (race.horses[i].lateral = l));
    ride(race, 4, () => input({ drive: 1 }));
    const speeds = race.horses.map((h) => h.speed);
    expect(speeds[0]).toBeCloseTo(CONFIG.horse.maxSpeed, 1);
    expect(speeds[1]).toBeCloseTo(speeds[0], 3);
    expect(speeds[2]).toBeCloseTo(speeds[0], 3);
  });

  it('is clearly slower when scraping along the rails', () => {
    const race = new Race(new Track(straight(500)), 2, cfg());
    race.horses[1].lateral = 4;
    ride(race, 4, (p) => input({ drive: 1, steer: p === 1 ? 1 : 0 }));
    expect(race.horses[1].touchingRail).toBe(true);
    expect(race.horses[1].speed).toBeLessThan(race.horses[0].speed * 0.4);
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

  it('riding the inside line of a curve is a shortcut, the outside line a detour', () => {
    const race = new Race(new Track(curve(180)), 3, cfg());
    // Right-hand curve: inside = right (+), outside = left (−). Hold the line against the drift.
    const lines = [3, 0, -3];
    race.horses.forEach((h, i) => (h.lateral = lines[i]));
    ride(race, 6, (p, r) => {
      const h = r.horses[p];
      return input({ drive: 1, steer: Math.max(-1, Math.min(1, (lines[p] - h.lateral) * 2 + 0.6)) });
    });
    const [inside, center, outside] = race.horses.map((h) => h.s);
    expect(inside).toBeGreaterThan(center + 2);
    expect(center).toBeGreaterThan(outside + 2);
  });

  it('cannot leave the track through the rails', () => {
    const race = new Race(new Track(straight(300)), 1, cfg());
    ride(race, 6, () => input({ drive: 1, steer: 1 }));
    expect(race.horses[0].lateral).toBeLessThanOrEqual(race.track.railOffset);
  });
});

describe('Race – all jump types (fence, wall, hedge, water) behave the same', () => {
  for (const type of JUMP_TYPES) {
    it(`${type}: cleared with a jump in the zone, fault without`, () => {
      const track = new Track(straight(100, [{ at: 40, type }]));
      const jumped = new Race(track, 1, cfg());
      ride(jumped, 12, (p, r) => input({ drive: 1, jump: Math.abs(35 - r.horses[p].s) < 0.08 }));
      expect(jumped.obstacles[0][0].result).toBe('cleared');
      expect(jumped.drainEvents()).toContainEqual(expect.objectContaining({ type: 'jump-cleared', obstacle: type }));

      const missed = new Race(track, 1, cfg());
      ride(missed, 12, () => input({ drive: 1 }));
      expect(missed.obstacles[0][0].result).toBe('hit');
      expect(missed.horses[0].faults).toBe(1);
      expect(missed.drainEvents()).toContainEqual(expect.objectContaining({ type: 'jump-fault', obstacle: type }));
    });
  }

  it('the jump zone ("HOPP!") works for every jump type', () => {
    for (const type of JUMP_TYPES) {
      const race = new Race(new Track(straight(100, [{ at: 40, type }])), 1, cfg());
      race.horses[0].s = 35;
      expect(race.inJumpZone(0), type).toBe(true);
    }
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
    expect(race.drainEvents().map((e) => e.type)).toContain('jump-fault');
  });

  it('allows jumping anywhere, also without an obstacle', () => {
    const race = new Race(new Track(straight(200)), 1, cfg());
    let maxHeight = 0;
    ride(race, 3, (p, r) => {
      maxHeight = Math.max(maxHeight, r.horses[p].height);
      return input({ drive: 1, jump: r.time > 1 && r.time < 1.02 });
    });
    expect(maxHeight).toBeGreaterThan(0.6);
    expect(race.horses[0].airborne).toBe(false);
    expect(race.horses[0].faults).toBe(0);
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

describe('Race – live placement (shown top left)', () => {
  it('ranks by distance while riding', () => {
    const race = new Race(new Track(straight(500)), 3, cfg());
    ride(race, 3, (p) => input({ drive: [0.3, 1, 0.6][p] }));
    expect(race.positions()).toEqual([3, 1, 2]);
  });

  it('finished riders rank by finish time ahead of everyone still riding', () => {
    const race = new Race(new Track(straight(40)), 3, cfg());
    ride(race, 30, (p) => input({ drive: [0.7, 1, 0][p] }));
    race.horses[2].finished = false;
    race.horses[2].finishTime = null;
    race.horses[2].s = 39;
    expect(race.positions()).toEqual([2, 1, 3]);
  });

  it('is unique for every rider, even side by side at the start', () => {
    const race = new Race(new Track(straight(100)), 4, cfg());
    expect([...race.positions()].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('Race – carrot turbo and stopping faults', () => {
  const H = CONFIG.horse;

  /** Rides at full drive and records the speed over time. */
  function speeds(course: CourseDef, seconds: number, drive = 1) {
    const race = new Race(new Track(course), 1, cfg());
    race.horses[0].speed = H.maxSpeed * drive;
    const samples: { t: number; v: number }[] = [];
    ride(race, seconds, (p, r) => {
      samples.push({ t: r.time, v: r.horses[p].speed });
      return input({ drive });
    });
    return { race, samples };
  }

  it('a carrot makes the horse faster than its maximum for a few seconds', () => {
    const { race, samples } = speeds(straight(300, [{ at: 20, type: 'carrot', lateral: 0 }]), 8);
    const top = Math.max(...samples.map((s) => s.v));
    expect(top).toBeCloseTo(H.maxSpeed * H.boostFactor, 1);
    expect(race.horses[0].carrots).toBe(1);
    // …and afterwards back to normal.
    expect(samples.at(-1)!.v).toBeCloseTo(H.maxSpeed, 1);
  });

  it('the turbo also works when not at full speed (+X % on the current speed)', () => {
    const { samples } = speeds(straight(300, [{ at: 12, type: 'carrot', lateral: 0 }]), 4, 0.5);
    const top = Math.max(...samples.map((s) => s.v));
    expect(top).toBeCloseTo(H.maxSpeed * 0.5 * H.boostFactor, 1);
  });

  it('the turbo kicks in quickly', () => {
    const { samples, race } = speeds(straight(300, [{ at: 20, type: 'carrot', lateral: 0 }]), 5);
    const collectedAt = samples.find((s) => s.v > H.maxSpeed + 0.01)!.t;
    const boosted = samples.find((s) => s.v >= H.maxSpeed * H.boostFactor - 0.05)!.t;
    expect(boosted - collectedAt).toBeLessThan(0.5);
    expect(race.horses[0].boost).toBe(0);
  });

  it('knocking down a jump really stops the horse for a moment, then it runs again', () => {
    const { samples, race } = speeds(straight(300, [{ at: 30, type: 'wall' }]), 10);
    const hitAt = race.obstacles[0][0].changedAt;
    const standing = samples.filter((s) => s.t > hitAt + 0.3 && s.t < hitAt + H.faultStopSeconds - 0.05);
    expect(standing.length).toBeGreaterThan(10);
    expect(Math.max(...standing.map((s) => s.v))).toBeLessThan(0.3);
    expect(samples.at(-1)!.v).toBeCloseTo(H.maxSpeed, 1);
  });

  it('hitting a cone also stops the horse', () => {
    const { samples, race } = speeds(straight(300, [{ at: 30, type: 'cone', lateral: 0 }]), 6);
    const hitAt = race.obstacles[0][0].changedAt;
    const after = samples.find((s) => s.t > hitAt + 0.4)!;
    expect(after.v).toBeLessThan(0.3);
  });

  it('a fault ends a running turbo', () => {
    const { race } = speeds(straight(300, [{ at: 20, type: 'carrot', lateral: 0 }, { at: 25, type: 'fence' }]), 3.5);
    expect(race.horses[0].faults).toBe(1);
    expect(race.horses[0].boost).toBe(0);
  });

  it('by default the ranking is the plain finish time (no hidden bonus or penalty)', () => {
    const race = new Race(new Track(straight(60)), 2, cfg());
    ride(race, 30, (p) => input({ drive: [1, 0.8][p] }));
    race.horses[1].carrots = 10;
    race.horses[0].faults = 3;
    const res = race.results();
    expect(res[0].score).toBe(res[0].time);
    expect(res[0].rank).toBe(1);
  });
});

describe('Race – remembered jump (regression: horse hung in the air, then dropped)', () => {
  const fenceAt = 40;
  const JA = CONFIG.jumpAssist;

  /** Jumps `early` m before the fence, then stops bouncing (drive 0) like a child after jumping. */
  function earlyJumpThenStop(early: number) {
    const race = new Race(new Track(straight(120, [{ at: fenceAt, type: 'hedge' }])), 1, cfg());
    race.horses[0].speed = CONFIG.horse.maxSpeed;
    let jumped = false;
    const frames: { t: number; s: number; h: number; air: boolean }[] = [];
    ride(race, 10, (p, r) => {
      const horse = r.horses[p];
      const jump = !jumped && fenceAt - horse.s <= early;
      if (jump) jumped = true;
      frames.push({ t: r.time, s: horse.s, h: horse.height, air: horse.airborne });
      return input({ drive: jumped ? 0 : 1, jump });
    });
    return { race, frames };
  }

  it('an early jump is remembered: the horse takes off by itself close to the obstacle', () => {
    const { race, frames } = earlyJumpThenStop(8.5);
    const takeoff = frames.find((f) => f.air)!;
    expect(fenceAt - takeoff.s).toBeLessThan(4);
    expect(fenceAt - takeoff.s).toBeGreaterThan(0.5);
    expect(race.obstacles[0][0].result).toBe('cleared');
  });

  it('never hangs in the air: the flight lasts the fixed air time, even without bouncing', () => {
    const { frames } = earlyJumpThenStop(8.5);
    const airborne = frames.filter((f) => f.air);
    const flight = airborne.at(-1)!.t - airborne[0].t;
    expect(flight).toBeLessThanOrEqual(JA.airTime + 0.05);
  });

  it('never drops abruptly: the height changes smoothly and lands from low height', () => {
    for (const early of [8.5, 6, 3, 1]) {
      const { frames } = earlyJumpThenStop(early);
      for (let k = 1; k < frames.length; k++) {
        expect(Math.abs(frames[k].h - frames[k - 1].h), `jump ${early} m before`).toBeLessThan(0.2);
      }
    }
  });

  it('passes the obstacle high in the air, also for late jumps', () => {
    for (const early of [8.5, 2, 0.4]) {
      const race = new Race(new Track(straight(120, [{ at: fenceAt, type: 'wall' }])), 1, cfg());
      race.horses[0].speed = CONFIG.horse.maxSpeed;
      let jumped = false;
      let heightAtFence = 0;
      ride(race, 8, (p, r) => {
        const horse = r.horses[p];
        if (Math.abs(horse.s - fenceAt) < 0.2) heightAtFence = Math.max(heightAtFence, horse.height);
        const jump = !jumped && fenceAt - horse.s <= early;
        if (jump) jumped = true;
        return input({ drive: 1, jump });
      });
      expect(race.obstacles[0][0].result, `jump ${early} m before`).toBe('cleared');
      if (early > 1) expect(heightAtFence, `jump ${early} m before`).toBeGreaterThan(CONFIG.obstacles.fenceHeight);
    }
  });

  it('a slow horse takes off closer and does not speed up in the air', () => {
    const race = new Race(new Track(straight(120, [{ at: fenceAt, type: 'fence' }])), 1, cfg());
    race.horses[0].speed = 4;
    let jumped = false;
    let maxAirSpeed = 0;
    ride(race, 12, (p, r) => {
      const horse = r.horses[p];
      if (horse.airborne) maxAirSpeed = Math.max(maxAirSpeed, horse.speed);
      const jump = !jumped && fenceAt - horse.s <= 7;
      if (jump) jumped = true;
      return input({ drive: 0.45, jump });
    });
    expect(race.obstacles[0][0].result).toBe('cleared');
    expect(maxAirSpeed).toBeLessThan(5);
  });
});
