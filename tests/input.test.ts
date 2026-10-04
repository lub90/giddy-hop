import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { GestureAnalyzer } from '../src/input/gestureAnalyzer';
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

describe('mirroring raw camera coordinates (regression: left/right were swapped)', () => {
  // The camera looks at the child, so the child's own right side appears on the
  // LEFT of the raw camera image (smaller x). Shoulders shifted to image-left = leaning right.
  const W = 1280;
  const rawLeaningRight = {
    id: 1,
    keypoints: [
      { name: 'left_shoulder', x: 915, y: 330, score: 0.9 },
      { name: 'right_shoulder', x: 825, y: 330, score: 0.9 },
      { name: 'left_hip', x: 935, y: 450, score: 0.9 },
      { name: 'right_hip', x: 885, y: 450, score: 0.9 },
    ],
  };

  it('a child leaning to their right steers right', () => {
    const pose = toDetectedPose(rawLeaningRight, W, 720, 0.3, true)!;
    const g = new GestureAnalyzer(structuredClone(CONFIG));
    for (let i = 0; i < 25; i++) g.update(pose, i / 25);
    expect(g.steer).toBeGreaterThan(0.5);
  });

  it('a child standing on the right of the camera image appears on the left of the screen (like a mirror)', () => {
    const pose = toDetectedPose(rawLeaningRight, W, 720, 0.3, true)!;
    expect(pose.center.x).toBeLessThan(0.5);
    expect(pose.keypoints.left_hip!.x).toBe(W - 935);
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
