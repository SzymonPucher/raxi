import { BALANCE } from '../core/config/balance';
import { Rarity } from '../powers/PowerTypes';

/**
 * Pure shop pricing functions (§8.7).
 */
export function computePowerPrice(params: {
  rarity: Rarity;
  tier: number;
  varianceFactor: number; // -1..+1 seeded
  shopPriceMult: number;
  isBlackMarket?: boolean;
}): number {
  const base = BALANCE.shopBasePrices[params.rarity];
  const varied = base * (1 + params.varianceFactor * BALANCE.shopPriceVariance);
  const tierScaled = varied * (1 + BALANCE.shopPriceTierSlope * Math.max(0, params.tier));
  const bmMult = params.isBlackMarket ? BALANCE.shopBlackMarketPriceMult : 1.0;
  return Math.max(10, Math.round(tierScaled * bmMult * params.shopPriceMult));
}

export function computeRepairPrice(missingPercent: number, repairStatMult: number): number {
  if (missingPercent <= 0) return 0;
  return Math.max(1, Math.round(missingPercent * BALANCE.shopRepairCostPerPct * repairStatMult));
}

export function computeCleansePrice(tier: number, shopPriceMult: number): number {
  const base = BALANCE.shopCleanseBasePrice + BALANCE.shopCleanseTierStep * Math.max(0, tier);
  return Math.max(25, Math.round(base * shopPriceMult));
}

export function computeRerollPrice(rerollsUsedSinceDelivery: number, shopPriceMult: number): number {
  const base =
    BALANCE.shopRerollBasePrice + BALANCE.shopRerollIncrement * Math.max(0, rerollsUsedSinceDelivery);
  return Math.max(10, Math.round(base * shopPriceMult));
}
