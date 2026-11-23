export const BALANCE = {
  // Shift & timer
  shiftStartTime: 90, // seconds
  shiftIntroSeconds: 3,
  shiftEndingSeconds: 2,
  breakExitCountdown: 1,
  minTimeForBreak: 5,
  deliveriesPerDraft: 3,
  lowTimeWarningSeconds: 10,
  intenseMusicSeconds: 15,

  // Timer & scoring formulas (§9)
  decayBase: 0.95,
  pickupBonusBase: 4,
  pickupBonusPerMeter: 0.02,
  deliveryBonusPerMeter: 0.025,
  deliveryBonusMinFactor: 0.4,
  deliveryBonusQualityFactor: 1.2,

  vParBase: 15, // m/s
  vParPerTier: 0.75,
  parTimeOffset: 5, // seconds

  baseFareFixed: 5,
  baseFarePerMeter: 0.02,
  gradeSTipMultiplier: 1.5,

  // Grade thresholds
  grades: {
    S: 0.9,
    A: 0.75,
    B: 0.55,
    C: 0.35,
  },

  // Delivery combo
  deliveryComboWindow: 8, // seconds
  deliveryComboStep: 0.25,
  deliveryComboMax: 3.0,

  // Pickup & drop-off (§8.3)
  pickupRadius: 6,
  dropoffRadius: 8,
  garageRadius: 7,
  stopSpeedThreshold: 3, // m/s
  stopHoldDuration: 0.4, // seconds
  boardingDuration: 0.5, // seconds
  maxWaitingPassengers: 9,
  minWaitingPassengers: 6,
  passengerSpawnRadiusMin: 70,
  passengerSpawnRadiusMax: 300,
  passengerExpireSeconds: 60,
  passengerShortDist: 500,
  passengerMediumDist: 1200,
  patienceMultiplier: 2.5,
  abandonCashPenalty: 15,

  // Grandma special multipliers (§8.2a)
  grandmaParMult: 2.5,
  grandmaPatienceMult: 4.0,
  grandmaPickupBonusMult: 1.5,
  grandmaPerfectTimeMult: 1.5,
  grandmaPerfectTipMult: 2.0,
  strictAccidentMultSlope: 1.5, // 1 + 1.5 * strictness => 2.5 for Grandma

  // Style points (§9.4)
  styleTargetPerMeter: 0.4,
  styleComboWindow: 2.0,
  styleComboStep: 0.1,
  styleComboMax: 3.0,
  styleDriftPerSec: 12,
  styleDriftMinSlipDeg: 15,
  styleDriftMinSpeed: 10,
  styleAirPerSec: 25,
  styleAirMinDuration: 0.3,
  styleCleanLandingBonus: 20,
  styleNearMissPoints: 15,
  styleNearMissRadius: 1.2, // extra clearance beyond bounding boxes
  styleNearMissRelSpeed: 15,
  styleTwoWheelsPoints: 40,
  styleBigJumpPoints: 50,
  styleSpin360Points: 80,
  styleOncomingPerSec: 4,
  styleBreakPropPoints: 3,
  styleBlinkerTurnBonus: 5,

  // Safety penalties (§9.5)
  safetyTrafficHitBase: 0.05,
  safetyTrafficHitMax: 0.25,
  safetyWallHitMin: 0.03,
  safetyWallHitMax: 0.2,
  safetyPedExplosion: 0.5,
  safetyPedScare: 0.1,
  safetyHardLanding: 0.05,
  safetyHardLandingDropMeters: 2.0,
  safetyFlipReset: 0.4,
  safetyResidentialSpeedingPerSec: 0.02,
  safetyResidentialSpeedLimitMult: 1.6,

  // Traffic rules (§9.5)
  ruleRedLight: 0.35,
  ruleNoBlinker: 0.2,
  ruleBlinkerLeadTime: 0.8,
  ruleBlinkerAutoCancelTime: 6.0,
  ruleOncomingBase: 0.15,
  ruleOncomingPerSec: 0.05,
  ruleOncomingGrace: 1.0,
  ruleSpeedingPerSec: 0.05,
  ruleSpeedingMult: 1.15,
  ruleSpeedingGrace: 1.0,

  // Car condition & damage (§8.6)
  carConditionMax: 100,
  carPerfThreshold: 50,
  carMinPerfMult: 0.55,
  carSmokeLightThreshold: 60,
  carSmokeDarkThreshold: 30,
  damagePedExplosion: 12,
  damageTrafficMin: 2,
  damageTrafficMax: 15,
  damageWallMin: 2,
  damageWallMax: 15,
  damageHardLanding: 3,
  damageFlipReset: 10,

  // Pedestrians (§7.2)
  pedMaxCount: 55,
  pedSpawnRadius: 140,
  pedDespawnRadius: 170,
  pedExplosionKnockbackUp: 2.0,
  pedExplosionSpeedKeep: 0.85,
  pedChainRadius: 3.0,
  pedChainDelay: 0.3,
  pedRespawnDelay: 20.0,
  pedDiveDetectRadius: 14.0,
  pedScareRadius: 1.0,

  // Traffic (§7.1)
  trafficBaseCount: 34,
  trafficMaxCount: 60,
  trafficSpawnMin: 110,
  trafficSpawnMax: 240,
  trafficDespawnDist: 300,
  trafficKnockImpulseThreshold: 1200,
  trafficKnockedDespawnTime: 10,
  trafficStuckTimeout: 14,
  trafficLightGreenDuration: 12,
  trafficLightYellowDuration: 2.5,

  // Difficulty & events (§9.6)
  tierTrafficScale: 0.1,
  eventStartTier: 3,
  eventDuration: 60,
  eventCooldown: 45,
  rushHourTrafficMult: 2.0,
  rainGripMult: 0.85,
  rainStyleMult: 1.3,

  // Draft (§10.2)
  draftBaseChoices: 3,
  draftBaseRerolls: 1,
  draftSkipTimeBonus: 10,
  draftRarityBase: {
    common: 60,
    uncommon: 28,
    rare: 10,
    legendary: 2,
  },
  draftTierRarityShift: 3, // +3% from common toward higher rarities per tier
  draftSynergyWeightMult: 1.5,
  draftCurseMinTier: 2,
  draftCurseChance: 0.45,
  maxActiveSlots: 2,

  // Shop (§8.7)
  shopPowerOffersCount: 3,
  shopBasePrices: {
    common: 80,
    uncommon: 150,
    rare: 300,
    legendary: 550,
    cursed: 350,
  },
  shopPriceVariance: 0.15,
  shopPriceTierSlope: 0.05,
  shopBlackMarketChance: 0.4,
  shopBlackMarketPriceMult: 1.25,
  shopRepairCostPerPct: 1.0,
  shopCleanseBasePrice: 200,
  shopCleanseTierStep: 50,
  shopRerollBasePrice: 40,
  shopRerollIncrement: 40,

  // Reset car
  resetHoldTime: 1.0,
  resetTimePenalty: 3.0,
  autoFlipTimeout: 2.0,
};

export type BalanceConfig = typeof BALANCE;
