import { parse as parseYaml } from 'yaml';
import { isJump, JUMP_TYPES, type CourseDef, type ObstacleDef, type ObstacleType, type SegmentDef } from './track';

/**
 * Course files (courses/*.yaml) – see courses/README.md for the format.
 * This module validates them and converts them into the internal CourseDef.
 */

export const LANGUAGES = ['de', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export type Localized = Record<Language, string>;

export const OBSTACLE_TYPES: readonly ObstacleType[] = [...JUMP_TYPES, 'cone', 'carrot'];

export interface CourseInfo {
  /** File name without extension. */
  id: string;
  name: Localized;
  description: Localized;
  /** Sort order in the course list (lower first). */
  order: number;
  def: CourseDef;
}

export class CourseFormatError extends Error {
  constructor(courseId: string, path: string, message: string) {
    super(`Course "${courseId}"${path ? ` at ${path}` : ''}: ${message}`);
    this.name = 'CourseFormatError';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Small validation helper that knows the current path for error messages. */
class Reader {
  constructor(
    private readonly id: string,
    readonly path: string,
  ) {}

  fail(message: string): never {
    throw new CourseFormatError(this.id, this.path, message);
  }

  at(key: string | number): Reader {
    const p = typeof key === 'number' ? `${this.path}[${key}]` : this.path ? `${this.path}.${key}` : key;
    return new Reader(this.id, p);
  }

  object(v: unknown, allowed: readonly string[]): Obj {
    if (!isObj(v)) this.fail('expected an object');
    for (const k of Object.keys(v)) {
      if (!allowed.includes(k)) this.fail(`unknown key "${k}" (allowed: ${allowed.join(', ')})`);
    }
    return v;
  }

  number(v: unknown, min: number, max: number): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) this.fail('expected a number');
    if (v < min || v > max) this.fail(`must be between ${min} and ${max}, got ${v}`);
    return v;
  }

  integer(v: unknown, min: number, max: number): number {
    const n = this.number(v, min, max);
    if (!Number.isInteger(n)) this.fail('expected a whole number');
    return n;
  }

  oneOf<T extends string>(v: unknown, options: readonly T[]): T {
    if (typeof v !== 'string' || !options.includes(v as T)) this.fail(`expected one of: ${options.join(', ')}`);
    return v as T;
  }

  /** A text, either the same for all languages or one per language. */
  localized(v: unknown): Localized {
    if (typeof v === 'string') return { de: v, en: v };
    const o = this.object(v, LANGUAGES);
    const out = {} as Localized;
    for (const lang of LANGUAGES) {
      const text = o[lang];
      if (typeof text === 'string' && text.trim()) out[lang] = text;
      else this.at(lang).fail('expected a text');
    }
    return out;
  }

  array(v: unknown): unknown[] {
    if (!Array.isArray(v)) this.fail('expected a list');
    return v;
  }
}

const TOP_KEYS = ['name', 'description', 'order', 'width', 'grass', 'segments'] as const;
const STRAIGHT_KEYS = ['straight', 'carrots', 'obstacles'] as const;
const CURVE_KEYS = ['curve', 'angle', 'radius', 'carrots', 'obstacles'] as const;
const OBSTACLE_KEYS = ['at', 'type', 'lateral'] as const;

export interface CourseStats {
  /** Total length in m. */
  length: number;
  jumps: number;
  curves: number;
}

/** Key facts for the course selection. */
export function courseStats(def: CourseDef): CourseStats {
  let length = 0;
  let jumps = 0;
  let curves = 0;
  for (const s of def.segments) {
    length += s.kind === 'straight' ? s.length : (Math.abs(s.angle) * Math.PI * s.radius) / 180;
    if (s.kind === 'curve') curves++;
    jumps += (s.obstacles ?? []).filter((o) => isJump(o.type)).length;
  }
  return { length, jumps, curves };
}

/** Parses the YAML text of a course file. */
export function parseCourse(id: string, yamlText: string): CourseInfo {
  let data: unknown;
  try {
    data = parseYaml(yamlText);
  } catch (err) {
    throw new CourseFormatError(id, '', `invalid YAML – ${err instanceof Error ? err.message : String(err)}`);
  }
  return courseFromData(id, data);
}

/** Validates already parsed data and converts it into a CourseInfo. */
export function courseFromData(id: string, data: unknown): CourseInfo {
  const r = new Reader(id, '');
  const top = r.object(data, TOP_KEYS);

  const name = r.at('name').localized(top.name);
  const description = top.description === undefined ? { de: '', en: '' } : r.at('description').localized(top.description);
  const order = top.order === undefined ? 100 : r.at('order').number(top.order, -1e6, 1e6);
  const width = top.width === undefined ? 7 : r.at('width').number(top.width, 3, 20);
  const grass = top.grass === undefined ? 4 : r.at('grass').number(top.grass, 0, 15);
  const halfWidth = width / 2;
  const railOffset = halfWidth + grass;

  const list = r.at('segments').array(top.segments);
  if (list.length === 0) r.at('segments').fail('needs at least one segment');
  const segments = list.map((raw, i) => readSegment(r.at('segments').at(i), raw, halfWidth, railOffset));

  return { id, name, description, order, def: { halfWidth, shoulder: grass, segments } };
}

function readSegment(r: Reader, raw: unknown, halfWidth: number, railOffset: number): SegmentDef {
  if (!isObj(raw)) r.fail('expected an object with "straight" or "curve"');
  let seg: SegmentDef;
  let length: number;
  let carrotLateral: number;

  if ('straight' in raw) {
    const o = r.object(raw, STRAIGHT_KEYS);
    length = r.at('straight').number(o.straight, 1, 2000);
    seg = { kind: 'straight', length };
    carrotLateral = 0;
  } else if ('curve' in raw) {
    const o = r.object(raw, CURVE_KEYS);
    const dir = r.at('curve').oneOf(o.curve, ['left', 'right'] as const);
    const angle = r.at('angle').number(o.angle, 1, 360);
    // The inner rail must not collapse: radius has to be clearly larger than the rail offset.
    const radius = r.at('radius').number(o.radius, railOffset + 2, 1000);
    const sign = dir === 'right' ? 1 : -1;
    seg = { kind: 'curve', angle: sign * angle, radius };
    length = (angle * Math.PI * radius) / 180;
    // Carrots go on the inner side of the curve – a reward for leaning into it.
    carrotLateral = sign * Math.min(2, halfWidth - 0.5);
  } else {
    r.fail('a segment needs either "straight: <length>" or "curve: left|right"');
  }

  const obstacles: ObstacleDef[] = [];
  if (raw.carrots !== undefined) {
    const n = r.at('carrots').integer(raw.carrots, 0, 50);
    for (let i = 0; i < n; i++) obstacles.push({ at: (length * (i + 1)) / (n + 1), type: 'carrot', lateral: carrotLateral });
  }
  if (raw.obstacles !== undefined) {
    r.at('obstacles').array(raw.obstacles).forEach((o, i) => {
      const or = r.at('obstacles').at(i);
      const ob = or.object(o, OBSTACLE_KEYS);
      const at = or.at('at').number(ob.at, 0, length);
      const type = or.at('type').oneOf(ob.type, OBSTACLE_TYPES);
      const lateral = ob.lateral === undefined ? 0 : or.at('lateral').number(ob.lateral, -halfWidth, halfWidth);
      obstacles.push({ at, type, lateral });
    });
  }
  if (obstacles.length > 0) seg.obstacles = obstacles;
  return seg;
}
