import { BALANCE } from '../core/config/balance';
import { PassengerTypeDef, TripLengthCategory } from './Passenger';
import {
  ComputedRatings,
  DeliveryRewardResult,
  computeDeliveryRewards,
  computeParTime,
  computeRatings,
  computeStyleTarget,
} from './Scoring';

export interface ActiveFare {
  id: string;
  passenger: PassengerTypeDef;
  destinationName: string;
  destinationX: number;
  destinationY: number;
  destinationZ: number;
  tripCategory: TripLengthCategory;
  routeLength: number;
  parTime: number;
  patienceMax: number;
  elapsed: number;
  stylePoints: number;
  safetyPenalties: number;
  accidents: number;
  ruleViolations: number;
  stopHoldTimer: number;
  hasSpecialAudio: boolean;
}

export function createActiveFare(params: {
  id: string;
  passenger: PassengerTypeDef;
  destinationName: string;
  destinationX: number;
  destinationY: number;
  destinationZ: number;
  tripCategory: TripLengthCategory;
  routeLength: number;
  tier: number;
  patienceStatMult: number;
  hasSpecialAudio?: boolean;
}): ActiveFare {
  const parTime = computeParTime(params.routeLength, params.tier, params.passenger.parMult);
  const patienceMax =
    parTime * BALANCE.patienceMultiplier * params.passenger.patienceMult * params.patienceStatMult;

  return {
    id: params.id,
    passenger: params.passenger,
    destinationName: params.destinationName,
    destinationX: params.destinationX,
    destinationY: params.destinationY,
    destinationZ: params.destinationZ,
    tripCategory: params.tripCategory,
    routeLength: params.routeLength,
    parTime,
    patienceMax,
    elapsed: 0,
    stylePoints: 0,
    safetyPenalties: 0,
    accidents: 0,
    ruleViolations: 0,
    stopHoldTimer: 0,
    hasSpecialAudio: params.hasSpecialAudio ?? false,
  };
}

export function addFareStyleFraction(fare: ActiveFare, ratingFraction: number): number {
  if (ratingFraction <= 0) return 0;
  const points = ratingFraction * computeStyleTarget(fare.routeLength);
  fare.stylePoints += points;
  return points;
}

export function evaluateFareRatings(
  fare: ActiveFare,
  safetyPenaltyStatMult: number,
  daredevilCurseActive: boolean,
  extraStyleWeight: number
): ComputedRatings {
  return computeRatings({
    routeLength: fare.routeLength,
    parTime: fare.parTime,
    actualTime: fare.elapsed,
    stylePoints: fare.stylePoints,
    safetyPenaltySum: fare.safetyPenalties,
    safetyPenaltyStatMult,
    passenger: fare.passenger,
    daredevilCurseActive,
    extraStyleWeight,
  });
}

export interface FareRewardPreview {
  ratings: ComputedRatings;
  rewards: DeliveryRewardResult;
  perfectDrive: boolean;
  midasTriple: boolean;
}

export function evaluateFareRewards(params: {
  fare: ActiveFare;
  tier: number;
  deliveriesCompleted: number;
  deliveryComboMult: number;
  safetyPenaltyStatMult: number;
  deliveryTimeStatMult: number;
  cashStatMult: number;
  tipStatMult: number;
  daredevilCurseActive: boolean;
  extraStyleWeight: number;
  celebrityChauffeurOwned: boolean;
  midasMeterOwned: boolean;
  deliveryOrderOffset?: number;
}): FareRewardPreview {
  const ratings = evaluateFareRatings(
    params.fare,
    params.safetyPenaltyStatMult,
    params.daredevilCurseActive,
    params.extraStyleWeight
  );
  const perfectDrive = isFarePerfectDrive(params.fare);
  const nextDeliveryNum = params.deliveriesCompleted + 1 + (params.deliveryOrderOffset ?? 0);
  const midasTriple = params.midasMeterOwned && nextDeliveryNum % 3 === 0;
  const rewards = computeDeliveryRewards({
    routeLength: params.fare.routeLength,
    tier: params.tier,
    ratings,
    passenger: params.fare.passenger,
    comboMult: params.deliveryComboMult,
    deliveryTimeStatMult: params.deliveryTimeStatMult,
    cashStatMult: params.cashStatMult,
    tipStatMult: params.tipStatMult,
    perfectDrive,
    celebrityChauffeurOwned: params.celebrityChauffeurOwned,
    midasTriple,
  });
  return { ratings, rewards, perfectDrive, midasTriple };
}

export function isFarePerfectDrive(fare: ActiveFare): boolean {
  return fare.accidents === 0;
}

export function getFarePatienceFraction(fare: ActiveFare): number {
  return Math.max(0, Math.min(1, 1 - fare.elapsed / Math.max(1, fare.patienceMax)));
}
