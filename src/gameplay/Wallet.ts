/**
 * Spendable cash wallet (§8.1, §9.3) — separate from Score (total cash earned).
 * Never goes negative.
 */
export class Wallet {
  private _balance = 0;
  private _totalEarned = 0;
  private _totalSpent = 0;

  reset(): void {
    this._balance = 0;
    this._totalEarned = 0;
    this._totalSpent = 0;
  }

  get balance(): number {
    return this._balance;
  }

  get totalEarned(): number {
    return this._totalEarned;
  }

  get totalSpent(): number {
    return this._totalSpent;
  }

  earn(amount: number): number {
    const clean = Math.max(0, Math.round(amount));
    this._balance += clean;
    this._totalEarned += clean;
    return clean;
  }

  canAfford(cost: number): boolean {
    return this._balance >= Math.max(0, Math.round(cost));
  }

  spend(cost: number): boolean {
    const clean = Math.max(0, Math.round(cost));
    if (clean === 0) return true;
    if (this._balance < clean) return false;
    this._balance -= clean;
    this._totalSpent += clean;
    return true;
  }

  /** Small cash penalty (e.g. abandoned fare); clamped so wallet never goes negative. */
  deductPenalty(amount: number): number {
    const clean = Math.max(0, Math.round(amount));
    const taken = Math.min(this._balance, clean);
    this._balance -= taken;
    return taken;
  }
}
