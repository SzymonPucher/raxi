import { BALANCE } from '../core/config/balance';

export type DamageSource = 'pedestrian' | 'traffic' | 'wall' | 'landing' | 'flip';

/**
 * Car condition 0..100% (§8.6).
 * Below 50%, performance scales linearly down to 55%. Never game-overs on its own.
 */
export class CarCondition {
  private _condition = BALANCE.carConditionMax;

  reset(): void {
    this._condition = BALANCE.carConditionMax;
  }

  get condition(): number {
    return this._condition;
  }

  get missing(): number {
    return Math.max(0, BALANCE.carConditionMax - this._condition);
  }

  /** Performance multiplier applied to top speed and acceleration (§8.6). */
  get performanceMult(): number {
    if (this._condition >= BALANCE.carPerfThreshold) return 1.0;
    const t = Math.max(0, this._condition) / BALANCE.carPerfThreshold;
    return BALANCE.carMinPerfMult + (1.0 - BALANCE.carMinPerfMult) * t;
  }

  applyDamage(rawPercent: number, damageTakenMult = 1.0): number {
    const actual = Math.max(0, rawPercent * Math.max(0, damageTakenMult));
    const prev = this._condition;
    this._condition = Math.max(0, this._condition - actual);
    return prev - this._condition;
  }

  repair(percent: number): number {
    const prev = this._condition;
    this._condition = Math.min(BALANCE.carConditionMax, this._condition + Math.max(0, percent));
    return this._condition - prev;
  }

  repairFull(): number {
    return this.repair(BALANCE.carConditionMax);
  }

  setCondition(percent: number): void {
    this._condition = Math.max(0, Math.min(BALANCE.carConditionMax, percent));
  }
}
