import { CONFIG, type Config } from '../config';
import { approach, clamp, damp } from '../core/math';
import { NEUTRAL_INPUT, type PlayerInput } from '../input/playerInput';
import { Horse } from './horse';
import type { Track, TrackObstacle } from './track';

export type RaceConfig = Pick<Config, 'horse' | 'jumpAssist' | 'obstacles' | 'scoring' | 'race'>;

export type ObstacleResult = 'pending' | 'cleared' | 'hit' | 'collected' | 'missed';

/** Per-player state of an obstacle (every player has their own fences and carrots). */
export interface ObstacleState {
  readonly def: TrackObstacle;
  result: ObstacleResult;
  /** Race time when the result changed (for animations). */
  changedAt: number;
}

export type RaceEventType = 'jump' | 'fence-cleared' | 'fence-fault' | 'cone-hit' | 'carrot' | 'finish';

export interface RaceEvent {
  player: number;
  type: RaceEventType;
  time: number;
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
    if (this.isOver) return;
    this.time += dt;
    this.horses.forEach((horse, i) => this.updateHorse(i, horse, inputs[i] ?? NEUTRAL_INPUT, dt));
  }

  /** Returns and clears the events since the last call. */
  drainEvents(): RaceEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Next fence ahead that has not been passed yet. */
  nextFence(player: number): { state: ObstacleState; distance: number } | null {
    const horse = this.horses[player];
    for (let k = this.nextObstacle[player]; k < this.obstacles[player].length; k++) {
      const state = this.obstacles[player][k];
      if (state.def.type === 'fence' && state.result === 'pending') return { state, distance: state.def.s - horse.s };
    }
    return null;
  }

  /** True when a jump now would be timed automatically over the next fence. */
  inJumpZone(player: number): boolean {
    const f = this.nextFence(player);
    return !!f && f.distance >= 0 && f.distance <= this.cfg.jumpAssist.zoneBefore;
  }

  isOffTrack(player: number): boolean {
    return Math.abs(this.horses[player].lateral) > this.track.halfWidth;
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

  private updateHorse(i: number, h: Horse, input: PlayerInput, dt: number): void {
    const { horse: hc, jumpAssist: ja } = this.cfg;
    const sample = this.track.sample(h.s);

    // --- forward speed ---
    let target = h.finished ? 0 : Math.max(hc.minSpeed, clamp(input.drive, 0, 1) * hc.maxSpeed);
    if (this.isOffTrack(i)) target *= hc.offTrackSpeedFactor;
    if (h.stumble > 0) {
      target *= hc.stumbleSpeedFactor;
      h.stumble = Math.max(0, h.stumble - dt);
    }
    h.speed = approach(h.speed, target, (target > h.speed ? hc.accel : hc.decel) * dt);
    if (h.air?.kind === 'assisted') h.speed = Math.max(h.speed, ja.minAirSpeed);

    // --- sideways: steering against the outward drift in curves ---
    const drift = -sample.curvature * h.speed * h.speed * hc.driftFactor;
    const desired = clamp(input.steer, -1, 1) * hc.steerSpeed + drift;
    h.lateralVelocity = damp(h.lateralVelocity, desired, hc.lateralResponse, dt);
    const limit = this.track.railOffset - BODY_HALF_WIDTH;
    h.lateral += h.lateralVelocity * dt;
    if (Math.abs(h.lateral) > limit) {
      h.lateral = Math.sign(h.lateral) * limit;
      h.lateralVelocity = 0;
    }

    // --- jump start ---
    if (input.jump && !h.air && !h.finished) this.startJump(i, h);

    // --- move forward ---
    h.s += h.speed * dt;
    h.gaitPhase += dt * (2 + h.speed * 0.9);

    // --- jump progress ---
    if (h.air?.kind === 'assisted') {
      const p = (h.s - h.air.from) / (h.air.to - h.air.from);
      if (p >= 1) this.land(h);
      else h.height = ja.height * 4 * p * (1 - p);
    } else if (h.air?.kind === 'free') {
      h.air.vy -= ja.gravity * dt;
      h.height += h.air.vy * dt;
      if (h.height <= 0) this.land(h);
    }

    this.checkObstacles(i, h);

    if (!h.finished && h.s >= this.track.length) {
      h.finished = true;
      h.finishTime = this.time;
      this.emit(i, 'finish');
    }
  }

  private startJump(i: number, h: Horse): void {
    const ja = this.cfg.jumpAssist;
    const fence = this.nextFence(i);
    if (fence && fence.distance >= 0 && fence.distance <= ja.zoneBefore) {
      const half = Math.max(fence.distance, ja.minHalfLength);
      h.air = { kind: 'assisted', from: h.s, to: fence.state.def.s + half, obstacleId: fence.state.def.id };
    } else {
      h.air = { kind: 'free', vy: ja.freeJumpVelocity };
    }
    this.emit(i, 'jump');
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
      if (d.type === 'fence') {
        const assisted = h.air?.kind === 'assisted' && h.air.obstacleId === d.id;
        result = assisted || h.height >= oc.fenceHeight ? 'cleared' : 'hit';
        if (result === 'hit') {
          h.faults++;
          this.stumble(h);
        }
        this.emit(i, result === 'hit' ? 'fence-fault' : 'fence-cleared');
      } else if (d.type === 'cone') {
        result = Math.abs(h.lateral - d.lateral) < oc.coneHitRadius && h.height < 0.5 ? 'hit' : 'missed';
        if (result === 'hit') {
          h.faults++;
          this.stumble(h);
          this.emit(i, 'cone-hit');
        }
      } else {
        result = Math.abs(h.lateral - d.lateral) < oc.carrotPickRadius ? 'collected' : 'missed';
        if (result === 'collected') {
          h.carrots++;
          this.emit(i, 'carrot');
        }
      }
      state.result = result;
      state.changedAt = this.time;
    }
  }

  private stumble(h: Horse): void {
    h.stumble = this.cfg.horse.stumbleSeconds;
    h.speed *= this.cfg.horse.stumbleSpeedFactor;
  }

  private emit(player: number, type: RaceEventType): void {
    this.events.push({ player, type, time: this.time });
  }
}
