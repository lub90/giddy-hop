import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/game/courses';
import { courseStats } from '../src/game/courseFormat';
import { isJump, Track, rightOf, segmentLength, type CourseDef } from '../src/game/track';

describe('Courses – every file in courses/ is a valid, rideable course', () => {
  it('finds at least two courses for the menu', () => {
    expect(COURSES.filter((c) => !c.hidden).length).toBeGreaterThanOrEqual(2);
  });

  it('the e2e test sprint is hidden from the menu', () => {
    expect(COURSES.find((c) => c.id === 'test-sprint')?.hidden).toBe(true);
  });

  for (const course of COURSES) {
    describe(course.id, () => {
      const def = course.def;
      const track = new Track(def);

      it('has names and descriptions in German and English', () => {
        expect(course.name.de).toBeTruthy();
        expect(course.name.en).toBeTruthy();
      });

      it('has the expected length', () => {
        const sum = def.segments.reduce((a, s) => a + segmentLength(s), 0);
        expect(track.length).toBeCloseTo(sum, 6);
      });

      if (!course.hidden) {
        it('is a real course for the menu: longer than 100 m', () => {
          expect(track.length).toBeGreaterThan(100);
        });
      }

      it('places obstacles on the track, sorted by distance, with unique ids', () => {
        for (let i = 0; i < track.obstacles.length; i++) {
          const o = track.obstacles[i];
          expect(o.id).toBe(i);
          expect(o.s).toBeGreaterThan(0);
          expect(o.s).toBeLessThan(track.length);
          expect(Math.abs(o.lateral)).toBeLessThan(track.halfWidth);
          if (i > 0) expect(o.s).toBeGreaterThanOrEqual(track.obstacles[i - 1].s);
        }
      });

      it('never crosses or touches itself (rails of distant sections stay apart)', () => {
        const minGap = 2 * track.railOffset + 4;
        const pts = track.samples;
        // Riding the very same lane again in the same direction is fine (a lap on a
        // racetrack ends on its own home straight); crossing or running alongside is not.
        const sameLane = (a: (typeof pts)[number], b: (typeof pts)[number], d: number) => {
          const turn = Math.abs(Math.atan2(Math.sin(a.heading - b.heading), Math.cos(a.heading - b.heading)));
          return d < 0.5 && turn < 0.05;
        };
        // A lap course comes back to its start: then sections are neighbours across the seam, too.
        const lap = pts.findIndex(
          (p, k) => k * Track.STEP > minGap * 2.5 && sameLane(pts[0], p, Math.hypot(p.x - pts[0].x, p.z - pts[0].z)),
        );
        for (let i = 0; i < pts.length; i += 4) {
          for (let j = i + 4; j < pts.length; j += 4) {
            // Only compare sections that are far apart along the track (or along the lap).
            const apart = lap > 0 ? Math.min(j - i, Math.abs(i + lap - j)) : j - i;
            if (apart * Track.STEP < minGap * 2.5) continue;
            const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
            if (sameLane(pts[i], pts[j], d)) continue;
            expect(d, `samples ${i} / ${j}`).toBeGreaterThan(minGap);
          }
        }
      });

      it('ends with the heading given by the sum of all curve angles', () => {
        const total = def.segments.reduce((a, s) => a + (s.kind === 'curve' ? s.angle : 0), 0);
        expect(track.sample(track.length).heading).toBeCloseTo((total * Math.PI) / 180, 6);
      });
    });
  }

  it('the grand parcours has curves to both sides and every obstacle type', () => {
    const grand = COURSES.find((c) => c.id === 'grand-parcours')!;
    const angles = grand.def.segments.flatMap((s) => (s.kind === 'curve' ? [s.angle] : []));
    expect(angles.some((a) => a > 0)).toBe(true);
    expect(angles.some((a) => a < 0)).toBe(true);
    const types = new Set(new Track(grand.def).obstacles.map((o) => o.type));
    expect([...types].sort()).toEqual(['carrot', 'cone', 'fence', 'hedge', 'wall', 'water']);
  });
});

describe('Track – geometry', () => {
  const simple: CourseDef = {
    halfWidth: 3,
    shoulder: 1,
    segments: [
      { kind: 'straight', length: 10 },
      { kind: 'curve', angle: 90, radius: 10 },
    ],
  };
  const t = new Track(simple);

  it('starts at the origin heading along -z', () => {
    const p = t.sample(5);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(-5, 6);
    expect(p.curvature).toBe(0);
  });

  it('builds an exact right-hand arc', () => {
    const end = t.sample(t.length);
    expect(end.x).toBeCloseTo(10, 2);
    expect(end.z).toBeCloseTo(-20, 2);
    expect(end.heading).toBeCloseTo(Math.PI / 2, 6);
    expect(t.sample(15).curvature).toBeCloseTo(0.1, 6);
  });

  it('places positive lateral offsets on the right-hand side', () => {
    const w = t.toWorld(5, 2);
    expect(w.x).toBeCloseTo(2, 6);
    const r = rightOf(0);
    expect(r.x).toBe(1);
  });

  it('clamps samples before the start and after the run-out', () => {
    expect(t.sample(-5)).toEqual(t.sample(0));
    expect(t.sample(1e6)).toEqual(t.sample(t.totalLength));
  });

  it('has a straight run-out behind the finish line (finish distance unchanged)', () => {
    expect(t.length).toBeCloseTo(10 + (Math.PI * 10) / 2, 6);
    expect(t.totalLength).toBeCloseTo(t.length + Track.RUN_OUT, 6);
    const finish = t.sample(t.length);
    const end = t.sample(t.totalLength);
    // Continues straight in the final heading (here: +x after the right turn).
    expect(end.heading).toBeCloseTo(finish.heading, 6);
    expect(end.x - finish.x).toBeCloseTo(Track.RUN_OUT, 1);
    expect(end.curvature).toBe(0);
  });
});

describe('Courses – show jumping and racetrack', () => {
  const byId = (id: string) => {
    const c = COURSES.find((x) => x.id === id);
    if (!c) throw new Error(`course ${id} missing`);
    return { course: c, track: new Track(c.def) };
  };
  const grand = byId('grand-parcours').track;

  it('all courses are offered in their order, the practice courses last', () => {
    expect(COURSES.filter((c) => !c.hidden).map((c) => c.id)).toEqual([
      'grand-parcours',
      'pony-loop',
      'show-jumping',
      'racetrack',
      'gallop-straight',
      'curve-snake',
    ]);
  });

  it('the jump courses have jumps', () => {
    for (const id of ['grand-parcours', 'pony-loop', 'show-jumping', 'racetrack']) {
      expect(byId(id).track.obstacles.some((o) => isJump(o.type))).toBe(true);
    }
  });

  it('gallop straight: only straight ahead, nothing on the track', () => {
    const { track, course } = byId('gallop-straight');
    expect(track.obstacles).toHaveLength(0);
    expect(courseStats(course.def).curves).toBe(0);
    expect(track.length).toBeGreaterThanOrEqual(100);
  });

  it('curve snake: left and right curves, nothing on the track', () => {
    const { track, course } = byId('curve-snake');
    expect(track.obstacles).toHaveLength(0);
    const curves = course.def.segments.filter((s) => s.kind === 'curve');
    expect(curves.length).toBeGreaterThanOrEqual(4);
    expect(new Set(curves.map((s) => (s.kind === 'curve' ? Math.sign(s.angle) : 0))).size).toBe(2);
  });

  it('show jumping: longer than the longest course so far, more jumps, at least two double jumps', () => {
    const { track } = byId('show-jumping');
    const jumps = track.obstacles.filter((o) => isJump(o.type));
    expect(track.length).toBeGreaterThan(grand.length);
    expect(jumps.length).toBeGreaterThan(grand.obstacles.filter((o) => isJump(o.type)).length);
    // Double jump: the next obstacle comes right after landing.
    const doubles = jumps.filter((o, i) => i > 0 && o.s - jumps[i - 1].s <= 12);
    expect(doubles.length).toBeGreaterThanOrEqual(2);
  });

  it('racetrack: one lap of an oval, finish just behind the start', () => {
    const { course, track } = byId('racetrack');
    const start = track.sample(0);
    const finish = track.sample(track.length);
    expect(Math.hypot(finish.x - start.x, finish.z - start.z)).toBeLessThan(20);
    const curves = course.def.segments.filter((s) => s.kind === 'curve');
    expect(curves).toHaveLength(2);
    expect(curves.every((c) => c.kind === 'curve' && Math.abs(c.angle) === 180)).toBe(true);
  });

  it('racetrack: about as long as show jumping, only 1–2 obstacles per straight, none in the curves', () => {
    const { course, track } = byId('racetrack');
    const jumping = byId('show-jumping').track;
    expect(Math.abs(track.length - jumping.length) / jumping.length).toBeLessThan(0.05);
    for (const seg of course.def.segments) {
      const obstacles = (seg.obstacles ?? []).filter((o) => o.type !== 'carrot');
      if (seg.kind === 'curve') expect(obstacles).toHaveLength(0);
      else expect(obstacles.length).toBeLessThanOrEqual(2);
    }
    expect(track.obstacles.filter((o) => o.type !== 'carrot').length).toBeLessThanOrEqual(4);
  });
});
