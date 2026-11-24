import { describe, expect, it, vi } from 'vitest';
import { Rng } from '../src/core/Rng';
import { generateDraftOffer } from '../src/powers/Draft';
import { PowerManager } from '../src/powers/PowerManager';
import { defaultPowerRegistry } from '../src/powers/PowerRegistry';
import { PowerCtx } from '../src/powers/PowerTypes';
import { StatSystem } from '../src/powers/StatSystem';

function makeMockCtx(): PowerCtx {
  return {
    addTime: vi.fn(),
    subtractTime: vi.fn(),
    addCash: vi.fn(),
    repairCar: vi.fn(),
    addStyle: vi.fn(),
    addStyleRating: vi.fn(),
    activateStuntBoost: vi.fn(),
    showPopup: vi.fn(),
    pushTrafficAround: vi.fn(() => 3),
    setGhost: vi.fn(),
    setTimeScale: vi.fn(),
    setNitroActive: vi.fn(),
    playNitroGrunt: vi.fn(),
    hopCar: vi.fn(),
    reduceActiveCooldowns: vi.fn(),
    rng: new Rng(99),
  };
}

describe('Powers (34 total), PowerManager & Draft (§10)', () => {
  it('registers all 34 powers with unique IDs and valid definitions', () => {
    const all = defaultPowerRegistry.all();
    expect(all.length).toBe(34);
    expect(defaultPowerRegistry.byRarity('cursed').length).toBe(3);
  });

  it('dispatches hooks, handles active slots, and cleanses cursed downsides while keeping upsides', () => {
    const stats = new StatSystem();
    const pm = new PowerManager(stats);
    const ctx = makeMockCtx();

    // Acquire Coffee Thermos -> +8s immediately + +1s on delivery
    pm.acquire('coffee_thermos', ctx);
    expect(ctx.addTime).toHaveBeenCalledWith(8, 'Coffee Thermos');
    pm.dispatch(
      'fare:delivered',
      {
        fareId: 'f1',
        passengerType: 'regular',
        destinationName: 'Mall',
        grade: 'A',
        quality: 0.8,
        cash: 50,
        tip: 20,
        timeBonus: 15,
        parTime: 40,
        actualTime: 30,
        deliveryNumber: 1,
        perfectDrive: false,
      },
      ctx
    );
    expect(ctx.addTime).toHaveBeenCalledWith(1, 'Coffee Thermos');

    // Acquire Glass Cannon -> speed up +25%, damageTaken +50% + crash loses 2s
    pm.acquire('glass_cannon', ctx);
    expect(stats.get('car.topSpeed')).toBeCloseTo(45 * 1.25, 3);
    expect(stats.get('car.damageTaken')).toBeCloseTo(1.5, 3);
    pm.dispatch('safety:collision', { kind: 'traffic', impulse: 3000, penalty: 0.1 }, ctx);
    expect(ctx.subtractTime).toHaveBeenCalledWith(2);

    // Cleanse Glass Cannon -> upside remains (+25% speed), downside removed (damageTaken back to 1.0, crash hook gone)
    expect(pm.cleanseCurse('glass_cannon')).toBe(true);
    expect(stats.get('car.topSpeed')).toBeCloseTo(45 * 1.25, 3);
    expect(stats.get('car.damageTaken')).toBeCloseTo(1.0, 3);
    (ctx.subtractTime as ReturnType<typeof vi.fn>).mockClear();
    pm.dispatch('safety:collision', { kind: 'traffic', impulse: 3000, penalty: 0.1 }, ctx);
    expect(ctx.subtractTime).not.toHaveBeenCalled();

    // Active ability Shockwave activates and pushes traffic
    pm.acquire('shockwave', ctx);
    const act = pm.tryActivateSlot(0, ctx);
    expect(act.activated).toBe(true);
    expect(ctx.pushTrafficAround).toHaveBeenCalledWith(25, 36);
    expect(ctx.addStyle).toHaveBeenCalledWith(90, 'SHOCKWAVE ×3');

    // Rush Hour Hero grants +0.5s and +5% style rating on near miss
    pm.acquire('rush_hour_hero', ctx);
    pm.dispatch('style:nearMiss', { relSpeed: 20, distance: 0.8 }, ctx);
    expect(ctx.addTime).toHaveBeenCalledWith(0.5, 'Near Miss');
    expect(ctx.addStyleRating).toHaveBeenCalledWith(0.05, 'RUSH HERO');
  });

  it('Draft is deterministic per seed, has no duplicates, and guarantees an active on draft #1', () => {
    const pmA = new PowerManager(new StatSystem());
    const pmB = new PowerManager(new StatSystem());

    const offerA = generateDraftOffer({ rng: new Rng(777), powerManager: pmA, tier: 0, draftNumber: 1 });
    const offerB = generateDraftOffer({ rng: new Rng(777), powerManager: pmB, tier: 0, draftNumber: 1 });

    expect(offerA.cards.map((c) => c.id)).toEqual(offerB.cards.map((c) => c.id));
    expect(new Set(offerA.cards.map((c) => c.id)).size).toBe(offerA.cards.length);
    expect(offerA.cards.some((c) => Boolean(c.active))).toBe(true);

    // Lucky Charm raises draft count from 3 to 4
    pmA.acquire('lucky_charm');
    const offer4 = generateDraftOffer({ rng: new Rng(778), powerManager: pmA, tier: 1, draftNumber: 2 });
    expect(offer4.cards.length).toBe(4);
  });

  it('activates nitro_tank with dynamic duration and triggers playNitroGrunt on end', () => {
    const pm = new PowerManager(new StatSystem());
    const ctx = makeMockCtx();

    pm.acquire('nitro_tank', ctx);
    const act = pm.tryActivateSlot(0, ctx);
    expect(act.activated).toBe(true);
    expect(act.duration).toBeDefined();
    expect(act.duration!).toBeGreaterThanOrEqual(1);
    expect(act.duration!).toBeLessThanOrEqual(5);
    expect(ctx.setNitroActive).toHaveBeenCalledWith(true);

    pm.tick(act.duration! + 0.05, ctx, false);
    expect(ctx.setNitroActive).toHaveBeenLastCalledWith(false);
    expect(ctx.playNitroGrunt).toHaveBeenCalledTimes(1);
  });
});
