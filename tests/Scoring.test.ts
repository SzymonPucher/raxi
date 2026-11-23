import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/config/balance';
import { addFareStyleFraction, createActiveFare, evaluateFareRatings, evaluateFareRewards } from '../src/gameplay/Fare';
import { PASSENGER_TYPES } from '../src/gameplay/Passenger';
import {
  computeDeliveryRewards,
  computeParTime,
  computePickupBonus,
  computeRatings,
  computeSpeedStyleFractionPerSec,
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

  it('gives safety-focused passengers ~5% higher trip time bonuses and updates live fare cash dynamically', () => {
    const regularPickup = computePickupBonus(600, 0, 1, PASSENGER_TYPES.regular.pickupBonusMult);
    const grandmaPickup = computePickupBonus(600, 0, 1, PASSENGER_TYPES.grandma.pickupBonusMult);
    const touristPickup = computePickupBonus(600, 0, 1, PASSENGER_TYPES.tourist.pickupBonusMult);
    expect(grandmaPickup / regularPickup).toBeCloseTo(1.05, 4);
    expect(touristPickup / regularPickup).toBeCloseTo(1.05, 4);

    const fare = createActiveFare({
      id: 'pax_live',
      passenger: PASSENGER_TYPES.regular,
      destinationName: 'Plaza',
      destinationX: 0,
      destinationY: 0,
      destinationZ: 600,
      tripCategory: 'medium',
      routeLength: 600,
      tier: 0,
      patienceStatMult: 1,
    });

    const evalCash = () =>
      evaluateFareRewards({
        fare,
        tier: 0,
        deliveriesCompleted: 0,
        deliveryComboMult: 1,
        safetyPenaltyStatMult: 1,
        deliveryTimeStatMult: 1,
        cashStatMult: 1,
        tipStatMult: 1,
        daredevilCurseActive: false,
        extraStyleWeight: 0,
        celebrityChauffeurOwned: false,
        midasMeterOwned: false,
      }).rewards.cash;

    const initialCash = evalCash();
    fare.stylePoints += 240; // style increases live cash
    const styledCash = evalCash();
    expect(styledCash).toBeGreaterThan(initialCash);

    fare.elapsed = fare.parTime * 1.1; // slower trip lowers speed rating & live cash
    const slowerCash = evalCash();
    expect(slowerCash).toBeLessThan(styledCash);

    fare.safetyPenalties += 0.4; // collision lowers safety rating & live cash
    fare.accidents += 1;
    const crashedCash = evalCash();
    expect(crashedCash).toBeLessThan(slowerCash);
  });

  it('increases style rating by ~5% per near miss and by speed formula >= 100 km/h', () => {
    // Below 100 km/h: 0% style gain
    expect(computeSpeedStyleFractionPerSec(0)).toBe(0);
    expect(computeSpeedStyleFractionPerSec(80 / 3.6)).toBe(0);
    expect(computeSpeedStyleFractionPerSec(99.9 / 3.6)).toBe(0);

    // At 100 km/h: 1% per 5s (0.01 / 5 per s)
    expect(computeSpeedStyleFractionPerSec(100 / 3.6) * 5).toBeCloseTo(0.01, 6);
    // At 140 km/h: (0.25 * (140 - 100) + 1) = 11% per 5s
    expect(computeSpeedStyleFractionPerSec(140 / 3.6) * 5).toBeCloseTo(0.11, 6);
    // At 216 km/h (60 m/s): (0.25 * (216 - 100) + 1) = 30% per 5s
    expect(computeSpeedStyleFractionPerSec(216 / 3.6) * 5).toBeCloseTo(0.3, 6);

    // Verify fare styleRating increases consistently across route lengths
    for (const routeLength of [250, 600, 1500]) {
      const fare = createActiveFare({
        id: `pax_${routeLength}`,
        passenger: PASSENGER_TYPES.regular,
        destinationName: 'Plaza',
        destinationX: 0,
        destinationY: 0,
        destinationZ: routeLength,
        tripCategory: 'medium',
        routeLength,
        tier: 0,
        patienceStatMult: 1,
      });

      // Near miss => +5%
      addFareStyleFraction(fare, BALANCE.styleNearMissRatingBonus);
      expect(evaluateFareRatings(fare, 1, false, 0).styleRating).toBeCloseTo(0.05, 5);

      // 5s at 90 km/h => +0%
      addFareStyleFraction(fare, computeSpeedStyleFractionPerSec(90 / 3.6) * 5);
      expect(evaluateFareRatings(fare, 1, false, 0).styleRating).toBeCloseTo(0.05, 5);

      // 5s at 100 km/h => +1% (total 6%)
      addFareStyleFraction(fare, computeSpeedStyleFractionPerSec(100 / 3.6) * 5);
      expect(evaluateFareRatings(fare, 1, false, 0).styleRating).toBeCloseTo(0.06, 5);

      // 5s at 216 km/h => +30% (total 36%)
      addFareStyleFraction(fare, computeSpeedStyleFractionPerSec(60) * 5);
      expect(evaluateFareRatings(fare, 1, false, 0).styleRating).toBeCloseTo(0.36, 5);
    }
  });
});
