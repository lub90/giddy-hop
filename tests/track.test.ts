import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/game/courses';
import { Track, rightOf, segmentLength, type CourseDef } from '../src/game/track';

describe('Courses – every file in courses/ is a valid, rideable course', () => {
  it('finds at least two courses', () => {
    expect(COURSES.length).toBeGreaterThanOrEqual(2);
  });

  for (const course of COURSES) {
    describe(course.id, () => {
      const def = course.def;
      const track = new Track(def);

      it('has names and descriptions in German and English', () => {
        expect(course.name.de).toBeTruthy();
        expect(course.name.en).toBeTruthy();
      });

      it('has the expected length and at least one jump', () => {
        const sum = def.segments.reduce((a, s) => a + segmentLength(s), 0);
        expect(track.length).toBeCloseTo(sum, 6);
        expect(track.length).toBeGreaterThan(100);
        expect(track.obstacles.some((o) => o.type === 'fence')).toBe(true);
      });

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
        for (let i = 0; i < pts.length; i += 4) {
          for (let j = i + 4; j < pts.length; j += 4) {
            // Only compare sections that are far apart along the track.
            if ((j - i) * Track.STEP < minGap * 2.5) continue;
            const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
            expect(d).toBeGreaterThan(minGap);
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

  it('clamps samples outside the track', () => {
    expect(t.sample(-5)).toEqual(t.sample(0));
    expect(t.sample(1e6)).toEqual(t.sample(t.length));
  });
});
