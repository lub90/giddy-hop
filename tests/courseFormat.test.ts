import { describe, expect, it } from 'vitest';
import { courseStats, parseCourse } from '../src/game/courseFormat';
import { loadCourses } from '../src/game/courses';

const minimal = `
name: Test
segments:
  - straight: 20
`;

describe('Course format', () => {
  it('parses a minimal course with defaults', () => {
    const c = parseCourse('t', minimal);
    expect(c.name).toEqual({ de: 'Test', en: 'Test' });
    expect(c.def.halfWidth).toBe(3.5);
    expect(c.def.shoulder).toBe(4);
    expect(c.def.segments).toEqual([{ kind: 'straight', length: 20 }]);
  });

  it('converts curves (left = negative angle) and puts carrot shorthands on the inner side', () => {
    const c = parseCourse('t', `
name: { de: Kurve, en: Curve }
segments:
  - curve: left
    angle: 90
    radius: 20
    carrots: 2
  - curve: right
    angle: 45
    radius: 30
    carrots: 1
`);
    const [left, right] = c.def.segments;
    expect(left).toMatchObject({ kind: 'curve', angle: -90, radius: 20 });
    expect(left.obstacles!.every((o) => o.type === 'carrot' && o.lateral! < 0)).toBe(true);
    expect(right.obstacles![0].lateral).toBeGreaterThan(0);
  });

  it('reads obstacles with position and side', () => {
    const c = parseCourse('t', `
name: X
segments:
  - straight: 30
    obstacles:
      - { at: 10, type: fence }
      - { at: 20, type: cone, lateral: -1.5 }
`);
    expect(c.def.segments[0].obstacles).toEqual([
      { at: 10, type: 'fence', lateral: 0 },
      { at: 20, type: 'cone', lateral: -1.5 },
    ]);
  });

  it('computes the facts shown in the course selection', () => {
    const c = parseCourse('t', `
name: X
segments:
  - straight: 100
    obstacles: [{ at: 50, type: fence }]
  - curve: right
    angle: 180
    radius: 20
`);
    const s = courseStats(c.def);
    expect(s.length).toBeCloseTo(100 + Math.PI * 20, 6);
    expect(s).toMatchObject({ jumps: 1, curves: 1 });
  });

  describe('reports mistakes with their location', () => {
    const errorOf = (yaml: string) => {
      try {
        parseCourse('broken', yaml);
      } catch (e) {
        return (e as Error).message;
      }
      return 'no error';
    };

    it.each([
      ['unknown top-level key', 'name: X\nlenght: 3\nsegments: [{ straight: 10 }]', 'unknown key "lenght"'],
      ['missing segments', 'name: X', 'segments: expected a list'],
      ['segment without type', 'name: X\nsegments: [{ angle: 3 }]', 'segments[0]: a segment needs'],
      ['wrong curve direction', 'name: X\nsegments: [{ curve: up, angle: 90, radius: 30 }]', 'segments[0].curve: expected one of: left, right'],
      ['radius too small', 'name: X\nsegments: [{ curve: left, angle: 90, radius: 5 }]', 'segments[0].radius: must be between'],
      ['obstacle beyond segment', 'name: X\nsegments: [{ straight: 10, obstacles: [{ at: 20, type: fence }] }]', 'segments[0].obstacles[0].at'],
      ['unknown obstacle', 'name: X\nsegments: [{ straight: 10, obstacles: [{ at: 5, type: dragon }] }]', 'obstacles[0].type: expected one of'],
      ['obstacle off the sand', 'name: X\nsegments: [{ straight: 10, obstacles: [{ at: 5, type: cone, lateral: 9 }] }]', 'lateral: must be between'],
      ['missing translation', 'name: { de: Nur Deutsch }\nsegments: [{ straight: 10 }]', 'name.en: expected a text'],
      ['invalid YAML', 'name: [unclosed', 'invalid YAML'],
    ])('%s', (_label, yaml, message) => {
      const err = errorOf(yaml);
      expect(err).toContain('Course "broken"');
      expect(err).toContain(message);
    });
  });

  it('skips broken files when loading and sorts the rest by order', () => {
    const errors: unknown[] = [];
    const courses = loadCourses(
      {
        '/courses/b.yaml': 'name: B\norder: 2\nsegments: [{ straight: 10 }]',
        '/courses/a.yaml': 'name: A\norder: 1\nsegments: [{ straight: 10 }]',
        '/courses/broken.yaml': 'name: X',
      },
      (e) => errors.push(e),
    );
    expect(courses.map((c) => c.id)).toEqual(['a', 'b']);
    expect(errors).toHaveLength(1);
  });
});

describe('Course format – jump types', () => {
  it('accepts fence, wall, hedge and water as jumps and counts them', () => {
    const c = parseCourse('t', `
name: X
segments:
  - straight: 100
    obstacles:
      - { at: 10, type: fence }
      - { at: 30, type: wall }
      - { at: 50, type: hedge }
      - { at: 70, type: water }
`);
    expect(c.def.segments[0].obstacles!.map((o) => o.type)).toEqual(['fence', 'wall', 'hedge', 'water']);
    expect(courseStats(c.def).jumps).toBe(4);
  });
});
