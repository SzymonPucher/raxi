import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';

describe('Rng determinism', () => {
  it('produces identical sequences for the same numeric seed', () => {
    const a = new Rng(123456);
    const b = new Rng(123456);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces identical sequences for the same string seed and forks deterministically', () => {
    const a = new Rng('raxi-shift-1');
    const b = new Rng('raxi-shift-1');
    expect(a.int(1, 100)).toBe(b.int(1, 100));
    expect(a.fork('shop-3').next()).toBe(b.fork('shop-3').next());
    expect(a.fork('shop-3').next()).not.toBe(a.fork('shop-4').next());
  });

  it('weightedPick respects zero weights and returns valid items', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 30; i++) {
      expect(rng.weightedPick(['a', 'b', 'c'], [0, 10, 0])).toBe('b');
    }
  });
});
