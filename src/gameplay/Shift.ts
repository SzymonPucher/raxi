import { BALANCE } from '../core/config/balance';
import { Grade } from '../core/EventBus';
import { BreakMode } from './BreakMode';
import { CarCondition } from './CarCondition';
import { Difficulty } from './Difficulty';
import { ActiveFare } from './Fare';
import { RulesTracker } from './RulesTracker';
import { SafetyTracker } from './SafetyTracker';
import { ShiftTimer } from './ShiftTimer';
import { StyleTracker } from './StyleTracker';
import { Wallet } from './Wallet';

export interface ShiftSummary {
  seed: number;
  score: number;
  walletRemaining: number;
  cashSpent: number;
  itemsBought: number;
  deliveries: number;
  grades: Record<Grade, number>;
  bestStyleCombo: number;
  bestDeliveryCombo: number;
  longestDrift: number;
  maxAirtime: number;
  distanceDriven: number;
  pedestriansExploded: number;
  ruleViolations: number;
  timeSurvived: number;
  powersTaken: Array<{ id: string; name: string; icon: string; stacks: number }>;
}

/**
 * Aggregates full shift run state (§8, §9).
 */
export class Shift {
  public seed = 1;
  public readonly timer = new ShiftTimer(BALANCE.shiftStartTime);
  public readonly wallet = new Wallet();
  public readonly condition = new CarCondition();
  public readonly style = new StyleTracker();
  public readonly safety = new SafetyTracker();
  public readonly rules = new RulesTracker();
  public readonly breakMode = new BreakMode();
  public readonly difficulty = new Difficulty();

  public activeFares: ActiveFare[] = [];
  public deliveries = 0;
  public deliveriesUntilDraft = BALANCE.deliveriesPerDraft;

  // Delivery combo (§9.3)
  public deliveryComboMult = 1.0;
  public deliveryComboTimer = 0;
  public bestDeliveryCombo = 1.0;

  // Run statistics for Shift Over (§9.8) & debug balance readout (§9.7)
  public grades: Record<Grade, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  public itemsBought = 0;
  public pedestriansExploded = 0;
  public totalTimeGained = 0;
  public totalFareCycleTime = 0;
  public lastDeliveryElapsed = 0;

  reset(seed: number): void {
    this.seed = seed;
    this.timer.reset(BALANCE.shiftStartTime);
    this.wallet.reset();
    this.condition.reset();
    this.style.resetShift();
    this.safety.resetShift();
    this.rules.resetShift();
    this.breakMode.reset();
    this.difficulty.reset();
    this.activeFares = [];
    this.deliveries = 0;
    this.deliveriesUntilDraft = BALANCE.deliveriesPerDraft;
    this.deliveryComboMult = 1.0;
    this.deliveryComboTimer = 0;
    this.bestDeliveryCombo = 1.0;
    this.grades = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    this.itemsBought = 0;
    this.pedestriansExploded = 0;
    this.totalTimeGained = 0;
    this.totalFareCycleTime = 0;
    this.lastDeliveryElapsed = 0;
  }

  get score(): number {
    return this.wallet.totalEarned;
  }

  get tier(): number {
    return this.difficulty.tier;
  }

  get highestStrictness(): number {
    let max = 0;
    for (const f of this.activeFares) {
      if (f.passenger.ruleStrictness > max) max = f.passenger.ruleStrictness;
    }
    return max;
  }

  tickDeliveryCombo(dt: number): void {
    if (this.deliveryComboTimer > 0 && this.activeFares.length === 0) {
      this.deliveryComboTimer -= dt;
      if (this.deliveryComboTimer <= 0) {
        this.deliveryComboMult = 1.0;
      }
    }
  }

  onPickupStarted(chainReactionOwned: boolean): void {
    if (this.deliveryComboTimer > 0) {
      const maxCombo = chainReactionOwned ? 4.0 : BALANCE.deliveryComboMax;
      this.deliveryComboMult = Math.min(maxCombo, this.deliveryComboMult + BALANCE.deliveryComboStep);
      if (this.deliveryComboMult > this.bestDeliveryCombo) {
        this.bestDeliveryCombo = this.deliveryComboMult;
      }
    }
    this.deliveryComboTimer = 0;
  }

  onDeliveryCompleted(grade: Grade, timeGained: number, chainReactionOwned: boolean): boolean {
    this.deliveries += 1;
    this.grades[grade] += 1;
    this.difficulty.updateTier(this.deliveries);
    this.deliveryComboTimer = chainReactionOwned ? 15 : BALANCE.deliveryComboWindow;

    const cycle = this.timer.elapsed - this.lastDeliveryElapsed;
    this.totalFareCycleTime += cycle;
    this.lastDeliveryElapsed = this.timer.elapsed;
    this.totalTimeGained += timeGained;

    this.deliveriesUntilDraft =
      BALANCE.deliveriesPerDraft - (this.deliveries % BALANCE.deliveriesPerDraft);
    if (this.deliveries % BALANCE.deliveriesPerDraft === 0) {
      this.deliveriesUntilDraft = 0;
      return true; // trigger Power Draft!
    }
    return false;
  }

  getDebugBalanceReadout(): { netTimePerFare: number; avgFareCycle: number } {
    if (this.deliveries === 0) {
      return { netTimePerFare: 0, avgFareCycle: 0 };
    }
    const avgCycle = this.totalFareCycleTime / this.deliveries;
    const avgGain = this.totalTimeGained / this.deliveries;
    return {
      netTimePerFare: Math.round((avgGain - avgCycle) * 10) / 10,
      avgFareCycle: Math.round(avgCycle * 10) / 10,
    };
  }
}
