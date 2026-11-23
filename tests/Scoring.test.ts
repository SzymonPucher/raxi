import { describe, expect, it } from 'vitest';
import { PASSENGER_TYPES } from '../src/gameplay/Passenger';
import {
  computeDeliveryRewards,
  computeParTime,
  computePickupBonus,
  computeRatings,
  gradeFromQuality,
} from '../src/gameplay/Scoring';

describe('Scoring formulas (§9)', () => {
  it('matches pickup bonus and par time formulas', () => {
    // 600m at tier 0 => 4 + 0.02 * 600 = 16s
    expect(computePickupBonus(600, 0)).toBeCloseTo(16, 4);
    // tier 1 => * 0.95
    expect(computePickupBonus(600, 1)).toBeCloseTo(15.2, 4);
    // parTime at tier 0: 5 + 600 / 15 = 45s
    expect(computeParTime(600, 0)).toBeCloseTo(45, 4);
  });

  it('computes grades from quality thresholds accurately', () => {
    expect(gradeFromQuality(0.95)).toBe('S');
    expect(gradeFromQuality(0.9)).toBe('S');
    expect(gradeFromQuality(0.75)).toBe('A');
    expect(gradeFromQuality(0.55)).toBe('B');
    expect(gradeFromQuality(0.35)).toBe('C');
    expect(gradeFromQuality(0.2)).toBe('D');
  });

  it('rewards a slow, legal Grandma ride with much more time & cash than a fast, sloppy one (§8.2a)', () => {
    const grandma = PASSENGER_TYPES.grandma;
    const par = computeParTime(600, 0, grandma.parMult);

    const legalRatings = computeRatings({
      routeLength: 600,
      parTime: par,
      actualTime: par * 1.1, // calm, slow
      stylePoints: 0,
      safetyPenaltySum: 0,
      safetyPenaltyStatMult: 1,
      passenger: grandma,
    });
    const legalRewards = computeDeliveryRewards({
      routeLength: 600,
      tier: 0,
      ratings: legalRatings,
      passenger: grandma,
      comboMult: 1,
      deliveryTimeStatMult: 1,
      cashStatMult: 1,
      tipStatMult: 1,
      perfectDrive: true,
    });

    const sloppyRatings = computeRatings({
      routeLength: 600,
      parTime: par,
      actualTime: par * 0.35, // super fast
      stylePoints: 300,
      safetyPenaltySum: 0.9, // red light + no blinker + bump
      safetyPenaltyStatMult: 1,
      passenger: grandma,
    });
    const sloppyRewards = computeDeliveryRewards({
      routeLength: 600,
      tier: 0,
      ratings: sloppyRatings,
      passenger: grandma,
      comboMult: 1,
      deliveryTimeStatMult: 1,
      cashStatMult: 1,
      tipStatMult: 1,
      perfectDrive: false,
    });

    expect(legalRatings.grade).toBe('S');
    expect(legalRewards.deliveryTimeBonus).toBeGreaterThan(sloppyRewards.deliveryTimeBonus * 2);
    expect(legalRewards.cash).toBeGreaterThan(sloppyRewards.cash * 1.5);
  });

  it('applies Daredevil License curse (safety always 0) and Midas Meter triple bonus', () => {
    const regular = PASSENGER_TYPES.regular;
    const ratings = computeRatings({
      routeLength: 600,
      parTime: 45,
      actualTime: 25,
      stylePoints: 300,
      safetyPenaltySum: 0,
      safetyPenaltyStatMult: 1,
      passenger: regular,
      daredevilCurseActive: true,
      extraStyleWeight: 0.3,
    });
    expect(ratings.safetyRating).toBe(0);

    const normal = computeDeliveryRewards({
      routeLength: 600,
      tier: 0,
      ratings,
      passenger: regular,
      comboMult: 1,
      deliveryTimeStatMult: 1,
      cashStatMult: 1,
      tipStatMult: 1,
      perfectDrive: false,
      midasTriple: false,
    });
    const midas = computeDeliveryRewards({
      routeLength: 600,
      tier: 0,
      ratings,
      passenger: regular,
      comboMult: 1,
      deliveryTimeStatMult: 1,
      cashStatMult: 1,
      tipStatMult: 1,
      perfectDrive: false,
      midasTriple: true,
    });
    expect(midas.cash).toBeCloseTo(normal.cash * 3, -1);
    expect(midas.deliveryTimeBonus).toBeCloseTo(normal.deliveryTimeBonus * 3, 0);
  });
});
