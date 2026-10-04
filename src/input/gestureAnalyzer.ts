import { CONFIG, type GallopConfig, type JumpConfig, type SteerConfig } from '../config';
import { clamp, damp, lerp } from '../core/math';
import { bodyMetrics, type DetectedPose } from '../pose/poseTypes';
import type { PlayerInput } from './playerInput';

export interface GestureConfig {
  steer: SteerConfig;
  gallop: GallopConfig;
  jump: JumpConfig;
}

interface HeightSample {
  t: number;
  hip: number;
  shoulder: number;
}

/** Number of recent bounce half-cycles averaged for the cadence. */
const CADENCE_HALF_CYCLES = 4;
/** Without a new bounce for this long, the cadence counts as zero. */
const CADENCE_TIMEOUT = 1.5;

/**
 * Translates a player's body posture into game input:
 *  - Steer:  sideways tilt angle of the upper body, mapped through a soft curve
 *  - Speed:  bounce cadence = how many up/down cycles per second (rocking or hopping)
 *  - Jump:   hips and shoulders rise clearly above the recent standing height
 *
 * All quantities are angles, frequencies or measured in torso lengths, so they
 * do not depend on how tall a person is (child or adult) or how far from the
 * camera they stand.
 */
export class GestureAnalyzer {
  steer = 0;
  drive = 0;
  /** Current sideways tilt of the upper body in degrees (positive = right). */
  leanDegrees = 0;
  /** Bounce cadence in cycles per second (Hz). */
  cadence = 0;
  /** Current rise above the recent standing height (torso lengths). */
  rise = 0;
  /** Highest rise since the last reset (helps tuning the jump threshold). */
  peakRise = 0;
  tracked = false;
  lastSeen = Number.NEGATIVE_INFINITY;

  private torso: number | null = null;
  private lastTime: number | null = null;

  // Gallop: turning points of the vertical bounce movement.
  private smoothY: number | null = null;
  /** +1 = body moving down (image y increasing), -1 = moving up. */
  private direction: 1 | -1 = 1;
  private extremeY = 0;
  private extremeT = 0;
  private turns: number[] = [];

  // Jump: recent heights and trigger state.
  private heights: HeightSample[] = [];
  private framesAbove = 0;
  private jumpArmed = true;
  private lastJumpAt = Number.NEGATIVE_INFINITY;
  private jumpPending = false;

  constructor(private readonly cfg: GestureConfig = CONFIG) {}

  /** Call for every new pose frame; `pose` is null when the player was not detected. */
  update(pose: DetectedPose | null, t: number): void {
    const dt = this.lastTime === null ? 0 : Math.max(0, t - this.lastTime);
    this.lastTime = t;
    const m = pose ? bodyMetrics(pose) : null;

    if (!m) {
      this.tracked = false;
      this.steer = damp(this.steer, 0, 4, dt);
      this.updateDrive(t, dt);
      this.framesAbove = 0;
      return;
    }
    this.tracked = true;
    this.lastSeen = t;
    this.torso = this.torso === null ? m.torsoLength : lerp(this.torso, m.torsoLength, 0.1);

    // Tilt angle of the upper body: horizontal shoulder offset vs. vertical torso extent.
    this.updateSteer((Math.atan2(m.shoulderMid.x - m.hipMid.x, m.torsoLength) * 180) / Math.PI);

    // Heights stay in pixels; only differences are scaled by the torso length.
    // (Dividing absolute positions by a torso length that changes while rocking
    // would make a resting hip look like it moves.)
    this.updateJump(m.hipMid.y, m.shoulderMid.y, this.torso, t);
    this.trackBounce((m.hipMid.y + m.shoulderMid.y) / 2, this.torso, t);
    this.updateDrive(t, dt);
  }

  /** Returns true exactly once per detected jump. */
  consumeJump(): boolean {
    const j = this.jumpPending;
    this.jumpPending = false;
    return j;
  }

  /** Current input (consumes a pending jump). */
  read(): PlayerInput {
    return { drive: this.drive, steer: this.steer, jump: this.consumeJump() };
  }

  reset(): void {
    this.steer = 0;
    this.drive = 0;
    this.cadence = 0;
    this.rise = 0;
    this.peakRise = 0;
    this.smoothY = null;
    this.turns = [];
    this.heights = [];
    this.framesAbove = 0;
    this.jumpArmed = true;
    this.jumpPending = false;
    this.lastJumpAt = Number.NEGATIVE_INFINITY;
  }

  /** Soft response curve: small tilts count very little, then steering rises smoothly. */
  private updateSteer(degrees: number): void {
    const { fullLeanDegrees, curveExponent, smoothing } = this.cfg.steer;
    this.leanDegrees = degrees;
    const x = Math.min(1, Math.abs(degrees) / Math.max(1, fullLeanDegrees));
    const target = Math.sign(degrees) * Math.pow(x, curveExponent);
    this.steer = lerp(this.steer, target, smoothing);
  }

  /**
   * Detects turning points of the vertical movement with hysteresis. Every
   * turning point is half a bounce cycle; small jitter below `minAmplitude`
   * is ignored.
   */
  private trackBounce(y: number, torso: number, t: number): void {
    const g = this.cfg.gallop;
    if (this.smoothY === null) {
      this.smoothY = y;
      this.extremeY = y;
      this.extremeT = t;
      return;
    }
    this.smoothY = lerp(this.smoothY, y, g.positionSmoothing);
    const v = this.smoothY;
    const h = g.minAmplitude * torso;
    const reversed = this.direction === 1 ? v < this.extremeY - h : v > this.extremeY + h;
    if (reversed) {
      this.turns.push(this.extremeT);
      if (this.turns.length > CADENCE_HALF_CYCLES + 1) this.turns.shift();
      this.direction = this.direction === 1 ? -1 : 1;
      this.extremeY = v;
      this.extremeT = t;
    } else if (this.direction === 1 ? v > this.extremeY : v < this.extremeY) {
      this.extremeY = v;
      this.extremeT = t;
    }
  }

  /** Cadence → drive, smoothed. Without new bounces the cadence fades out on its own. */
  private updateDrive(t: number, dt: number): void {
    const g = this.cfg.gallop;
    const last = this.turns[this.turns.length - 1];
    let cadence = 0;
    if (this.turns.length >= 2 && t - last < CADENCE_TIMEOUT) {
      const avgHalf = (last - this.turns[0]) / (this.turns.length - 1);
      cadence = 0.5 / Math.max(avgHalf, 0.05);
      // While no new turning point arrives, the current half cycle is at least this long.
      cadence = Math.min(cadence, 0.5 / Math.max(t - last, 1e-3));
    }
    if (this.turns.length > 0 && t - last >= CADENCE_TIMEOUT) this.turns = [];
    this.cadence = cadence;
    const target = clamp((cadence - g.cadenceMin) / (g.cadenceFull - g.cadenceMin), 0, 1);
    this.drive = damp(this.drive, target, g.responsePerSecond, dt);
  }

  /**
   * A jump is a clear rise of hips AND shoulders above the standing height of
   * the last moments, confirmed over several frames. After a jump the player
   * has to land before the next one counts.
   */
  private updateJump(hip: number, shoulder: number, torso: number, t: number): void {
    const j = this.cfg.jump;
    this.heights.push({ t, hip, shoulder });
    while (this.heights.length > 0 && this.heights[0].t < t - j.windowSeconds) this.heights.shift();

    // Image y points down: the standing (lowest) position has the largest y.
    let groundHip = hip;
    let groundShoulder = shoulder;
    for (const s of this.heights) {
      groundHip = Math.max(groundHip, s.hip);
      groundShoulder = Math.max(groundShoulder, s.shoulder);
    }
    this.rise = Math.min(groundHip - hip, groundShoulder - shoulder) / torso;
    this.peakRise = Math.max(this.peakRise, this.rise);

    if (this.rise >= j.minRise) this.framesAbove++;
    else this.framesAbove = 0;
    if (!this.jumpArmed && this.rise < j.minRise * 0.3) this.jumpArmed = true;

    if (this.jumpArmed && this.framesAbove >= j.confirmFrames && t - this.lastJumpAt >= j.cooldownSeconds) {
      this.jumpPending = true;
      this.jumpArmed = false;
      this.lastJumpAt = t;
    }
  }
}
