import { BALANCE } from '../core/config/balance';

export class ShiftTimer {
  public remaining: number;
  public elapsed = 0;
  public frozen = false;
  public drainRate = 1.0;

  constructor(startSeconds = BALANCE.shiftStartTime) {
    this.remaining = startSeconds;
  }

  reset(startSeconds = BALANCE.shiftStartTime): void {
    this.remaining = startSeconds;
    this.elapsed = 0;
    this.frozen = false;
    this.drainRate = 1.0;
  }

  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  add(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.remaining = Math.max(0, this.remaining + seconds);
  }

  subtract(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.remaining = Math.max(0, this.remaining - seconds);
  }

  /**
   * Tick timer by `dt` seconds. Returns true if timer just reached 0.
   */
  tick(dt: number, externalDrainMult = 1.0): boolean {
    if (this.frozen || this.remaining <= 0) return false;
    const drain = dt * this.drainRate * externalDrainMult;
    this.elapsed += dt;
    this.remaining = Math.max(0, this.remaining - drain);
    return this.remaining <= 0;
  }
}
