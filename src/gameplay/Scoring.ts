import { BALANCE } from '../core/config/balance';
import { Grade } from '../core/EventBus';
import { PassengerTypeDef } from './Passenger';

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function computeTier(totalDeliveries: number): number {
  return Math.floor(Math.max(0, totalDeliveries) / BALANCE.deliveriesPerDraft);
}

export function computeDecay(tier: number): number {
  return Math.pow(BALANCE.decayBase, Math.max(0, tier));
}

export function computeVPar(tier: number): number {
  return BALANCE.vParBase + BALANCE.vParPerTier * Math.max(0, tier);
}

export function computeParTime(routeLength: number, tier: number, parMult = 1.0): number {
  const vPar = computeVPar(tier);
  return (BALANCE.parTimeOffset + routeLength / vPar) * parMult;
}

export function computePickupBonus(
  routeLength: number,
  tier: number,
  pickupStatMult = 1.0,
  passengerPickupMult = 1.0
): number {
  const decay = computeDecay(tier);
  return (
    (BALANCE.pickupBonusBase + BALANCE.pickupBonusPerMeter * routeLength) *
    decay *
    pickupStatMult *
    passengerPickupMult
  );
}

export interface RatingInputs {
  routeLength: number;
  parTime: number;
  actualTime: number;
  stylePoints: number;
  safetyPenaltySum: number;
  safetyPenaltyStatMult: number;
  passenger: PassengerTypeDef;
  daredevilCurseActive?: boolean;
  extraStyleWeight?: number;
}

export interface ComputedRatings {
  speedRating: number;
  styleRating: number;
  safetyRating: number;
  quality: number;
  grade: Grade;
}

export function computeRatings(inp: RatingInputs): ComputedRatings {
  const speedRating = clamp((1.5 * inp.parTime - inp.actualTime) / Math.max(1, inp.parTime), 0, 1);
  const styleTarget = Math.max(10, BALANCE.styleTargetPerMeter * inp.routeLength);
  const styleRating = clamp(inp.stylePoints / styleTarget, 0, 1);
  const safetyRating = inp.daredevilCurseActive
    ? 0
    : clamp(1 - inp.safetyPenaltySum * inp.safetyPenaltyStatMult, 0, 1);

  let wSpeed = inp.passenger.weights.speed;
  let wStyle = inp.passenger.weights.style + (inp.extraStyleWeight ?? 0);
  let wSafety = inp.passenger.weights.safety;
  const wSum = wSpeed + wStyle + wSafety;
  if (wSum > 0) {
    wSpeed /= wSum;
    wStyle /= wSum;
    wSafety /= wSum;
  }

  const quality = clamp(wSpeed * speedRating + wStyle * styleRating + wSafety * safetyRating, 0, 1);
  const grade = gradeFromQuality(quality);

  return { speedRating, styleRating, safetyRating, quality, grade };
}

export function gradeFromQuality(q: number): Grade {
  if (q >= BALANCE.grades.S) return 'S';
  if (q >= BALANCE.grades.A) return 'A';
  if (q >= BALANCE.grades.B) return 'B';
  if (q >= BALANCE.grades.C) return 'C';
  return 'D';
}

export interface DeliveryRewardInput {
  routeLength: number;
  tier: number;
  ratings: ComputedRatings;
  passenger: PassengerTypeDef;
  comboMult: number;
  deliveryTimeStatMult: number;
  cashStatMult: number;
  tipStatMult: number;
  perfectDrive: boolean;
  celebrityChauffeurOwned?: boolean;
  midasTriple?: boolean;
}

export interface DeliveryRewardResult {
  deliveryTimeBonus: number;
  baseFare: number;
  tip: number;
  cash: number;
}

export function computeDeliveryRewards(inp: DeliveryRewardInput): DeliveryRewardResult {
  const decay = computeDecay(inp.tier);
  const isGrandma = inp.passenger.id === 'grandma';

  // §8.2a & §9.3: Grandma uses safetyRating as timeQ instead of Q
  const timeQ = isGrandma ? inp.ratings.safetyRating : inp.ratings.quality;
  let deliveryTimeBonus =
    BALANCE.deliveryBonusPerMeter *
    inp.routeLength *
    (BALANCE.deliveryBonusMinFactor + BALANCE.deliveryBonusQualityFactor * timeQ) *
    decay *
    inp.deliveryTimeStatMult *
    inp.passenger.deliveryTimeBonusMult;

  const baseFare = BALANCE.baseFareFixed + BALANCE.baseFarePerMeter * inp.routeLength;
  let tip =
    baseFare *
    inp.ratings.quality *
    (inp.ratings.grade === 'S' ? BALANCE.gradeSTipMultiplier : 1.0) *
    inp.tipStatMult;

  if (isGrandma && inp.perfectDrive) {
    deliveryTimeBonus *= BALANCE.grandmaPerfectTimeMult;
    tip *= BALANCE.grandmaPerfectTipMult;
  }

  let typeMult = inp.passenger.cashMult;
  if (inp.passenger.id === 'celebrity' && inp.celebrityChauffeurOwned) {
    typeMult = 4.0; // Celebrity Chauffeur (#28)
  }

  let cash = (baseFare + tip) * inp.comboMult * typeMult * inp.cashStatMult;

  if (inp.midasTriple) {
    cash *= 3;
    deliveryTimeBonus *= 3;
  }

  return {
    deliveryTimeBonus: Math.round(deliveryTimeBonus * 10) / 10,
    baseFare: Math.round(baseFare),
    tip: Math.round(tip),
    cash: Math.round(cash),
  };
}
