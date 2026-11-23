import { CarCondition } from '../gameplay/CarCondition';
import { Wallet } from '../gameplay/Wallet';
import { PowerManager } from '../powers/PowerManager';
import { PowerRegistry, defaultPowerRegistry } from '../powers/PowerRegistry';
import { PowerCtx } from '../powers/PowerTypes';
import { computeCleansePrice, computeRepairPrice, computeRerollPrice } from './Pricing';
import { ShopPowerOffer, ShopStockData, generateShopStock } from './ShopStock';

export interface PurchaseResult {
  ok: boolean;
  cost: number;
  label?: string;
  error?: string;
}

/**
 * Pure Garage Shop controller (§8.7):
 * - Caches stock per `deliveryCount` so repeat visits before the next delivery show identical stock
 * - Regenerates on delivery completion or paid reroll
 * - Handles power purchase, repair 25%/full, curse cleanse, and stock reroll
 */
export class Shop {
  private stock: ShopStockData | null = null;
  private rerollsUsedForDelivery = 0;
  private lastDeliveryCount = -1;

  constructor(private readonly registry: PowerRegistry = defaultPowerRegistry) {}

  reset(): void {
    this.stock = null;
    this.rerollsUsedForDelivery = 0;
    this.lastDeliveryCount = -1;
  }

  getStock(params: {
    runSeed: number;
    deliveryCount: number;
    tier: number;
    powerManager: PowerManager;
  }): ShopStockData {
    if (!this.stock || this.lastDeliveryCount !== params.deliveryCount) {
      this.lastDeliveryCount = params.deliveryCount;
      this.rerollsUsedForDelivery = 0;
      this.stock = generateShopStock({
        runSeed: params.runSeed,
        deliveryCount: params.deliveryCount,
        rerollIndex: 0,
        tier: params.tier,
        powerManager: params.powerManager,
        registry: this.registry,
      });
    }
    return this.stock;
  }

  getRerollCost(powerManager: PowerManager): number {
    return computeRerollPrice(this.rerollsUsedForDelivery, powerManager.stats.get('shop.priceMult'));
  }

  getRepairCost(condition: CarCondition, amountPct: number, powerManager: PowerManager): number {
    const actualPct = Math.min(condition.missing, Math.max(0, amountPct));
    return computeRepairPrice(actualPct, powerManager.stats.get('shop.repairMult'));
  }

  getCleanseCost(tier: number, powerManager: PowerManager): number {
    return computeCleansePrice(tier, powerManager.stats.get('shop.priceMult'));
  }

  buyOffer(params: {
    offerId: string;
    wallet: Wallet;
    powerManager: PowerManager;
    ctx?: PowerCtx;
    replaceSlotIndex?: number;
  }): PurchaseResult {
    if (!this.stock) return { ok: false, cost: 0, error: 'No stock' };
    const offer: ShopPowerOffer | undefined = this.stock.offers.find(
      (o) => o.offerId === params.offerId
    );
    if (!offer) return { ok: false, cost: 0, error: 'Offer not found' };
    if (offer.purchased) return { ok: false, cost: 0, error: 'Already purchased' };
    if (params.powerManager.isMaxed(offer.power.id)) {
      return { ok: false, cost: 0, error: 'Power already maxed' };
    }
    if (!params.wallet.canAfford(offer.price)) {
      return { ok: false, cost: offer.price, error: 'Not enough cash' };
    }

    const res = params.powerManager.acquire(offer.power.id, params.ctx, params.replaceSlotIndex);
    if (!res.ok) return { ok: false, cost: 0, error: res.error };

    params.wallet.spend(offer.price);
    offer.purchased = true;
    return { ok: true, cost: offer.price, label: offer.power.name };
  }

  buyRepair(params: {
    amountPct: number;
    condition: CarCondition;
    wallet: Wallet;
    powerManager: PowerManager;
  }): PurchaseResult {
    const missing = params.condition.missing;
    if (missing <= 0.1) return { ok: false, cost: 0, error: 'Car already at 100%' };
    const pct = Math.min(missing, params.amountPct);
    const cost = this.getRepairCost(params.condition, pct, params.powerManager);
    if (!params.wallet.canAfford(cost)) {
      return { ok: false, cost, error: 'Not enough cash' };
    }
    params.wallet.spend(cost);
    const repaired = params.condition.repair(pct);
    return { ok: true, cost, label: `Repair +${Math.round(repaired)}%` };
  }

  buyCleanse(params: {
    powerId: string;
    tier: number;
    wallet: Wallet;
    powerManager: PowerManager;
  }): PurchaseResult {
    if (!params.powerManager.isCurseActive(params.powerId)) {
      return { ok: false, cost: 0, error: 'Curse not active' };
    }
    const cost = this.getCleanseCost(params.tier, params.powerManager);
    if (!params.wallet.canAfford(cost)) {
      return { ok: false, cost, error: 'Not enough cash' };
    }
    const cleansed = params.powerManager.cleanseCurse(params.powerId);
    if (!cleansed) return { ok: false, cost: 0, error: 'Cannot cleanse' };
    params.wallet.spend(cost);
    const name = this.registry.get(params.powerId)?.name ?? params.powerId;
    return { ok: true, cost, label: `Cleansed ${name}` };
  }

  buyReroll(params: {
    runSeed: number;
    deliveryCount: number;
    tier: number;
    wallet: Wallet;
    powerManager: PowerManager;
  }): PurchaseResult {
    const cost = this.getRerollCost(params.powerManager);
    if (!params.wallet.canAfford(cost)) {
      return { ok: false, cost, error: 'Not enough cash' };
    }
    params.wallet.spend(cost);
    this.rerollsUsedForDelivery += 1;
    this.stock = generateShopStock({
      runSeed: params.runSeed,
      deliveryCount: params.deliveryCount,
      rerollIndex: this.rerollsUsedForDelivery,
      tier: params.tier,
      powerManager: params.powerManager,
      registry: this.registry,
    });
    return { ok: true, cost, label: 'Rerolled Stock' };
  }
}
