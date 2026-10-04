/**
 * Track geometry: a course is a chain of straights and circular arcs on the
 * ground plane. Positions along the track are addressed by
 *   s       – distance along the center line (m)
 *   lateral – sideways offset from the center line (m, positive = right)
 *
 * World coordinates: x/z ground plane, y up. Heading 0 looks along -z;
 * positive heading turns right (clockwise seen from above).
 */

/** Jump obstacles: all behave the same, they only look different. */
export const JUMP_TYPES = ['fence', 'wall', 'hedge', 'water'] as const;
export type JumpType = (typeof JUMP_TYPES)[number];
export type ObstacleType = JumpType | 'cone' | 'carrot';

export const isJump = (type: ObstacleType): type is JumpType => (JUMP_TYPES as readonly string[]).includes(type);

export interface ObstacleDef {
  /** Distance from the start of the segment (m). */
  at: number;
  type: ObstacleType;
  /** Sideways offset; ignored for fences (they span the whole track). */
  lateral?: number;
}

interface SegmentBase {
  obstacles?: ObstacleDef[];
}
export interface StraightDef extends SegmentBase {
  kind: 'straight';
  length: number;
}
export interface CurveDef extends SegmentBase {
  kind: 'curve';
  /** Turn angle in degrees; positive = right, negative = left. */
  angle: number;
  radius: number;
}
export type SegmentDef = StraightDef | CurveDef;

export interface CourseDef {
  /** Half width of the sand track (m). */
  halfWidth: number;
  /** Grass strip between sand and rails (m). Horses can go there, but slower. */
  shoulder: number;
  segments: SegmentDef[];
}

export interface TrackObstacle {
  id: number;
  s: number;
  type: ObstacleType;
  lateral: number;
}

export interface TrackSample {
  x: number;
  z: number;
  heading: number;
  /** Signed curvature 1/r (positive = right turn), 0 on straights. */
  curvature: number;
}

export interface SegmentRange {
  start: number;
  end: number;
  def: SegmentDef;
}

export const forwardOf = (heading: number) => ({ x: Math.sin(heading), z: -Math.cos(heading) });
export const rightOf = (heading: number) => ({ x: Math.cos(heading), z: Math.sin(heading) });

export function segmentLength(def: SegmentDef): number {
  return def.kind === 'straight' ? def.length : (Math.abs(def.angle) * Math.PI * def.radius) / 180;
}

export class Track {
  static readonly STEP = 0.5;

  /** Length of the run-out behind the finish line (m). */
  static readonly RUN_OUT = 30;

  /** Distance from start to the finish line (m). */
  readonly length: number;
  /** Length including the run-out behind the finish (m). */
  readonly totalLength: number;
  readonly halfWidth: number;
  readonly shoulder: number;
  readonly samples: TrackSample[] = [];
  readonly obstacles: TrackObstacle[] = [];
  readonly segments: SegmentRange[] = [];
  readonly bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  /** Distance along the track for each entry in `samples`. */
  private readonly sampleS: number[] = [];

  constructor(course: CourseDef) {
    this.halfWidth = course.halfWidth;
    this.shoulder = course.shoulder;

    let x = 0;
    let z = 0;
    let heading = 0;
    let s = 0;
    const step = Track.STEP;
    this.pushSample(0, x, z, heading, 0);

    for (const def of course.segments) {
      const len = segmentLength(def);
      const curvature = def.kind === 'curve' ? (Math.sign(def.angle) / def.radius) : 0;
      this.segments.push({ start: s, end: s + len, def });
      for (const o of def.obstacles ?? []) {
        this.obstacles.push({ id: 0, s: s + o.at, type: o.type, lateral: isJump(o.type) ? 0 : (o.lateral ?? 0) });
      }

      const steps = Math.max(1, Math.round(len / step));
      const ds = len / steps;
      for (let i = 0; i < steps; i++) {
        // Midpoint integration keeps arcs exact enough at this step size.
        const mid = heading + (curvature * ds) / 2;
        x += Math.sin(mid) * ds;
        z -= Math.cos(mid) * ds;
        heading += curvature * ds;
        this.pushSample(s + (i + 1) * ds, x, z, heading, curvature);
      }
      s += len;
    }
    this.length = s;
    // The first sample carries the curvature of the first segment.
    if (this.samples.length > 1) this.samples[0].curvature = this.samples[1].curvature;

    // Straight run-out behind the finish line, so horses can gallop out naturally.
    const runSteps = Math.round(Track.RUN_OUT / step);
    for (let i = 1; i <= runSteps; i++) {
      x += Math.sin(heading) * step;
      z -= Math.cos(heading) * step;
      this.pushSample(s + i * step, x, z, heading, 0);
    }
    this.totalLength = s + runSteps * step;

    this.obstacles.sort((a, b) => a.s - b.s);
    this.obstacles.forEach((o, i) => (o.id = i));
  }

  /** Interpolated center-line sample at distance `s` (clamped to start and end of the run-out). */
  sample(s: number): TrackSample {
    const target = Math.min(Math.max(s, 0), this.totalLength);
    // Binary search for the last sample with sampleS <= target.
    let lo = 0;
    let hi = this.sampleS.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.sampleS[mid] <= target) lo = mid;
      else hi = mid;
    }
    const a = this.samples[lo];
    const b = this.samples[hi];
    const span = this.sampleS[hi] - this.sampleS[lo];
    const t = span > 0 ? (target - this.sampleS[lo]) / span : 0;
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      heading: a.heading + (b.heading - a.heading) * t,
      // Curvature belongs to the interval (a, b], which is stored on b.
      curvature: b.curvature,
    };
  }

  /** World position on the ground for a track position. */
  toWorld(s: number, lateral: number): { x: number; z: number; heading: number } {
    const p = this.sample(s);
    const r = rightOf(p.heading);
    return { x: p.x + r.x * lateral, z: p.z + r.z * lateral, heading: p.heading };
  }

  /** Lateral position of the rails; horses cannot go beyond it. */
  get railOffset(): number {
    return this.halfWidth + this.shoulder;
  }

  /** Approximate distance from a world point to the center line (for scenery placement). */
  distanceToCenterLine(x: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i < this.samples.length; i += 2) {
      const p = this.samples[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  private pushSample(s: number, x: number, z: number, heading: number, curvature: number): void {
    this.sampleS.push(s);
    this.samples.push({ x, z, heading, curvature });
    this.bounds.minX = Math.min(this.bounds.minX, x);
    this.bounds.maxX = Math.max(this.bounds.maxX, x);
    this.bounds.minZ = Math.min(this.bounds.minZ, z);
    this.bounds.maxZ = Math.max(this.bounds.maxZ, z);
  }
}
