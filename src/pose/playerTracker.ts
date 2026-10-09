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

/** A not yet registered person being followed while they raise an arm. */
interface Pending {
  anchor: Point;
  trackId: number | undefined;
  lastSeen: number;
  readonly arms: ArmGestureDetector;
}

/** Something followed over time: a player or a person about to register. */
interface Followed {
  anchor: Point | null;
  trackId: number | undefined;
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
 * - Matching: by nearest remembered position; the MoveNet tracker id only
 *   breaks ties (it swaps between people standing close together, e.g. when
 *   both raise their arms). People who match no player are ignored (other
 *   kids may be in the picture).
 * - Short detection gaps and wrists missed for a frame do not restart a
 *   gesture, so several children can register or get ready at the same time.
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
  private pending: Pending[] = [];

  constructor(
    private readonly opts: TrackerOptions = { tracking: CONFIG.tracking, maxPlayers: CONFIG.maxPlayers, gestures: CONFIG },
  ) {}

  get isFull(): boolean {
    return this.slots.length >= this.opts.maxPlayers;
  }

  /** Processes one pose frame and returns completed arm gestures of registered players. */
  update(frame: PoseFrame, mode: TrackerMode): SlotEvent[] {
    const t = frame.time;
    const { registerHoldSeconds: hold, armFlickerSeconds: flicker } = this.opts.tracking;
    const unmatched = this.match(frame.poses, t);
    this.lastDropped = 0;

    for (const slot of this.slots) {
      if (slot.kind === 'pose') slot.gestures.update(slot.pose, t);
    }

    this.candidates = [];
    if (mode === 'race') {
      this.pending = [];
      return [];
    }

    const events: SlotEvent[] = [];
    for (const slot of this.slots) {
      if (!slot.pose) continue;
      const action = slot.arms.update(raisedArmCount(slot.pose), t, hold, flicker);
      if (action) events.push({ slot, action });
    }

    if (mode === 'register') {
      this.registerCandidates(unmatched, t, hold, flicker);
      // Whoever walks away during registration frees their slot again.
      const before = this.slots.length;
      this.slots = this.slots.filter(
        (s) => s.kind === 'keyboard' || t - s.lastSeen <= this.opts.tracking.dropAfterSeconds,
      );
      this.lastDropped = before - this.slots.length;
    } else {
      this.pending = [];
    }
    return events;
  }

  /** Adds a keyboard-only player (for testing without a camera). */
  addKeyboardPlayer(): PlayerSlot | null {
    if (this.isFull) return null;
    return this.addSlot('keyboard', null, undefined, Number.POSITIVE_INFINITY);
  }

  /**
   * Every player has to lower the arms once before the next gesture counts.
   * During the race gestures are not evaluated, so an arm that is up when the
   * game returns to the start screen must not count as a new raise.
   */
  blockGestures(): void {
    for (const slot of this.slots) slot.arms.block();
  }

  unregister(slot: PlayerSlot): void {
    this.slots = this.slots.filter((s) => s !== slot);
  }

  clear(): void {
    this.slots = [];
    this.candidates = [];
    this.pending = [];
  }

  private registerCandidates(unmatched: DetectedPose[], t: number, hold: number, flicker: number): void {
    const { tracking } = this.opts;
    const assigned = assign(this.pending, unmatched, tracking.maxMatchDistance);
    const taken = new Set(assigned.values());
    for (const pose of unmatched) {
      if (!taken.has(pose)) {
        const p: Pending = { anchor: { ...pose.center }, trackId: pose.trackId, lastSeen: t, arms: new ArmGestureDetector() };
        this.pending.push(p);
        assigned.set(p, pose);
      }
    }
    // Someone briefly not detected keeps their progress.
    this.pending = this.pending.filter((p) => assigned.has(p) || t - p.lastSeen <= tracking.candidateKeepSeconds);

    for (const [p, pose] of assigned) {
      follow(p, pose, tracking.anchorFollow);
      p.lastSeen = t;
      const action = p.arms.update(raisedArmCount(pose), t, hold, flicker);
      if (action === 'one' && !this.isFull) {
        this.pending = this.pending.filter((x) => x !== p);
        const slot = this.addSlot('pose', { ...pose.center }, pose.trackId, t);
        slot.pose = pose;
      } else {
        // Only one raised arm registers; show progress just for that.
        this.candidates.push({ pose, progress: p.arms.holding === 1 && !this.isFull ? p.arms.progress : 0 });
      }
    }
  }

  /** Assigns poses to existing players and returns the remaining ones. */
  private match(poses: DetectedPose[], t: number): DetectedPose[] {
    const { maxMatchDistance, anchorFollow } = this.opts.tracking;
    for (const slot of this.slots) slot.pose = null;
    const assigned = assign(
      this.slots.filter((s) => s.kind === 'pose'),
      poses,
      maxMatchDistance,
    );
    for (const [slot, pose] of assigned) {
      slot.pose = pose;
      slot.lastSeen = t;
      follow(slot, pose, anchorFollow);
    }
    const used = new Set(assigned.values());
    return poses.filter((p) => !used.has(p));
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

/** Moves the remembered position towards the pose and takes over its tracker id. */
function follow(item: Followed, pose: DetectedPose, rate: number): void {
  item.trackId = pose.trackId;
  item.anchor = item.anchor
    ? { x: lerp(item.anchor.x, pose.center.x, rate), y: lerp(item.anchor.y, pose.center.y, rate) }
    : { ...pose.center };
}

/**
 * Greedy nearest-position assignment of poses to followed people (each at
 * most once). The same tracker id gives a bonus of half the match distance
 * and allows twice the distance (fast movements), but a pose clearly closer to
 * someone's remembered position wins – MoveNet swaps ids between people
 * standing close together.
 */
function assign<T extends Followed>(items: readonly T[], poses: readonly DetectedPose[], maxDistance: number): Map<T, DetectedPose> {
  const pairs: { item: T; pose: DetectedPose; cost: number }[] = [];
  for (const item of items) {
    if (!item.anchor) continue;
    for (const pose of poses) {
      const sameId = item.trackId !== undefined && pose.trackId === item.trackId;
      const d = distance(item.anchor, pose.center);
      if (d <= (sameId ? maxDistance * 2 : maxDistance)) pairs.push({ item, pose, cost: sameId ? d - maxDistance / 2 : d });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost);
  const result = new Map<T, DetectedPose>();
  const usedPoses = new Set<DetectedPose>();
  for (const { item, pose } of pairs) {
    if (result.has(item) || usedPoses.has(pose)) continue;
    result.set(item, pose);
    usedPoses.add(pose);
  }
  return result;
}
