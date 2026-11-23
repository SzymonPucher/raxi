import { BALANCE } from '../core/config/balance';

export interface StyleAward {
  kind: string;
  points: number;
  combo: number;
  label: string;
}

/**
 * Tracks live style points & combo chains (§9.4).
 * Consecutive events within 2 s build combo (+0.1/link up to x3). Collision breaks it.
 */
export class StyleTracker {
  public totalPoints = 0;
  public farePoints = 0;
  public comboCount = 0;
  public comboMult = 1.0;
  public bestCombo = 0;
  private comboTimer = 0;

  // Stunt Show (#26): each jump grants x1.5 style for 5s (stacks up to x3)
  private stuntMult = 1.0;
  private stuntTimer = 0;

  // Drift accumulator to emit periodic punchy popups
  private driftPopupAccum = 0;
  private driftPopupTimer = 0;
  private oncomingPopupAccum = 0;

  resetShift(): void {
    this.totalPoints = 0;
    this.farePoints = 0;
    this.comboCount = 0;
    this.comboMult = 1.0;
    this.bestCombo = 0;
    this.comboTimer = 0;
    this.stuntMult = 1.0;
    this.stuntTimer = 0;
    this.driftPopupAccum = 0;
    this.driftPopupTimer = 0;
    this.oncomingPopupAccum = 0;
  }

  resetFare(): void {
    this.farePoints = 0;
  }

  activateStuntBoost(): void {
    this.stuntMult = Math.min(3.0, this.stuntMult * 1.5);
    this.stuntTimer = 5.0;
  }

  get activeStuntMult(): number {
    return this.stuntTimer > 0 ? this.stuntMult : 1.0;
  }

  tick(dt: number): void {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.comboMult = 1.0;
      }
    }
    if (this.stuntTimer > 0) {
      this.stuntTimer -= dt;
      if (this.stuntTimer <= 0) {
        this.stuntMult = 1.0;
      }
    }
  }

  /**
   * Add continuous style points (drift / airtime / oncoming).
   * Returns a popup StyleAward periodically so HUD stays lively without spamming every frame.
   */
  addContinuous(
    kind: 'drift' | 'air' | 'oncoming',
    rawPoints: number,
    styleStatMult: number,
    dt: number
  ): StyleAward | null {
    if (rawPoints <= 0) return null;
    const mult = styleStatMult * this.comboMult * this.activeStuntMult;
    const gained = rawPoints * mult;
    this.totalPoints += gained;
    this.farePoints += gained;
    this.comboTimer = BALANCE.styleComboWindow;

    if (kind === 'drift') {
      this.driftPopupAccum += gained;
      this.driftPopupTimer += dt;
      if (this.driftPopupTimer >= 0.75 && this.driftPopupAccum >= 6) {
        const pts = Math.round(this.driftPopupAccum);
        this.driftPopupAccum = 0;
        this.driftPopupTimer = 0;
        this.incrementCombo();
        return { kind: 'drift', points: pts, combo: this.comboCount, label: `DRIFT +${pts}` };
      }
    } else if (kind === 'oncoming') {
      this.oncomingPopupAccum += gained;
      if (this.oncomingPopupAccum >= 10) {
        const pts = Math.round(this.oncomingPopupAccum);
        this.oncomingPopupAccum = 0;
        this.incrementCombo();
        return { kind: 'oncoming', points: pts, combo: this.comboCount, label: `ONCOMING +${pts}` };
      }
    }
    return null;
  }

  /** Add discrete style event (near miss, jump landing, 360 spin, two wheels, prop smash, blinker turn). */
  addEvent(kind: string, basePoints: number, styleStatMult: number, labelPrefix: string): StyleAward {
    this.incrementCombo();
    const mult = styleStatMult * this.comboMult * this.activeStuntMult;
    const pts = Math.round(basePoints * mult);
    this.totalPoints += pts;
    this.farePoints += pts;
    const comboSuffix = this.comboCount > 1 ? ` x${this.comboCount}` : '';
    return {
      kind,
      points: pts,
      combo: this.comboCount,
      label: `${labelPrefix} +${pts}${comboSuffix}`,
    };
  }

  private incrementCombo(): void {
    this.comboCount += 1;
    this.comboTimer = BALANCE.styleComboWindow;
    this.comboMult = Math.min(
      BALANCE.styleComboMax,
      1.0 + (this.comboCount - 1) * BALANCE.styleComboStep
    );
    if (this.comboCount > this.bestCombo) {
      this.bestCombo = this.comboCount;
    }
  }

  breakCombo(): number {
    const lost = this.comboCount;
    this.comboCount = 0;
    this.comboMult = 1.0;
    this.comboTimer = 0;
    this.driftPopupAccum = 0;
    this.driftPopupTimer = 0;
    return lost;
  }
}
