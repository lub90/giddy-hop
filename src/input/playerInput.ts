/** What a player "wants" each frame – regardless of body or keyboard control. */
export interface PlayerInput {
  /** 0 = standstill … 1 = full speed */
  drive: number;
  /** -1 = full left … +1 = full right */
  steer: number;
  /** true for exactly one frame when a jump was triggered */
  jump: boolean;
}

export const NEUTRAL_INPUT: Readonly<PlayerInput> = { drive: 0, steer: 0, jump: false };

/** Combines body and keyboard input: the keyboard wins for steering while it is used. */
export function mergeInputs(body: PlayerInput, keys: PlayerInput | null): PlayerInput {
  if (!keys) return body;
  return {
    drive: Math.max(body.drive, keys.drive),
    steer: keys.steer !== 0 ? keys.steer : body.steer,
    jump: body.jump || keys.jump,
  };
}
