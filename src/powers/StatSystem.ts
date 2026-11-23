export type StatKey =
  | 'car.topSpeed'
  | 'car.accel'
  | 'car.grip'
  | 'car.handbrakeGrip'
  | 'car.steer'
  | 'car.mass'
  | 'car.boostForce'
  | 'car.damageTaken'
  | 'timer.pickupMult'
  | 'timer.deliveryMult'
  | 'timer.drainRate'
  | 'score.cashMult'
  | 'score.tipMult'
  | 'style.mult'
  | 'safety.penaltyMult'
  | 'passenger.patienceMult'
  | 'pickup.maxSpeed'
  | 'pickup.radius'
  | 'draft.choices'
  | 'draft.rerolls'
  | 'ability.cooldownMult'
  | 'traffic.density'
  | 'shop.priceMult'
  | 'shop.repairMult';

export interface StatMod {
  stat: StatKey;
  /** Additive delta applied before multiplicative terms, per stack. */
  add?: number;
  /** Multiplicative factor delta (e.g. 0.08 => ×1.08, -0.2 => ×0.80), applied per stack. */
  mul?: number;
}

export const DEFAULT_BASE_STATS: Record<StatKey, number> = {
  'car.topSpeed': 45,
  'car.accel': 1.0,
  'car.grip': 0.85,
  'car.handbrakeGrip': 0.35,
  'car.steer': 1.0,
  'car.mass': 1200,
  'car.boostForce': 1.4,
  'car.damageTaken': 1.0,
  'timer.pickupMult': 1.0,
  'timer.deliveryMult': 1.0,
  'timer.drainRate': 1.0,
  'score.cashMult': 1.0,
  'score.tipMult': 1.0,
  'style.mult': 1.0,
  'safety.penaltyMult': 1.0,
  'passenger.patienceMult': 1.0,
  'pickup.maxSpeed': 3.0,
  'pickup.radius': 6.0,
  'draft.choices': 3,
  'draft.rerolls': 1,
  'ability.cooldownMult': 1.0,
  'traffic.density': 1.0,
  'shop.priceMult': 1.0,
  'shop.repairMult': 1.0,
};

const STAT_MIN_CLAMP: Partial<Record<StatKey, number>> = {
  'car.topSpeed': 10,
  'car.accel': 0.25,
  'car.grip': 0.15,
  'car.handbrakeGrip': 0.08,
  'car.steer': 0.3,
  'car.mass': 400,
  'car.damageTaken': 0.05,
  'timer.pickupMult': 0.2,
  'timer.deliveryMult': 0.2,
  'timer.drainRate': 0.1,
  'score.cashMult': 0.1,
  'score.tipMult': 0.1,
  'style.mult': 0.1,
  'safety.penaltyMult': 0.05,
  'passenger.patienceMult': 0.2,
  'pickup.maxSpeed': 2.0,
  'pickup.radius': 3.0,
  'draft.choices': 1,
  'draft.rerolls': 0,
  'ability.cooldownMult': 0.2,
  'traffic.density': 0.2,
  'shop.priceMult': 0.2,
  'shop.repairMult': 0.1,
};

interface ModSource {
  id: string;
  mods: StatMod[];
  stacks: number;
}

/**
 * Pure stat calculation: final = (base + Σadd) × Π(1 + mul) per stack.
 */
export class StatSystem {
  private base: Record<StatKey, number>;
  private sources: ModSource[] = [];
  private cache: Record<StatKey, number>;

  constructor(overrides?: Partial<Record<StatKey, number>>) {
    this.base = { ...DEFAULT_BASE_STATS, ...overrides };
    this.cache = { ...this.base };
  }

  setBase(key: StatKey, value: number): void {
    this.base[key] = value;
    this.recompute();
  }

  getBase(key: StatKey): number {
    return this.base[key];
  }

  setSource(id: string, mods: StatMod[], stacks = 1): void {
    const idx = this.sources.findIndex((s) => s.id === id);
    if (stacks <= 0 || mods.length === 0) {
      if (idx >= 0) {
        this.sources.splice(idx, 1);
        this.recompute();
      }
      return;
    }
    if (idx >= 0) {
      this.sources[idx] = { id, mods, stacks };
    } else {
      this.sources.push({ id, mods, stacks });
    }
    this.recompute();
  }

  removeSource(id: string): void {
    const idx = this.sources.findIndex((s) => s.id === id);
    if (idx >= 0) {
      this.sources.splice(idx, 1);
      this.recompute();
    }
  }

  clearSources(): void {
    this.sources = [];
    this.recompute();
  }

  recompute(): void {
    const adds: Partial<Record<StatKey, number>> = {};
    const muls: Partial<Record<StatKey, number>> = {};

    for (const src of this.sources) {
      for (const mod of src.mods) {
        if (mod.add !== undefined) {
          adds[mod.stat] = (adds[mod.stat] ?? 0) + mod.add * src.stacks;
        }
        if (mod.mul !== undefined) {
          let cur = muls[mod.stat] ?? 1;
          for (let s = 0; s < src.stacks; s++) {
            cur *= 1 + mod.mul;
          }
          muls[mod.stat] = cur;
        }
      }
    }

    for (const key of Object.keys(this.base) as StatKey[]) {
      const val = (this.base[key] + (adds[key] ?? 0)) * (muls[key] ?? 1);
      const min = STAT_MIN_CLAMP[key];
      this.cache[key] = min !== undefined ? Math.max(min, val) : val;
    }
  }

  get(key: StatKey): number {
    return this.cache[key];
  }

  /**
   * Preview what a stat would be if `mods` were added (+1 stack).
   */
  previewWith(mods: StatMod[]): Partial<Record<StatKey, { before: number; after: number }>> {
    const result: Partial<Record<StatKey, { before: number; after: number }>> = {};
    const keys = new Set(mods.map((m) => m.stat));
    for (const key of keys) {
      const before = this.get(key);
      // Clone calculation with extra source
      let add = 0;
      let mul = 1;
      for (const src of this.sources) {
        for (const m of src.mods) {
          if (m.stat !== key) continue;
          if (m.add !== undefined) add += m.add * src.stacks;
          if (m.mul !== undefined) {
            for (let s = 0; s < src.stacks; s++) mul *= 1 + m.mul;
          }
        }
      }
      for (const m of mods) {
        if (m.stat !== key) continue;
        if (m.add !== undefined) add += m.add;
        if (m.mul !== undefined) mul *= 1 + m.mul;
      }
      let after = (this.base[key] + add) * mul;
      const min = STAT_MIN_CLAMP[key];
      if (min !== undefined) after = Math.max(min, after);
      result[key] = { before, after };
    }
    return result;
  }

  snapshot(): Record<StatKey, number> {
    return { ...this.cache };
  }
}
