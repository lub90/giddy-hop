import type { PlayerTracker, SlotEvent } from '../pose/playerTracker';

/** What the game flow should do after the lobby processed the gestures of a frame. */
export type LobbyCommand = 'startLoading' | 'cancelLoading' | null;

/**
 * Lobby rules driven by arm gestures (the tracker reports them, the lobby decides):
 *
 *   registration phase
 *     one arm   (registered, not ready) → ready; when everyone is ready → start loading
 *     both arms (ready)                 → not ready any more
 *     both arms (registered, not ready) → unregister
 *   loading phase
 *     both arms (any player)            → cancel loading, that player is not ready any more
 *
 * Registering a new person (one arm) is done by the tracker itself.
 */
export class Lobby {
  constructor(private readonly tracker: PlayerTracker) {}

  /** At least one player and everyone confirmed ready. */
  get allReady(): boolean {
    const slots = this.tracker.slots;
    return slots.length > 0 && slots.every((s) => s.ready);
  }

  handle(events: readonly SlotEvent[], phase: 'register' | 'loading'): LobbyCommand {
    if (phase === 'loading') {
      let cancel = false;
      for (const { slot, action } of events) {
        if (action !== 'both') continue;
        slot.ready = false;
        cancel = true;
      }
      return cancel ? 'cancelLoading' : null;
    }

    let becameReady = false;
    for (const { slot, action } of events) {
      if (action === 'one') {
        if (!slot.ready) {
          slot.ready = true;
          becameReady = true;
        }
      } else if (slot.ready) {
        slot.ready = false;
      } else {
        this.tracker.unregister(slot);
      }
    }
    // Start when someone just confirmed, or when a not-ready player walked away.
    const trigger = becameReady || this.tracker.lastDropped > 0;
    return trigger && this.allReady ? 'startLoading' : null;
  }

  /** Keyboard shortcut: mark everyone ready. */
  setAllReady(): void {
    for (const s of this.tracker.slots) s.ready = true;
  }

  /** Back in the registration everyone confirms again. */
  resetReady(): void {
    for (const s of this.tracker.slots) s.ready = false;
  }
}
