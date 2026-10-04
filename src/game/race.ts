import { CONFIG, type Config } from '../config';
import { approach, clamp, damp } from '../core/math';
import { NEUTRAL_INPUT, type PlayerInput } from '../input/playerInput';
import { Horse } from './horse';
import { isJump, type ObstacleType, type Track, type TrackObstacle } from './track';

export type RaceConfig = Pick<Config, 'horse' | 'jumpAssist' | 'obstacles' | 'scoring' | 'race'>;

export type ObstacleResult = 'pending' | 'cleared' | 'hit' | 'collected' | 'missed';

/** Per-player state of an obstacle (every player has their own fences and carrots). */
export interface ObstacleState {
  readonly def: TrackObstacle;
  result: ObstacleResult;
  /** Race time when the result changed (for animations). */
  changedAt: number;
}

export type SlowdownReason = 'grass' | 'rail' | null;

export type RaceEventType = 'jump' | 'jump-cleared' | 'jump-fault' | 'cone-hit' | 'carrot' | 'finish';

export interface RaceEvent {
  player: number;
  type: RaceEventType;
  time: number;
  /** The obstacle involved (for jump-cleared / jump-fault / cone-hit / carrot). */
  obstacle?: ObstacleType;
}

export interface RaceResult {
  player: number;
  finished: boolean;
  time: number | null;
  carrots: number;
  faults: number;
  /** Time + penalties − carrot bonus (lower is better); null when not finished. */
  score: number | null;
  distance: number;
  rank: number;
}

/** Lateral distance from the rail that a horse's body keeps. */
const BODY_HALF_WIDTH = 0.5;

/**
 * The race simulation for all players. Pure logic, driven by `update(dt, inputs)`.
 *
 * Steering model ("semi-guided"): horses follow the track automatically, but
 * curves carry them outwards (proportional to v²·curvature). Players lean into
 * the curve to stay on the sand; on the grass shoulder they are slower.
 */
export class Race {
  readonly horses: Horse[];
  readonly obstacles: ObstacleState[][];
  time = 0;

  private events: RaceEvent[] = [];
  private nextObstacle: number[];

  constructor(
    readonly track: Track,
    playerCount: number,
    private readonly cfg: RaceConfig = CONFIG,
  ) {
    this.horses = Array.from({ length: playerCount }, (_, i) => new Horse(Race.startLateral(i, playerCount)));
    this.obstacles = this.horses.map(() =>
      track.obstacles.map((def) => ({ def, result: 'pending' as ObstacleResult, changedAt: 0 })),
    );
    this.nextObstacle = this.horses.map(() => 0);
  }

  /** Starting positions side by side, centered on the track. */
  static startLateral(index: number, count: number): number {
    return (index - (count - 1) / 2) * 1.4;
  }

  get isOver(): boolean {
    return this.horses.every((h) => h.finished) || this.time >= this.cfg.race.timeoutSeconds;
  }

  update(dt: number, inputs: readonly PlayerInput[]): void {
    // After the race the horses keep moving (they gallop out and stop), but the
    // race clock, obstacles and the finish line no longer count.
    const over = this.isOver;
    if (!over) this.time += dt;
    this.horses.forEach((horse, i) => this.updateHorse(i, horse, over ? NEUTRAL_INPUT : (inputs[i] ?? NEUTRAL_INPUT), dt, over));
  }

  /** Returns and clears the events since the last call. */
  drainEvents(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Next jump obstacle ahead that has not been passed yet. */
  nextJump(player: number): { state: ObstacleState; distance: number } | null {
    const horse = this.horses[player];
    for (let k = this.nextObstacle[player]; k < this.obstacles[player].length; k++) {
      const state = this.obstacles[player][k];
      if (isJump(state.def.type) && state.result === 'pending') return { state, distance: state.def.s - horse.s };
    }
    return null;
  }

  /** True when a jump now would be timed automatically over the next obstacle. */
  inJumpZone(player: number): boolean {
    const f = this.nextJump(player);
    return !!f && f.distance >= 0 && f.distance <= this.cfg.jumpAssist.zoneBefore;
  }

  isOffTrack(player: number): boolean {
    return Math.abs(this.horses[player].lateral) > this.track.halfWidth;
  }

  /** Why the track currently slows this horse down (null = full speed possible). */
  slowdownReason(player: number): SlowdownReason {
    const h = this.horses[player];
    if (h.finished) return null;
    if (h.touchingRail) return 'rail';
    if (this.isOffTrack(player)) return 'grass';
    return null;
  }

  /**
   * Live placement per player (1 = leading): finished horses by finish time,
   * then the others by distance ridden.
   */
  positions(): number[] {
    const order = this.horses
      .map((h, player) => ({ player, h }))
      .sort((a, b) => {
        if (a.h.finishTime !== null && b.h.finishTime !== null) return a.h.finishTime - b.h.finishTime;
        if (a.h.finishTime !== null) return -1;
        if (b.h.finishTime !== null) return 1;
        return b.h.s - a.h.s || a.player - b.player;
      });
    const positions: number[] = [];
    order.forEach(({ player }, i) => (positions[player] = i + 1));
    return positions;
  }

  results(): RaceResult[] {
    const { faultPenaltySeconds, carrotBonusSeconds } = this.cfg.scoring;
    const rows = this.horses.map((h, player) => ({
      player,
      finished: h.finished,
      time: h.finishTime,
      carrots: h.carrots,
      faults: h.faults,
      score: h.finishTime === null ? null : h.finishTime + h.faults * faultPenaltySeconds - h.carrots * carrotBonusSeconds,
      distance: Math.min(h.s, this.track.length),
      rank: 0,
    }));
    const sorted = [...rows].sort((a, b) => {
      if (a.score !== null && b.score !== null) return a.score - b.score;
      if (a.score !== null) return -1;
      if (b.score !== null) return 1;
      return b.distance - a.distance;
    });
    sorted.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }

  private updateHorse(i: number, h: Horse, input: PlayerInput, dt: number, over = false): void {
    const { horse: hc, jumpAssist: ja } = this.cfg;
    const sample = this.track.sample(h.s);

    // --- jump start (before the speed, so the speed at the moment of the jump is held) ---
    if (input.jump && h.pendingJump === null && !h.finished && !over) {
      if (!h.air) this.requestJump(i, h);
      // Double jumps: a jump while still in the air is remembered for the next obstacle.
      else if (h.air.kind === 'assisted') this.rememberNextJump(i, h, h.air.obstacleId);
    }
    if (h.pendingJump !== null && !h.air) this.takeOffIfReady(i, h);

    // --- forward speed ---
    let target = h.finished || over ? 0 : Math.max(hc.minSpeed, clamp(input.drive, 0, 1) * hc.maxSpeed);
    let accel = hc.accel;
    // Jumping: keep the speed even though the child stopped bouncing to jump.
    if (h.heldSpeed !== null) {
      const jumping = h.air !== null || h.pendingJump !== null;
      if (!jumping) h.holdAfterLanding -= dt;
      if (h.finished || over || (!jumping && h.holdAfterLanding <= 0)) h.heldSpeed = null;
      else target = Math.max(target, h.heldSpeed);
    }
    // Carrot turbo: faster than usual, even at full speed.
    if (h.boost > 0) {
      target *= hc.boostFactor;
      accel *= hc.boostAccelFactor;
      h.boost = Math.max(0, h.boost - dt);
    }
    // The whole sand track is full speed; only grass and rails slow the horse down.
    if (h.touchingRail) target *= hc.railSpeedFactor;
    else if (this.isOffTrack(i)) target *= hc.offTrackSpeedFactor;
    // After a fault the horse stands still for a moment.
    if (h.stumble > 0) {
      target = 0;
      h.stumble = Math.max(0, h.stumble - dt);
    }
    // Brake hard after a fault, and after the finish (the horse stops in the run-out to celebrate).
    const decel = hc.decel * (h.stumble > 0 ? 4 : h.finished ? 2.5 : 1);
    h.speed = approach(h.speed, target, (target > h.speed ? accel : decel) * dt);
    // In the air the horse keeps its take-off speed – no hanging, no sudden drop.
    if (h.air?.kind === 'assisted') h.speed = h.air.speed;

    // --- sideways: steering against the outward drift in curves ---
    const drift = -sample.curvature * h.speed * h.speed * hc.driftFactor;
    const desired = clamp(input.steer, -1, 1) * hc.steerSpeed + drift;
    h.lateralVelocity = damp(h.lateralVelocity, desired, hc.lateralResponse, dt);
    const limit = this.track.railOffset - BODY_HALF_WIDTH;
    h.lateral += h.lateralVelocity * dt;
    h.touchingRail = Math.abs(h.lateral) >= limit;
    if (h.touchingRail) {
      h.lateral = Math.sign(h.lateral) * limit;
      h.lateralVelocity = 0;
    }

    // --- move forward ---
    // `speed` is the real ground speed. Progress along the center line depends on
    // the lateral position in curves: the inside line is shorter, the outside longer.
    const pathScale = Math.max(0.5, 1 - sample.curvature * h.lateral);
    h.s += (h.speed / pathScale) * dt;
    h.gaitPhase += dt * (2 + h.speed * 0.9);

    // --- jump progress ---
    if (h.air?.kind === 'assisted') {
      h.air.elapsed += dt;
      const p = h.air.elapsed / h.air.duration;
      if (p >= 1) this.land(h);
      else h.height = ja.height * 4 * p * (1 - p);
    } else if (h.air?.kind === 'free') {
      h.air.vy -= ja.gravity * dt;
      h.height += h.air.vy * dt;
      if (h.height <= 0) this.land(h);
    }

    if (over) return;
    this.checkObstacles(i, h);

    if (!h.finished && h.s >= this.track.length) {
      h.finished = true;
      h.finishTime = this.time;
      this.emit(i, 'finish');
    }
  }

  /**
   * The player jumped. In the jump zone the jump is remembered and the horse
   * takes off by itself at the right spot; elsewhere it hops right away.
   */
  private requestJump(i: number, h: Horse): void {
    this.holdSpeed(h);
    const next = this.nextJump(i);
    if (next && next.distance >= 0 && next.distance <= this.cfg.jumpAssist.zoneBefore) {
      h.pendingJump = next.state.def.id;
      this.takeOffIfReady(i, h);
    } else {
      h.air = { kind: 'free', vy: this.cfg.jumpAssist.freeJumpVelocity };
      this.emit(i, 'jump');
    }
  }

  /** In the air over one obstacle: remember a jump for the following one if it is close. */
  private rememberNextJump(i: number, h: Horse, currentObstacle: number): void {
    const list = this.obstacles[i];
    const current = list.find((o) => o.def.id === currentObstacle);
    const next = list.find(
      (o) => isJump(o.def.type) && o.result === 'pending' && o.def.id !== currentObstacle && (!current || o.def.s > current.def.s),
    );
    if (!next) return;
    // The zone counts from where the horse will land.
    const remainingFlight = h.air?.kind === 'assisted' ? h.air.speed * (h.air.duration - h.air.elapsed) : 0;
    const distance = next.def.s - h.s;
    if (distance >= 0 && distance <= this.cfg.jumpAssist.zoneBefore + remainingFlight) {
      h.pendingJump = next.def.id;
      this.holdSpeed(h);
    }
  }

  /** Takes off for a remembered jump once the obstacle is close enough. */
  private takeOffIfReady(i: number, h: Horse): void {
    const ja = this.cfg.jumpAssist;
    const state = this.obstacles[i].find((o) => o.def.id === h.pendingJump);
    if (!state || state.result !== 'pending') {
      h.pendingJump = null;
      return;
    }
    const distance = state.def.s - h.s;
    // Take off so that the obstacle is passed in the middle of the flight.
    const airSpeed = Math.max(h.speed, ja.minAirSpeed);
    if (distance > (airSpeed * ja.airTime) / 2) return;
    // A late jump (closer than ideal) still clears it, just earlier in the flight.
    const speed = Math.max(airSpeed, (2 * Math.max(distance, 0)) / ja.airTime);
    h.air = { kind: 'assisted', elapsed: 0, duration: ja.airTime, speed, obstacleId: state.def.id };
    h.pendingJump = null;
    this.emit(i, 'jump');
  }

  /** Starts (or extends) holding the current speed for a jump. */
  private holdSpeed(h: Horse): void {
    h.heldSpeed = Math.max(h.heldSpeed ?? 0, h.speed);
    h.holdAfterLanding = this.cfg.jumpAssist.holdAfterLandingSeconds;
  }

  private land(h: Horse): void {
    h.air = null;
    h.height = 0;
  }

  private checkObstacles(i: number, h: Horse): void {
    const list = this.obstacles[i];
    const oc = this.cfg.obstacles;
    while (this.nextObstacle[i] < list.length && list[this.nextObstacle[i]].def.s <= h.s) {
      const state = list[this.nextObstacle[i]++];
      const d = state.def;
      let result: ObstacleResult;
      if (isJump(d.type)) {
        const assisted = h.air?.kind === 'assisted' && h.air.obstacleId === d.id;
        result = assisted || h.height >= oc.fenceHeight ? 'cleared' : 'hit';
        if (result === 'hit') {
          h.faults++;
          this.stumble(h);
        }
        this.emit(i, result === 'hit' ? 'jump-fault' : 'jump-cleared', d.type);
      } else if (d.type === 'cone') {
        result = Math.abs(h.lateral - d.lateral) < oc.coneHitRadius && h.height < 0.5 ? 'hit' : 'missed';
        if (result === 'hit') {
          h.faults++;
          this.stumble(h);
          this.emit(i, 'cone-hit', d.type);
        }
      } else {
        result = Math.abs(h.lateral - d.lateral) < oc.carrotPickRadius ? 'collected' : 'missed';
        if (result === 'collected') {
          h.carrots++;
          h.boost = this.cfg.horse.boostSeconds;
          this.emit(i, 'carrot', d.type);
        }
      }
      state.result = result;
      state.changedAt = this.time;
    }
  }

  /** Fault: the horse is jolted almost to a halt, stands for a moment and loses any turbo. */
  private stumble(h: Horse): void {
    h.stumble = this.cfg.horse.faultStopSeconds;
    h.speed *= this.cfg.horse.faultImpactFactor;
    h.boost = 0;
    h.heldSpeed = null;
  }

  private emit(player: number, type: RaceEventType, obstacle?: ObstacleType): void {
    this.events.push({ player, type, time: this.time, obstacle });
  }
}
