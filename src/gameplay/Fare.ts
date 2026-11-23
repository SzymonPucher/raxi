import { BALANCE } from '../core/config/balance';
import { PassengerTypeDef, TripLengthCategory } from './Passenger';
import { ComputedRatings, computeParTime, computeRatings } from './Scoring';

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
  };
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

export function isFarePerfectDrive(fare: ActiveFare): boolean {
  return fare.accidents === 0 && fare.ruleViolations === 0;
}

export function getFarePatienceFraction(fare: ActiveFare): number {
  return Math.max(0, Math.min(1, 1 - fare.elapsed / Math.max(1, fare.patienceMax)));
}
