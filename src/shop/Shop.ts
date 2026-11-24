import { Rng } from '../core/Rng';
import { CarCondition } from '../gameplay/CarCondition';
import { Wallet } from '../gameplay/Wallet';
import { PowerManager } from '../powers/PowerManager';
import { PowerRegistry, defaultPowerRegistry } from '../powers/PowerRegistry';
import { PowerCtx } from '../powers/PowerTypes';
import { computeCleansePrice, computeRepairPrice, computeRerollPrice } from './Pricing';
import { ShopPowerOffer, ShopStockData, generateShopStock } from './ShopStock';

export const SHOP_SPECIAL_PRICE_CHANCE = 1 / 3;
export const SHOP_SPECIAL_PRICE_MULT = 1.5;

export const SHOP_SPECIAL_PRICE_GREETINGS: readonly string[] = [
  '„O, siema mordo, kopę lat! Dla ciebie, starego kumpla z akademika, mam dziś promocję VIP — wszystko droższe o 50%, bo wiesz, inflacja, a ja zbieram na kebsa z podwójnym mięsem i ratę za poprawkę. Wchodź śmiało, i tak wiem, że bez tego zderzaka nie dojedziesz nawet na pętlę!”',
  '„No nie wierzę, żyjesz jeszcze wariacie?! Pamiętasz, jak pożyczyłeś ode mnie piątaka na browara na pierwszym roku, to dziś w ramach przyjaźni odbijam sobie z procentem plus pięćdziesiąt procent marży sentymentalnej. Siadaj, wybieraj graty, a portfel zostaw otwarty, bo przyjaciół trzeba wspierać!”',
  '„Elo byku, dobrze widzieć starą gwardię w moim warsztacie! Specjalnie dla ciebie odpaliłem taryfę po znajomości, czyli cena z katalogu razy półtora, bo ktoś musi sfinansować mój weekendowy melanż po sesji. Nie marudź, u mnie przynajmniej wiesz, że rżnę cię na hajs z czystej sympatii!”',
  '„Siemanko stary druhu, aż mi się łezka w oku zakręciła na widok twojego portfela! Normalnie bym cię skasował jak zwykłego klienta, ale że jesteśmy kumplami od czasów zupek chińskich na sucho, dorzucam ekskluzywne +50% za sam klimat spotkania. Bierz co chcesz, najwyżej do końca miesiąca pojedziesz na samym ryżu z ketchupem!”',
  '„Cześć szefie, wpadaj jak do siebie, tylko najpierw wyciągnij gruby plik banknotów! Dla obcych mam zwykły cennik, ale dla starego przyjaciela przygotowałem pakiet premium: płacisz półtora raza więcej, a w gratisie dostajesz mój szczery uśmiech i uścisk dłoni. No dawaj, nie bądź żyła, i tak przepuścisz tę kasę na głupoty!”',
];

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
  public specialPriceActive = false;
  public specialPriceGreeting: string | null = null;

  constructor(private readonly registry: PowerRegistry = defaultPowerRegistry) {}

  reset(): void {
    this.stock = null;
    this.rerollsUsedForDelivery = 0;
    this.lastDeliveryCount = -1;
    this.specialPriceActive = false;
    this.specialPriceGreeting = null;
  }

  /**
   * On garage entry, 33% chance to meet the familiar big-nosed owner offering
   * "special price for you my friend" (+50% on everything in this visit).
   */
  rollSpecialPrice(rng: Rng): boolean {
    this.specialPriceActive = rng.chance(SHOP_SPECIAL_PRICE_CHANCE);
    this.specialPriceGreeting = this.specialPriceActive
      ? rng.pick(SHOP_SPECIAL_PRICE_GREETINGS)
      : null;
    return this.specialPriceActive;
  }

  getSpecialPriceGreeting(): string {
    return this.specialPriceGreeting ?? SHOP_SPECIAL_PRICE_GREETINGS[0];
  }

  get priceMult(): number {
    return this.specialPriceActive ? SHOP_SPECIAL_PRICE_MULT : 1.0;
  }

  getEffectiveOfferPrice(offer: ShopPowerOffer): number {
    return Math.round(offer.price * this.priceMult);
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
    const base = computeRerollPrice(
      this.rerollsUsedForDelivery,
      powerManager.stats.get('shop.priceMult')
    );
    return Math.max(10, Math.round(base * this.priceMult));
  }

  getRepairCost(condition: CarCondition, amountPct: number, powerManager: PowerManager): number {
    const actualPct = Math.min(condition.missing, Math.max(0, amountPct));
    const base = computeRepairPrice(actualPct, powerManager.stats.get('shop.repairMult'));
    return base <= 0 ? 0 : Math.max(1, Math.round(base * this.priceMult));
  }

  getCleanseCost(tier: number, powerManager: PowerManager): number {
    const base = computeCleansePrice(tier, powerManager.stats.get('shop.priceMult'));
    return Math.max(25, Math.round(base * this.priceMult));
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
    const price = this.getEffectiveOfferPrice(offer);
    if (!params.wallet.canAfford(price)) {
      return { ok: false, cost: price, error: 'Not enough cash' };
    }

    const res = params.powerManager.acquire(offer.power.id, params.ctx, params.replaceSlotIndex);
    if (!res.ok) return { ok: false, cost: 0, error: res.error };

    params.wallet.spend(price);
    offer.purchased = true;
    return { ok: true, cost: price, label: offer.power.name };
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
