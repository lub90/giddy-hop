import { CONFIG, type TrackingConfig } from '../config';
import { distance, lerp, type Point } from '../core/math';
import { GestureAnalyzer, type GestureConfig } from '../input/gestureAnalyzer';
import { ArmGestureDetector, type ArmAction } from './armGesture';
import { raisedArmCount, type DetectedPose, type PoseFrame } from './poseTypes';

export type SlotKind = 'pose' | 'keyboard';

/**
 * What the tracker does with a frame:
 *   register – new people can register, arm gestures of players are reported, vanished players are dropped
 *   loading  – only arm gestures of registered players are reported
 *   race     – identities are kept, nothing else
 */
export type TrackerMode = 'register' | 'loading' | 'race';

/** A registered player. */
export interface PlayerSlot {
  /** Running id (unique for the lifetime of the tracker). */
  readonly uid: number;
  /** Player number 0..maxPlayers-1, given in registration order; decides horse name and color. */
  readonly number: number;
  readonly kind: SlotKind;
  /** Remembered position (normalized 0..1); slowly follows the person. */
  anchor: Point | null;
  trackId: number | undefined;
  /** Pose assigned in the current frame, null when not detected. */
  pose: DetectedPose | null;
  lastSeen: number;
  /** Confirmed "ready" in the lobby. */
  ready: boolean;
  readonly gestures: GestureAnalyzer;
  readonly arms: ArmGestureDetector;
}

/** A not (yet) registered person with arm-raise progress. */
export interface Candidate {
  pose: DetectedPose;
  /** 0..1 – registers at 1. */
  progress: number;
}

/** An arm gesture completed by a registered player. */
export interface SlotEvent {
  slot: PlayerSlot;
  action: ArmAction;
}

export interface TrackerOptions {
  tracking: TrackingConfig;
  maxPlayers: number;
  gestures: GestureConfig;
}

/**
 * Assigns detected people to fixed player slots over time.
 *
 * - Registration: an unassigned person holds one arm up. The player number is
 *   the lowest free one, i.e. the registration order.
 * - Matching: by MoveNet tracker id first, otherwise by nearest remembered
 *   position. People who match no player are ignored (other kids may be in
 *   the picture).
 * - Arm gestures of registered players are reported as events; what they mean
 *   (ready, unregister, cancel) is decided by the Lobby.
 */
export class PlayerTracker {
  /** Registered players, sorted by player number. */
  slots: PlayerSlot[] = [];
  candidates: Candidate[] = [];
  /** Number of players dropped in the last update (walked away during registration). */
  lastDropped = 0;

  private nextUid = 1;
  private candidateArms = new Map<string, ArmGestureDetector>();

  constructor(
    private readonly opts: TrackerOptions = { tracking: CONFIG.tracking, maxPlayers: CONFIG.maxPlayers, gestures: CONFIG },
  ) {}

  get isFull(): boolean {
    return this.slots.length >= this.opts.maxPlayers;
  }

  /** Processes one pose frame and returns completed arm gestures of registered players. */
  update(frame: PoseFrame, mode: TrackerMode): SlotEvent[] {
    const t = frame.time;
    const hold = this.opts.tracking.registerHoldSeconds;
    const unmatched = this.match(frame.poses, t);
    this.lastDropped = 0;

    for (const slot of this.slots) {
      if (slot.kind === 'pose') slot.gestures.update(slot.pose, t);
    }

    this.candidates = [];
    if (mode === 'race') {
      this.candidateArms.clear();
      return [];
    }

    const events: SlotEvent[] = [];
    for (const slot of this.slots) {
      if (!slot.pose) continue;
      const action = slot.arms.update(raisedArmCount(slot.pose), t, hold);
      if (action) events.push({ slot, action });
    }

    if (mode === 'register') {
      this.registerCandidates(unmatched, t, hold);
      // Whoever walks away during registration frees their slot again.
      const before = this.slots.length;
      this.slots = this.slots.filter(
        (s) => s.kind === 'keyboard' || t - s.lastSeen <= this.opts.tracking.dropAfterSeconds,
      );
      this.lastDropped = before - this.slots.length;
    } else {
      this.candidateArms.clear();
    }
    return events;
  }

  /** Adds a keyboard-only player (for testing without a camera). */
  addKeyboardPlayer(): PlayerSlot | null {
    if (this.isFull) return null;
    return this.addSlot('keyboard', null, undefined, Number.POSITIVE_INFINITY);
  }

  unregister(slot: PlayerSlot): void {
    this.slots = this.slots.filter((s) => s !== slot);
  }

  clear(): void {
    this.slots = [];
    this.candidates = [];
    this.candidateArms.clear();
  }

  private registerCandidates(unmatched: DetectedPose[], t: number, hold: number): void {
    const seen = new Set<string>();
    for (const pose of unmatched) {
      const key = candidateKey(pose);
      seen.add(key);
      let arms = this.candidateArms.get(key);
      if (!arms) this.candidateArms.set(key, (arms = new ArmGestureDetector()));
      const action = arms.update(raisedArmCount(pose), t, hold);
      if (action === 'one' && !this.isFull) {
        this.candidateArms.delete(key);
        const slot = this.addSlot('pose', { ...pose.center }, pose.trackId, t);
        slot.pose = pose;
      } else {
        // Only one raised arm registers; show progress just for that.
        this.candidates.push({ pose, progress: arms.holding === 1 && !this.isFull ? arms.progress : 0 });
      }
    }
    for (const key of [...this.candidateArms.keys()]) if (!seen.has(key)) this.candidateArms.delete(key);
  }

  /** Assigns poses to existing players and returns the remaining ones. */
  private match(poses: DetectedPose[], t: number): DetectedPose[] {
    const { maxMatchDistance, anchorFollow } = this.opts.tracking;
    const pairs: { slot: PlayerSlot; pose: DetectedPose; cost: number }[] = [];
    for (const slot of this.slots) {
      slot.pose = null;
      if (slot.kind !== 'pose' || !slot.anchor) continue;
      for (const pose of poses) {
        const sameId = slot.trackId !== undefined && pose.trackId === slot.trackId;
        const d = distance(slot.anchor, pose.center);
        // Same tracker id always wins, unless the person "teleports".
        if (sameId && d <= maxMatchDistance * 2) pairs.push({ slot, pose, cost: -1 });
        else if (d <= maxMatchDistance) pairs.push({ slot, pose, cost: d });
      }
    }
    pairs.sort((a, b) => a.cost - b.cost);

    const usedPoses = new Set<DetectedPose>();
    for (const { slot, pose } of pairs) {
      if (slot.pose || usedPoses.has(pose) || !slot.anchor) continue;
      slot.pose = pose;
      usedPoses.add(pose);
      slot.trackId = pose.trackId;
      slot.lastSeen = t;
      slot.anchor = {
        x: lerp(slot.anchor.x, pose.center.x, anchorFollow),
        y: lerp(slot.anchor.y, pose.center.y, anchorFollow),
      };
    }
    return poses.filter((p) => !usedPoses.has(p));
  }

  private addSlot(kind: SlotKind, anchor: Point | null, trackId: number | undefined, lastSeen: number): PlayerSlot {
    const taken = new Set(this.slots.map((s) => s.number));
    let number = 0;
    while (taken.has(number)) number++;
    const slot: PlayerSlot = {
      uid: this.nextUid++,
      number,
      kind,
      anchor,
      trackId,
      pose: null,
      lastSeen,
      ready: false,
      gestures: new GestureAnalyzer(this.opts.gestures),
      // The registering arm is still up: it must come down before the next gesture counts.
      arms: new ArmGestureDetector(true),
    };
    this.slots.push(slot);
    this.slots.sort((a, b) => a.number - b.number);
    return slot;
  }
}

function candidateKey(pose: DetectedPose): string {
  if (pose.trackId !== undefined) return `id:${pose.trackId}`;
  return `pos:${Math.round(pose.center.x * 20)}`;
}
