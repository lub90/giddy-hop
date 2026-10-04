import { CONFIG } from '../../src/config';
import { PlayerTracker, type SlotEvent, type TrackerMode } from '../../src/pose/playerTracker';
import { makeFrame, makePose, simulate, type PersonSpec } from './poseFactory';

export const newTracker = () => {
  const c = structuredClone(CONFIG);
  return new PlayerTracker({ tracking: c.tracking, maxPlayers: c.maxPlayers, gestures: c });
};

/** Feeds a scene (list of people, may vary over time) into the tracker; returns the end time and all events. */
export function feed(tracker: PlayerTracker, seconds: number, scene: (t: number) => PersonSpec[], mode: TrackerMode, from = 0) {
  const events: SlotEvent[] = [];
  const t = simulate(seconds, (time) => events.push(...tracker.update(makeFrame(time, scene(time).map(makePose)), mode)), from);
  return { t, events };
}
