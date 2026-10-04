import { CONFIG, type GallopConfig, type JumpConfig, type SteerConfig } from '../config';
import { clamp, damp, lerp } from '../core/math';
import { bodyMetrics, type DetectedPose } from '../pose/poseTypes';
import type { PlayerInput } from './playerInput';

export interface GestureConfig {
  steer: SteerConfig;
  gallop: GallopConfig;
  jump: JumpConfig;
}

interface Sample {
  t: number;
  y: number;
}

/** Largest gap between two pose frames over which a velocity is still computed. */
const MAX_VELOCITY_GAP = 0.3;

/**
 * Translates a player's body posture into game input:
 *  - Steer:  sideways lean = offset of shoulder center vs. hip center
 *  - Speed:  "bounce energy" = vertical distance travelled by the torso per second.
 *            Works for rocking back and forth as well as for hopping.
 *  - Jump:   fast upward movement of the torso above a threshold
 *
 * All quantities are measured in torso lengths, so they do not depend on how
 * tall a child is or how far away from the camera they stand.
 */
export class GestureAnalyzer {
  steer = 0;
  drive = 0;
  /** Bounce energy in torso lengths per second (for debug display and tuning). */
  energy = 0;
  /** Latest upward velocity in torso lengths per second. */
  upVelocity = 0;
  /** Highest upward velocity since the last reset (helps tuning the threshold). */
  peakUpVelocity = 0;
  tracked = false;
  lastSeen = Number.NEGATIVE_INFINITY;

  private samples: Sample[] = [];
  private smoothY: number | null = null;
  private rawY: number | null = null;
  private torso: number | null = null;
  private lastTime: number | null = null;
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
      this.drive = damp(this.drive, 0, this.cfg.gallop.responsePerSecond, dt);
      this.upVelocity = 0;
      this.rawY = null;
      return;
    }
    this.tracked = true;
    this.lastSeen = t;
    this.torso = this.torso === null ? m.torsoLength : lerp(this.torso, m.torsoLength, 0.1);

    this.updateSteer((m.shoulderMid.x - m.hipMid.x) / m.shoulderWidth);

    const y = (m.shoulderMid.y + m.hipMid.y) / 2 / this.torso;
    this.updateJump(y, dt, t);
    this.updateGallop(y, dt, t);
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
    this.energy = 0;
    this.upVelocity = 0;
    this.peakUpVelocity = 0;
    this.samples = [];
    this.smoothY = null;
    this.rawY = null;
    this.jumpPending = false;
    this.lastJumpAt = Number.NEGATIVE_INFINITY;
  }

  private updateSteer(lean: number): void {
    const { gain, deadzone, smoothing } = this.cfg.steer;
    const beyond = Math.max(0, Math.abs(lean) - deadzone);
    const target = clamp(Math.sign(lean) * beyond * gain, -1, 1);
    this.steer = lerp(this.steer, target, smoothing);
  }

  private updateJump(y: number, dt: number, t: number): void {
    const prev = this.rawY;
    this.rawY = y;
    if (prev === null || dt <= 0 || dt > MAX_VELOCITY_GAP) {
      this.upVelocity = 0;
      return;
    }
    // Image y points down → moving up = decreasing y.
    this.upVelocity = (prev - y) / dt;
    this.peakUpVelocity = Math.max(this.peakUpVelocity, this.upVelocity);
    const { upVelocityThreshold, cooldownSeconds } = this.cfg.jump;
    if (this.upVelocity > upVelocityThreshold && t - this.lastJumpAt >= cooldownSeconds) {
      this.jumpPending = true;
      this.lastJumpAt = t;
    }
  }

  private updateGallop(y: number, dt: number, t: number): void {
    const g = this.cfg.gallop;
    this.smoothY = this.smoothY === null ? y : lerp(this.smoothY, y, g.positionSmoothing);
    this.samples.push({ t, y: this.smoothY });
    while (this.samples.length > 0 && this.samples[0].t < t - g.windowSeconds) this.samples.shift();

    let path = 0;
    for (let i = 1; i < this.samples.length; i++) path += Math.abs(this.samples[i].y - this.samples[i - 1].y);
    this.energy = path / g.windowSeconds;

    const target = clamp((this.energy - g.energyMin) / (g.energyFull - g.energyMin), 0, 1);
    this.drive = damp(this.drive, target, g.responsePerSecond, dt);
  }
}
