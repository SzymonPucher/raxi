import { describe, expect, it } from 'vitest';
import { StatSystem } from '../src/powers/StatSystem';

describe('StatSystem', () => {
  it('applies (base + Σadd) * Π(1 + mul) across stacks', () => {
    const stats = new StatSystem();
    stats.setBase('car.topSpeed', 40);
    stats.setSource('add1', [{ stat: 'car.topSpeed', add: 5 }], 2); // +10 => 50
    stats.setSource('mul1', [{ stat: 'car.topSpeed', mul: 0.1 }], 2); // * 1.1 * 1.1 => 60.5
    expect(stats.get('car.topSpeed')).toBeCloseTo(60.5, 5);
  });

  it('removes sources cleanly and previews additions accurately', () => {
    const stats = new StatSystem();
    const preview = stats.previewWith([{ stat: 'car.topSpeed', mul: 0.08 }]);
    expect(preview['car.topSpeed']?.before).toBe(45);
    expect(preview['car.topSpeed']?.after).toBeCloseTo(48.6, 5);

    stats.setSource('turbo', [{ stat: 'car.topSpeed', mul: 0.08 }], 1);
    expect(stats.get('car.topSpeed')).toBeCloseTo(48.6, 5);

    stats.removeSource('turbo');
    expect(stats.get('car.topSpeed')).toBe(45);
  });
});
