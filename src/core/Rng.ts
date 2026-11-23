/**
 * Seeded deterministic PRNG (Mulberry32) with string/number seeding.
 */
export class Rng {
  private state: number;
  public readonly seed: number;

  constructor(seed: number | string = Date.now()) {
    this.seed = typeof seed === 'string' ? Rng.hashString(seed) : seed >>> 0;
    this.state = this.seed || 0x9e3779b9;
  }

  static hashString(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Returns true with probability p in [0, 1]. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a random element from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Rng.pick called on empty array');
    }
    return items[Math.floor(this.next() * items.length)];
  }

  /** Weighted random pick. Weights must be >= 0 with sum > 0. */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0 || items.length !== weights.length) {
      throw new Error('Rng.weightedPick invalid items/weights');
    }
    let total = 0;
    for (let i = 0; i < weights.length; i++) {
      total += Math.max(0, weights[i]);
    }
    if (total <= 0) {
      return items[0];
    }
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Returns a shuffled copy of the array. */
  shuffle<T>(items: readonly T[]): T[] {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /** Creates a child RNG deterministically derived from a salt. */
  fork(salt: string | number): Rng {
    const s = typeof salt === 'string' ? Rng.hashString(salt) : salt >>> 0;
    const mixed = Math.imul(this.seed ^ s, 0x85ebca6b) >>> 0;
    return new Rng(mixed);
  }
}
