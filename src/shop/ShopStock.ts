import { BALANCE } from '../core/config/balance';
import { Rng } from '../core/Rng';
import { PowerManager } from '../powers/PowerManager';
import { PowerRegistry, defaultPowerRegistry } from '../powers/PowerRegistry';
import { PowerDef, Rarity } from '../powers/PowerTypes';
import { computePowerPrice } from './Pricing';

export interface ShopPowerOffer {
  offerId: string;
  power: PowerDef;
  price: number;
  isBlackMarket: boolean;
  purchased: boolean;
}

export interface ShopStockData {
  deliveryKey: number;
  rerollIndex: number;
  offers: ShopPowerOffer[];
}

/**
 * Deterministic garage shop stock (§8.7):
 * Seeded from (runSeed, deliveryCount, rerollIndex) so visiting any garage twice between
 * deliveries yields IDENTICAL stock, and completing a delivery regenerates fresh stock.
 */
export function generateShopStock(params: {
  runSeed: number;
  deliveryCount: number;
  rerollIndex: number;
  tier: number;
  powerManager: PowerManager;
  registry?: PowerRegistry;
}): ShopStockData {
  const registry = params.registry ?? defaultPowerRegistry;
  const rng = new Rng(params.runSeed).fork(`shop:${params.deliveryCount}:${params.rerollIndex}`);
  const shopPriceMult = params.powerManager.stats.get('shop.priceMult');
  const ownedTags = params.powerManager.getOwnedTags();

  const eligible = registry
    .all()
    .filter(
      (p) =>
        p.rarity !== 'cursed' &&
        !params.powerManager.isMaxed(p.id) &&
        (p.minTier ?? 0) <= params.tier
    );

  const shift = Math.min(40, params.tier * BALANCE.draftTierRarityShift);
  const rarityWeights: Record<Exclude<Rarity, 'cursed'>, number> = {
    common: Math.max(20, BALANCE.draftRarityBase.common - shift),
    uncommon: BALANCE.draftRarityBase.uncommon + shift * 0.45,
    rare: BALANCE.draftRarityBase.rare + shift * 0.38,
    legendary: BALANCE.draftRarityBase.legendary + shift * 0.17,
  };

  const offers: ShopPowerOffer[] = [];
  const pickedIds = new Set<string>();

  const pickOne = (pool: PowerDef[], useRarityWeights: boolean): PowerDef | null => {
    const avail = pool.filter((p) => !pickedIds.has(p.id));
    if (avail.length === 0) return null;
    const weights = avail.map((p) => {
      let w = 1;
      if (useRarityWeights) {
        const rKey = p.rarity as Exclude<Rarity, 'cursed'>;
        const count = Math.max(1, avail.filter((x) => x.rarity === p.rarity).length);
        w = rarityWeights[rKey] / count;
      }
      if (p.tags.some((t) => ownedTags.has(t))) {
        w *= BALANCE.draftSynergyWeightMult;
      }
      return w;
    });
    return rng.weightedPick(avail, weights);
  };

  // 3 regular power offers
  for (let i = 0; i < BALANCE.shopPowerOffersCount; i++) {
    const p = pickOne(eligible, true);
    if (!p) break;
    pickedIds.add(p.id);
    const variance = rng.range(-1, 1);
    offers.push({
      offerId: `offer_${params.deliveryCount}_${params.rerollIndex}_${i}`,
      power: p,
      price: computePowerPrice({
        rarity: p.rarity,
        tier: params.tier,
        varianceFactor: variance,
        shopPriceMult,
        isBlackMarket: false,
      }),
      isBlackMarket: false,
      purchased: false,
    });
  }

  // Black market (40% chance of 1 extra Rare or Legendary at +25% price)
  if (rng.chance(BALANCE.shopBlackMarketChance)) {
    const bmPool = eligible.filter((p) => p.rarity === 'rare' || p.rarity === 'legendary');
    const bm = pickOne(bmPool, false);
    if (bm) {
      pickedIds.add(bm.id);
      const variance = rng.range(-1, 1);
      offers.push({
        offerId: `bm_${params.deliveryCount}_${params.rerollIndex}`,
        power: bm,
        price: computePowerPrice({
          rarity: bm.rarity,
          tier: params.tier,
          varianceFactor: variance,
          shopPriceMult,
          isBlackMarket: true,
        }),
        isBlackMarket: true,
        purchased: false,
      });
    }
  }

  return {
    deliveryKey: params.deliveryCount,
    rerollIndex: params.rerollIndex,
    offers,
  };
}
