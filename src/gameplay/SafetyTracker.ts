import { BALANCE } from '../core/config/balance';

/**
 * Safety penalties tracker (§9.5).
 * Penalties accumulate per active fare; accident penalties are scaled by (1 + 1.5 * strictness) for strict passengers.
 */
export class SafetyTracker {
  public farePenalties = 0;
  public fareAccidents = 0;
  public totalAccidents = 0;
  private collisionCooldown = 0;

  resetShift(): void {
    this.farePenalties = 0;
    this.fareAccidents = 0;
    this.totalAccidents = 0;
    this.collisionCooldown = 0;
  }

  resetFare(): void {
    this.farePenalties = 0;
    this.fareAccidents = 0;
  }

  tick(dt: number): void {
    if (this.collisionCooldown > 0) {
      this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    }
  }

  getAccidentStrictnessMult(ruleStrictness: number): number {
    return 1 + BALANCE.strictAccidentMultSlope * Math.max(0, ruleStrictness);
  }

  recordTrafficHit(
    impulse: number,
    ruleStrictness: number,
    bulldozerOwned: boolean
  ): { penalty: number; carDamage: number } | null {
    if (this.collisionCooldown > 0) return null;
    this.collisionCooldown = 0.45;
    const norm = Math.max(0, Math.min(1, (impulse - 600) / 14000));
    let basePen = BALANCE.safetyTrafficHitBase + norm * (BALANCE.safetyTrafficHitMax - BALANCE.safetyTrafficHitBase);
    if (bulldozerOwned) basePen *= 0.5; // Bulldozer Bumper #14
    const penalty = basePen * this.getAccidentStrictnessMult(ruleStrictness);
    const carDamage = BALANCE.damageTrafficMin + norm * (BALANCE.damageTrafficMax - BALANCE.damageTrafficMin);
    this.farePenalties += penalty;
    this.fareAccidents += 1;
    this.totalAccidents += 1;
    return { penalty, carDamage };
  }

  recordWallHit(impulse: number, ruleStrictness: number): { penalty: number; carDamage: number } | null {
    if (this.collisionCooldown > 0) return null;
    this.collisionCooldown = 0.45;
    const norm = Math.max(0, Math.min(1, (impulse - 800) / 16000));
    const basePen = BALANCE.safetyWallHitMin + norm * (BALANCE.safetyWallHitMax - BALANCE.safetyWallHitMin);
    const penalty = basePen * this.getAccidentStrictnessMult(ruleStrictness);
    const carDamage = BALANCE.damageWallMin + norm * (BALANCE.damageWallMax - BALANCE.damageWallMin);
    this.farePenalties += penalty;
    this.fareAccidents += 1;
    this.totalAccidents += 1;
    return { penalty, carDamage };
  }

  recordPedestrianExplosion(ruleStrictness: number): number {
    const penalty = BALANCE.safetyPedExplosion * this.getAccidentStrictnessMult(ruleStrictness);
    this.farePenalties += penalty;
    this.fareAccidents += 1;
    this.totalAccidents += 1;
    return penalty;
  }

  recordPedScare(): number {
    this.farePenalties += BALANCE.safetyPedScare;
    return BALANCE.safetyPedScare;
  }

  recordHardLanding(): number {
    this.farePenalties += BALANCE.safetyHardLanding;
    return BALANCE.safetyHardLanding;
  }

  recordFlipReset(): number {
    this.farePenalties += BALANCE.safetyFlipReset;
    this.fareAccidents += 1;
    this.totalAccidents += 1;
    return BALANCE.safetyFlipReset;
  }

  recordResidentialSpeeding(dt: number): number {
    const pen = BALANCE.safetyResidentialSpeedingPerSec * dt;
    this.farePenalties += pen;
    return pen;
  }
}
