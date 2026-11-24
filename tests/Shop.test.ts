import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { CarCondition } from '../src/gameplay/CarCondition';
import { Wallet } from '../src/gameplay/Wallet';
import { PowerManager } from '../src/powers/PowerManager';
import { StatSystem } from '../src/powers/StatSystem';
import { Shop, SHOP_SPECIAL_PRICE_CHANCE, SHOP_SPECIAL_PRICE_MULT } from '../src/shop/Shop';

describe('Shop & ShopStock (§8.7, M7 acceptance)', () => {
  it('returns identical stock on repeat visits before next delivery and regenerates after delivery', () => {
    const stats = new StatSystem();
    const pm = new PowerManager(stats);
    const shop = new Shop();

    const visit1 = shop.getStock({ runSeed: 1234, deliveryCount: 2, tier: 0, powerManager: pm });
    const visit2 = shop.getStock({ runSeed: 1234, deliveryCount: 2, tier: 0, powerManager: pm });
    expect(visit1.offers.map((o) => o.power.id)).toEqual(visit2.offers.map((o) => o.power.id));
    expect(visit1.offers.map((o) => o.price)).toEqual(visit2.offers.map((o) => o.price));

    const afterDelivery = shop.getStock({ runSeed: 1234, deliveryCount: 3, tier: 1, powerManager: pm });
    expect(afterDelivery.deliveryKey).toBe(3);
    expect(afterDelivery.offers[0].offerId).not.toBe(visit1.offers[0].offerId);
  });

  it('supports buying powers, repairing pedestrian explosion damage, cleansing curses, and rerolling', () => {
    const stats = new StatSystem();
    const pm = new PowerManager(stats);
    const wallet = new Wallet();
    const condition = new CarCondition();
    const shop = new Shop();

    wallet.earn(2000);
    condition.applyDamage(36, 1.0); // 3 pedestrian explosions -> 64%
    expect(condition.condition).toBe(64);

    // Repair 25%
    const rep = shop.buyRepair({ amountPct: 25, condition, wallet, powerManager: pm });
    expect(rep.ok).toBe(true);
    expect(condition.condition).toBe(89);

    // Buy a stock power
    const stock = shop.getStock({ runSeed: 555, deliveryCount: 1, tier: 0, powerManager: pm });
    const first = stock.offers[0];
    const buy = shop.buyOffer({ offerId: first.offerId, wallet, powerManager: pm });
    expect(buy.ok).toBe(true);
    expect(pm.has(first.power.id)).toBe(true);

    // Acquire a cursed power and cleanse it in the shop
    pm.acquire('lone_wolf');
    expect(pm.isCurseActive('lone_wolf')).toBe(true);
    const cleanse = shop.buyCleanse({ powerId: 'lone_wolf', tier: 2, wallet, powerManager: pm });
    expect(cleanse.ok).toBe(true);
    expect(pm.isCurseActive('lone_wolf')).toBe(false);

    // Reroll stock escalates price +40 each use
    const cost1 = shop.getRerollCost(pm);
    expect(cost1).toBe(40);
    expect(shop.buyReroll({ runSeed: 555, deliveryCount: 1, tier: 0, wallet, powerManager: pm }).ok).toBe(true);
    expect(shop.getRerollCost(pm)).toBe(80);
  });

  it('rolls special price (~33% chance) that raises all garage prices by +50%', () => {
    expect(SHOP_SPECIAL_PRICE_CHANCE).toBeCloseTo(1 / 3, 5);
    expect(SHOP_SPECIAL_PRICE_MULT).toBe(1.5);

    const stats = new StatSystem();
    const pm = new PowerManager(stats);
    const shop = new Shop();

    // Check ~33% activation rate across 300 seeds
    let hits = 0;
    for (let seed = 1; seed <= 300; seed++) {
      if (shop.rollSpecialPrice(new Rng(seed))) hits++;
    }
    expect(hits).toBeGreaterThan(70);
    expect(hits).toBeLessThan(130);

    // Compare normal vs special price (+50% on offers, repair, cleanse, reroll)
    shop.reset();
    expect(shop.specialPriceActive).toBe(false);

    const stock = shop.getStock({ runSeed: 999, deliveryCount: 0, tier: 1, powerManager: pm });
    const baseOffer = stock.offers[0];
    const normalOfferPrice = shop.getEffectiveOfferPrice(baseOffer);
    expect(normalOfferPrice).toBe(baseOffer.price);

    const cond = new CarCondition();
    cond.applyDamage(40, 1.0);
    const normalRepair = shop.getRepairCost(cond, 25, pm);
    const normalCleanse = shop.getCleanseCost(1, pm);
    const normalReroll = shop.getRerollCost(pm);

    shop.specialPriceActive = true;
    expect(shop.getEffectiveOfferPrice(baseOffer)).toBe(Math.round(normalOfferPrice * 1.5));
    expect(shop.getRepairCost(cond, 25, pm)).toBe(Math.round(normalRepair * 1.5));
    expect(shop.getCleanseCost(1, pm)).toBe(Math.round(normalCleanse * 1.5));
    expect(shop.getRerollCost(pm)).toBe(Math.round(normalReroll * 1.5));

    // Buying an offer charges the +50% price
    const wallet = new Wallet();
    wallet.earn(2000);
    const expectedPrice = shop.getEffectiveOfferPrice(baseOffer);
    const res = shop.buyOffer({ offerId: baseOffer.offerId, wallet, powerManager: pm });
    expect(res.ok).toBe(true);
    expect(res.cost).toBe(expectedPrice);
    expect(wallet.balance).toBe(2000 - expectedPrice);

    shop.reset();
    expect(shop.specialPriceActive).toBe(false);
  });
});
