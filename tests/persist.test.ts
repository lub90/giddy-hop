import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { mergeKnown } from '../src/core/persist';

describe('mergeKnown – restoring tuned values from the debug panel', () => {
  it('applies known numeric values', () => {
    const c = structuredClone(CONFIG);
    mergeKnown(c, { steer: { gain: 4 }, jump: { upVelocityThreshold: 1.5 } });
    expect(c.steer.gain).toBe(4);
    expect(c.jump.upVelocityThreshold).toBe(1.5);
    expect(c.steer.deadzone).toBe(CONFIG.steer.deadzone);
  });

  it('ignores unknown keys and wrong types', () => {
    const c = structuredClone(CONFIG);
    mergeKnown(c, { steer: { gain: 'fast', bogus: 1 }, nope: { a: 1 }, render: 5 });
    expect(c.steer.gain).toBe(CONFIG.steer.gain);
    expect('bogus' in c.steer).toBe(false);
    expect(c.render).toEqual(CONFIG.render);
  });

  it('ignores garbage input', () => {
    const c = structuredClone(CONFIG);
    mergeKnown(c, null);
    mergeKnown(c, [1, 2]);
    expect(c).toEqual(CONFIG);
  });
});
