import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { mergeKnown } from '../src/core/persist';

describe('mergeKnown – restoring tuned values from the debug panel', () => {
  it('applies known numeric values', () => {
    const c = structuredClone(CONFIG);
    mergeKnown(c, { steer: { fullLeanDegrees: 30 }, jump: { minRise: 0.5 } });
    expect(c.steer.fullLeanDegrees).toBe(30);
    expect(c.jump.minRise).toBe(0.5);
    expect(c.steer.curveExponent).toBe(CONFIG.steer.curveExponent);
  });

  it('ignores unknown keys and wrong types', () => {
    const c = structuredClone(CONFIG);
    mergeKnown(c, { steer: { fullLeanDegrees: 'fast', bogus: 1 }, nope: { a: 1 }, render: 5 });
    expect(c.steer.fullLeanDegrees).toBe(CONFIG.steer.fullLeanDegrees);
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
