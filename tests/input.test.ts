import { describe, expect, it } from 'vitest';
import { KeyboardInput } from '../src/input/keyboardInput';
import { mergeInputs } from '../src/input/playerInput';
import { isArmRaised, toDetectedPose } from '../src/pose/poseTypes';
import { makePose } from './helpers/poseFactory';

describe('KeyboardInput – fallback controls', () => {
  it('returns null while a player does not use the keyboard', () => {
    expect(new KeyboardInput().read(0)).toBeNull();
  });

  it('maps W/A/D/S to gallop, steer and jump for player 1', () => {
    const k = new KeyboardInput();
    k.press('KeyW');
    k.press('KeyD');
    expect(k.read(0)).toEqual({ drive: 1, steer: 1, jump: false });
    k.release('KeyD');
    k.press('KeyA');
    expect(k.read(0)?.steer).toBe(-1);
  });

  it('delivers a jump exactly once per key press', () => {
    const k = new KeyboardInput();
    k.press('ArrowDown');
    expect(k.read(2)?.jump).toBe(true);
    expect(k.read(2)).toBeNull();
  });

  it('keeps the players separate', () => {
    const k = new KeyboardInput();
    k.press('KeyI');
    expect(k.read(0)).toBeNull();
    expect(k.read(1)?.drive).toBe(1);
  });
});

describe('mergeInputs', () => {
  const body = { drive: 0.4, steer: 0.3, jump: false };

  it('uses the body input when no keys are pressed', () => {
    expect(mergeInputs(body, null)).toEqual(body);
  });

  it('keyboard steering overrides, speed takes the maximum, jumps combine', () => {
    expect(mergeInputs(body, { drive: 1, steer: -1, jump: true })).toEqual({ drive: 1, steer: -1, jump: true });
    expect(mergeInputs(body, { drive: 0, steer: 0, jump: false })).toEqual(body);
  });
});

describe('pose helpers', () => {
  it('detects a raised arm (wrist above the nose)', () => {
    expect(isArmRaised(makePose({ x: 640, arm: 'left' }))).toBe(true);
    expect(isArmRaised(makePose({ x: 640, arm: 'right' }))).toBe(true);
    expect(isArmRaised(makePose({ x: 640 }))).toBe(false);
  });

  it('drops low-confidence keypoints and rejects poses without a torso', () => {
    const raw = { keypoints: [{ name: 'nose', x: 1, y: 1, score: 0.9 }, { name: 'left_hip', x: 1, y: 1, score: 0.1 }] };
    expect(toDetectedPose(raw, 100, 100, 0.3)).toBeNull();
  });
});
