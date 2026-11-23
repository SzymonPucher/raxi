import { describe, expect, it } from 'vitest';
import { BreakMode } from '../src/gameplay/BreakMode';
import { CarCondition } from '../src/gameplay/CarCondition';
import { RulesTracker } from '../src/gameplay/RulesTracker';
import { SafetyTracker } from '../src/gameplay/SafetyTracker';
import { ShiftTimer } from '../src/gameplay/ShiftTimer';
import { StyleTracker } from '../src/gameplay/StyleTracker';
import { Wallet } from '../src/gameplay/Wallet';
import { createMapDefinition } from '../src/world/mapData';
import { RoadProjection } from '../src/world/RoadGraph';

function makeProjection(overrides: Partial<RoadProjection> = {}): RoadProjection {
  const fromNode = { id: 'a', x: 0, y: 0, z: 0, district: 'downtown' as const, hasTrafficLight: false };
  const toNode = { id: 'b', x: 0, y: 0, z: 100, district: 'downtown' as const, hasTrafficLight: true };
  const edge = {
    id: 'e1',
    from: 'a',
    to: 'b',
    lanesPerDir: 2,
    roadType: 'avenue' as const,
    speedLimit: 18,
    width: 16,
    length: 100,
  };
  return {
    edge,
    fromNode,
    toNode,
    t: 0.5,
    closestX: 0,
    closestY: 0,
    closestZ: 50,
    distFromCenter: 2,
    signedLateral: 2,
    dirX: 0,
    dirZ: 1,
    rightX: -1,
    rightZ: 0,
    halfWidth: 8,
    laneIndex: 0,
    isOncoming: false,
    distToAheadNode: 30,
    distToNearestNode: 30,
    headingDot: 1,
    aheadNode: toNode,
    ...overrides,
  };
}

describe('ShiftTimer, Wallet, CarCondition, BreakMode & RulesTracker', () => {
  it('ShiftTimer freezes completely during Break mode (M7 acceptance)', () => {
    const timer = new ShiftTimer(60);
    timer.tick(5);
    expect(timer.remaining).toBeCloseTo(55, 5);

    timer.setFrozen(true);
    const hitZero = timer.tick(120);
    expect(hitZero).toBe(false);
    expect(timer.remaining).toBeCloseTo(55, 5);
    expect(timer.elapsed).toBeCloseTo(5, 5);

    timer.setFrozen(false);
    expect(timer.tick(60)).toBe(true);
    expect(timer.remaining).toBe(0);
  });

  it('Wallet never goes negative and tracks score separately from balance', () => {
    const wallet = new Wallet();
    wallet.earn(100);
    expect(wallet.balance).toBe(100);
    expect(wallet.totalEarned).toBe(100);

    expect(wallet.spend(150)).toBe(false);
    expect(wallet.balance).toBe(100);

    expect(wallet.spend(60)).toBe(true);
    expect(wallet.balance).toBe(40);
    expect(wallet.totalEarned).toBe(100); // score does not decrease!

    wallet.deductPenalty(999);
    expect(wallet.balance).toBe(0);
  });

  it('CarCondition scales performance below 50% and repairs back to 100%', () => {
    const cond = new CarCondition();
    expect(cond.performanceMult).toBe(1.0);
    cond.applyDamage(50, 1.0);
    expect(cond.condition).toBe(50);
    expect(cond.performanceMult).toBe(1.0);

    cond.applyDamage(50, 1.0);
    expect(cond.condition).toBe(0);
    expect(cond.performanceMult).toBeCloseTo(0.55, 5);

    cond.repair(25);
    expect(cond.condition).toBe(25);
    expect(cond.performanceMult).toBeCloseTo(0.775, 5);
  });

  it('BreakMode forbids starting with passenger on board, during draft, or <= 5s left', () => {
    const bm = new BreakMode();
    expect(bm.canStart({ hasActivePassenger: true, inDraft: false, timeRemaining: 50 }).allowed).toBe(false);
    expect(bm.canStart({ hasActivePassenger: false, inDraft: true, timeRemaining: 50 }).allowed).toBe(false);
    expect(bm.canStart({ hasActivePassenger: false, inDraft: false, timeRemaining: 4 }).allowed).toBe(false);
    expect(bm.canStart({ hasActivePassenger: false, inDraft: false, timeRemaining: 20 }).allowed).toBe(true);
  });

  it('RulesTracker ignores lack of blinker, wrong lane, and speeding, and red lights carry zero safety penalty', () => {
    const rules = new RulesTracker();

    // Approach red light outside stop line (15m) then cross stop line (9m)
    rules.update({
      dt: 0.1,
      speed: 12,
      projection: makeProjection({ distToAheadNode: 15 }),
      blinker: 'off',
      blinkerOnTime: 0,
      upcomingLightRed: true,
      ruleStrictness: 1.0,
    });
    const crossRed = rules.update({
      dt: 0.1,
      speed: 12,
      projection: makeProjection({ distToAheadNode: 9 }),
      blinker: 'off',
      blinkerOnTime: 0,
      upcomingLightRed: true,
      ruleStrictness: 1.0,
    });
    const redEv = crossRed.violations.find((v) => v.kind === 'redLight');
    expect(redEv).toBeDefined();
    expect(redEv?.penalty).toBe(0);
    expect(rules.checklist.redLights).toBe(1);

    // Unsignaled lane change (lane 0 -> 1), oncoming lane, and speeding should not be tracked
    const noViolations = rules.update({
      dt: 2.5,
      speed: 40,
      projection: makeProjection({ laneIndex: 1, distToAheadNode: 40, isOncoming: true }),
      blinker: 'off',
      blinkerOnTime: 0,
      upcomingLightRed: false,
      ruleStrictness: 1.0,
    });
    expect(noViolations.violations).toEqual([]);
    expect(rules.checklist.blinkers).toBe(0);
    expect(rules.checklist.oncoming).toBe(0);
    expect(rules.checklist.speeding).toBe(0);

    // Properly signaled lane change still auto-cancels blinker
    rules.update({
      dt: 0.1,
      speed: 12,
      projection: makeProjection({ laneIndex: 1, distToAheadNode: 40 }),
      blinker: 'left',
      blinkerOnTime: 1.0,
      upcomingLightRed: false,
      ruleStrictness: 1.0,
    });
    const signaled = rules.update({
      dt: 0.1,
      speed: 12,
      projection: makeProjection({ laneIndex: 0, distToAheadNode: 40 }),
      blinker: 'left',
      blinkerOnTime: 1.1,
      upcomingLightRed: false,
      ruleStrictness: 1.0,
    });
    expect(signaled.violations).toEqual([]);
    expect(signaled.shouldCancelBlinker).toBe(true);
  });

  it('SafetyTracker only accumulates penalties from collisions', () => {
    const safety = new SafetyTracker();
    expect(safety.farePenalties).toBe(0);

    const wall = safety.recordWallHit(4000, 0);
    expect(wall).not.toBeNull();
    expect(wall!.penalty).toBeGreaterThan(0);
    expect(safety.farePenalties).toBeCloseTo(wall!.penalty, 5);
    expect(safety.fareAccidents).toBe(1);

    safety.tick(0.5);
    const traffic = safety.recordTrafficHit(5000, 1.0, false);
    expect(traffic).not.toBeNull();
    expect(safety.fareAccidents).toBe(2);

    const ped = safety.recordPedestrianExplosion(0);
    expect(ped).toBeGreaterThan(0);
    expect(safety.fareAccidents).toBe(3);
  });

  it('does not issue a no-blinker penalty when driving straight through an intersection', () => {
    const map = createMapDefinition();
    const rules = new RulesTracker();
    // Drive straight north in the right-hand lane (x = 3.2) from z = 140 through intersection (0, 100) to z = 60
    for (let z = 140; z >= 60; z -= 2) {
      const proj = map.graph.projectPoint(3.2, z, 0, -1);
      const res = rules.update({
        dt: 0.12,
        speed: 12,
        projection: proj,
        blinker: 'off',
        blinkerOnTime: 0,
        upcomingLightRed: false,
        ruleStrictness: 1.0,
      });
      expect(res.violations.filter((v) => v.kind === 'noBlinker')).toEqual([]);
    }
    expect(rules.checklist.blinkers).toBe(0);
  });

  it('StyleTracker.addPassivePoints records points without building or extending stunt combos', () => {
    const style = new StyleTracker();
    style.addPassivePoints(25);
    expect(style.totalPoints).toBe(25);
    expect(style.farePoints).toBe(25);
    expect(style.comboCount).toBe(0);
    expect(style.comboMult).toBe(1.0);

    style.addEvent('nearMiss', 20, 1, 'NEAR MISS');
    expect(style.comboCount).toBe(1);
    style.tick(1.5);
    style.addPassivePoints(10); // does not reset comboTimer
    style.tick(0.6); // 2.1s > 2.0s window -> combo expires
    expect(style.comboCount).toBe(0);
    expect(style.totalPoints).toBe(55);
  });
});
