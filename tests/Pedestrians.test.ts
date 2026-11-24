import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/config/balance';
import { Rng } from '../src/core/Rng';
import {
  buildOneWheelRiderMesh,
  getOneWheelTimeBonus,
  OneWheelVariant,
  pickOneWheelVariant,
} from '../src/traffic/OneWheelRider';
import { PedestriansManager } from '../src/traffic/Pedestrians';
import { ArcadeVehicle } from '../src/vehicle/ArcadeVehicle';
import { createMapDefinition } from '../src/world/mapData';

function makeFakeVehicle(opts: {
  x: number;
  y?: number;
  z: number;
  fwdX?: number;
  fwdZ?: number;
  speed?: number;
  isGhost?: boolean;
}): ArcadeVehicle {
  return {
    currPosition: new THREE.Vector3(opts.x, opts.y ?? 0, opts.z),
    forwardDir: new THREE.Vector3(opts.fwdX ?? 0, 0, opts.fwdZ ?? 1).normalize(),
    speed: opts.speed ?? 0,
    isGhost: opts.isGhost ?? false,
  } as unknown as ArcadeVehicle;
}

describe('Pedestrians balance & dive-away collision', () => {
  it('reduces pedestrian flee detection radius by 70% to 4.2m and slows dive speed', () => {
    expect(BALANCE.pedDiveDetectRadius).toBeCloseTo(4.2, 5);
    expect(BALANCE.pedDiveDetectRadius).toBeCloseTo(14.0 * 0.3, 5);
    expect(BALANCE.pedDiveSpeed).toBeLessThan(3.0);
    expect(BALANCE.pedDiveSpeed).toBeGreaterThan(0);
    expect(BALANCE.pedDiveDuration).toBeGreaterThan(0);
    expect(BALANCE.oneWheelSpawnIntervalSec).toBeGreaterThan(0);
    expect(BALANCE.oneWheelTimeBonus).toBe(10);
    expect(getOneWheelTimeBonus('fatMan')).toBe(5);
    expect(getOneWheelTimeBonus('skinnyMan')).toBe(5);
    expect(getOneWheelTimeBonus('pregnantWoman')).toBe(10);
  });

  it('does not flee at 10m or 5m, starts fleeing slowly inside 4.2m, and can be hit by an approaching car', () => {
    const map = createMapDefinition();
    const peds = new PedestriansManager(map);
    const rng = new Rng(12345);

    // Spawn pedestrians around downtown
    const stationary = makeFakeVehicle({ x: 12, z: 50, speed: 0 });
    for (let i = 0; i < 15; i++) {
      peds.update(0.1, stationary, [], [], rng, i * 0.1, false);
    }

    const active = peds.getActivePedestrians();
    expect(active.length).toBeGreaterThan(0);
    const target = active[0];

    // Approach from 10m away straight toward target -> must NOT start diving
    const carAt10m = makeFakeVehicle({
      x: target.x,
      y: target.y,
      z: target.z - 10,
      fwdX: 0,
      fwdZ: 1,
      speed: 15,
    });
    peds.update(1 / 60, carAt10m, [], [], rng, 2.0, false);
    const after10m = peds.getActivePedestrians().find((p) => p.id === target.id)!;
    expect(after10m).toBeDefined();
    expect(after10m.diving).toBe(false);

    // Approach from 5m away straight toward target -> still outside 4.2m, must NOT start diving
    const carAt5m = makeFakeVehicle({
      x: after10m.x,
      y: after10m.y,
      z: after10m.z - 5,
      fwdX: 0,
      fwdZ: 1,
      speed: 15,
    });
    peds.update(1 / 60, carAt5m, [], [], rng, 2.02, false);
    const after5m = peds.getActivePedestrians().find((p) => p.id === target.id)!;
    expect(after5m).toBeDefined();
    expect(after5m.diving).toBe(false);

    // Move inside 4.2m (3.8m away) at 15 m/s -> starts diving slowly at BALANCE.pedDiveSpeed
    const carSpeed = 15;
    let carZ = after5m.z - 3.8;
    const carX = after5m.x;
    const carY = after5m.y;

    const carAt3_8m = makeFakeVehicle({
      x: carX,
      y: carY,
      z: carZ,
      fwdX: 0,
      fwdZ: 1,
      speed: carSpeed,
    });
    peds.update(1 / 60, carAt3_8m, [], [], rng, 2.04, false);
    const divingPed = peds.getActivePedestrians().find((p) => p.id === target.id)!;
    expect(divingPed).toBeDefined();
    expect(divingPed.diving).toBe(true);
    expect(Math.hypot(divingPed.vx, divingPed.vz)).toBeCloseTo(BALANCE.pedDiveSpeed, 5);
    expect(Math.hypot(divingPed.vx, divingPed.vz)).toBeLessThan(5.2);

    // Continue driving straight through at 15 m/s -> collision occurs!
    let collided = false;
    const dt = 1 / 60;
    for (let step = 0; step < 30; step++) {
      carZ += carSpeed * dt;
      const car = makeFakeVehicle({
        x: carX,
        y: carY,
        z: carZ,
        fwdX: 0,
        fwdZ: 1,
        speed: carSpeed,
      });
      const res = peds.update(dt, car, [], [], rng, 2.06 + step * dt, false);
      if (res.explosions.some((e) => !e.isChain && !e.wasPassenger)) {
        collided = true;
        break;
      }
    }
    expect(collided).toBe(true);
  });
});

describe('Special OneWheel bonus rider (+10s every 3 minutes)', () => {
  it('spawns every 180s of active driving, pauses when allowSpecialSpawn is false, and resets cleanly', () => {
    const map = createMapDefinition();
    const peds = new PedestriansManager(map);
    const rng = new Rng(777);
    const player = makeFakeVehicle({ x: 0, z: 0, fwdX: 0, fwdZ: 1, speed: 12 });

    const interval = BALANCE.oneWheelSpawnIntervalSec;

    // Just before interval -> not spawned yet
    for (let s = 0; s < interval - 1; s++) {
      peds.update(1.0, player, [], [], rng, s, true);
    }
    expect(peds.getActiveOneWheelRiders().length).toBe(0);

    // During Break mode (allowSpecialSpawn = false), timer does not advance
    for (let s = 0; s < 30; s++) {
      peds.update(1.0, player, [], [], rng, interval - 1 + s, false);
    }
    expect(peds.getActiveOneWheelRiders().length).toBe(0);

    // 1 more second of active driving hits interval -> spawns 1st OneWheel rider!
    peds.update(1.0, player, [], [], rng, interval + 30, true);
    const firstBatch = peds.getActiveOneWheelRiders();
    expect(firstBatch.length).toBe(1);

    const rider1 = firstBatch[0];
    expect(['fatMan', 'pregnantWoman', 'skinnyMan']).toContain(rider1.variant);
    const dist1 = Math.hypot(rider1.x - player.currPosition.x, rider1.z - player.currPosition.z);
    expect(dist1).toBeGreaterThanOrEqual(30);
    expect(dist1).toBeLessThanOrEqual(90);
    expect(rider1.speed).toBeGreaterThanOrEqual(4.5);
    expect(rider1.speed).toBeLessThanOrEqual(5.5);

    // Advance enough for rider1 to expire (90s) and reach 2nd interval
    const toSecond = Math.max(95, interval);
    for (let s = 0; s < toSecond; s++) {
      peds.update(1.0, player, [], [], rng, interval + 31 + s, true);
    }
    const secondBatch = peds.getActiveOneWheelRiders();
    expect(secondBatch.length).toBeGreaterThanOrEqual(1);
    expect(secondBatch[secondBatch.length - 1].id).not.toBe(rider1.id);

    // Reset clears riders and restarts the interval clock
    peds.reset();
    expect(peds.getActiveOneWheelRiders().length).toBe(0);
    peds.update(interval - 1, player, [], [], rng, 500, true);
    expect(peds.getActiveOneWheelRiders().length).toBe(0);
    peds.update(1, player, [], [], rng, 500 + interval, true);
    expect(peds.getActiveOneWheelRiders().length).toBe(1);
  });

  it('produces all three variants (fatMan, pregnantWoman, skinnyMan) across seeds', () => {
    const counts: Record<OneWheelVariant, number> = { fatMan: 0, pregnantWoman: 0, skinnyMan: 0 };
    for (let seed = 1; seed <= 300; seed++) {
      const v = pickOneWheelVariant(new Rng(seed));
      counts[v]++;
    }
    expect(counts.fatMan).toBeGreaterThan(70);
    expect(counts.pregnantWoman).toBeGreaterThan(70);
    expect(counts.skinnyMan).toBeGreaterThan(70);

    // Also verify through PedestriansManager spawns across seeds
    const map = createMapDefinition();
    const seen = new Set<OneWheelVariant>();
    const player = makeFakeVehicle({ x: 0, z: 0, fwdX: 0, fwdZ: 1, speed: 10 });
    for (let seed = 1; seed <= 40 && seen.size < 3; seed++) {
      const peds = new PedestriansManager(map);
      peds.update(BALANCE.oneWheelSpawnIntervalSec, player, [], [], new Rng(seed * 97), 180, true);
      const riders = peds.getActiveOneWheelRiders();
      expect(riders.length).toBe(1);
      seen.add(riders[0].variant);
    }
    expect(seen.has('fatMan')).toBe(true);
    expect(seen.has('pregnantWoman')).toBe(true);
    expect(seen.has('skinnyMan')).toBe(true);
  });

  it('emits 10s for pregnantWoman and 5s for fatMan/skinnyMan on non-ghost player collision', () => {
    const map = createMapDefinition();
    const peds = new PedestriansManager(map);
    const rng = new Rng(4242);
    const player = makeFakeVehicle({ x: 0, z: 0, fwdX: 0, fwdZ: 1, speed: 14 });

    // Trigger 180s spawn
    peds.update(BALANCE.oneWheelSpawnIntervalSec, player, [], [], rng, 180, true);
    const riders = peds.getActiveOneWheelRiders();
    expect(riders.length).toBe(1);
    const rider = riders[0];

    // Ghost vehicle overlapping rider should NOT trigger explosion
    const ghostPlayer = makeFakeVehicle({
      x: rider.x,
      y: rider.y,
      z: rider.z,
      speed: 14,
      isGhost: true,
    });
    const ghostRes = peds.update(1 / 60, ghostPlayer, [], [], rng, 180.02, true);
    expect(ghostRes.explosions.filter((e) => e.bonusTimeSeconds !== undefined)).toHaveLength(0);
    expect(peds.getActiveOneWheelRiders().length).toBe(1);

    // Real vehicle overlapping rider triggers explosion with +10s bonusTimeSeconds and despawns rider
    const updatedRider = peds.getActiveOneWheelRiders()[0];
    const solidPlayer = makeFakeVehicle({
      x: updatedRider.x + 0.5,
      y: updatedRider.y,
      z: updatedRider.z,
      speed: 16,
      isGhost: false,
    });
    const hitRes = peds.update(1 / 60, solidPlayer, [], [], rng, 180.04, true);
    const bonusExplosion = hitRes.explosions.find((e) => e.bonusTimeSeconds !== undefined);

    expect(bonusExplosion).toBeDefined();
    expect(bonusExplosion!.bonusTimeSeconds).toBe(getOneWheelTimeBonus(updatedRider.variant));
    expect(bonusExplosion!.oneWheelVariant).toBe(updatedRider.variant);
    expect(bonusExplosion!.isChain).toBe(false);
    expect(bonusExplosion!.wasPassenger).toBe(false);
    expect(peds.getActiveOneWheelRiders().length).toBe(0);

    const skinnyVis = buildOneWheelRiderMesh('skinnyMan');
    expect(skinnyVis.root.name).toBe('onewheel_skinnyMan');
    expect(skinnyVis.boardTilt.children.length).toBeGreaterThan(4);
  });

  it('builds distinct 3D OneWheel meshes with bonus markers for both variants', () => {
    const fatVis = buildOneWheelRiderMesh('fatMan');
    const pregVis = buildOneWheelRiderMesh('pregnantWoman');

    expect(fatVis.root.name).toBe('onewheel_fatMan');
    expect(pregVis.root.name).toBe('onewheel_pregnantWoman');
    expect(fatVis.wheel.children.length).toBeGreaterThanOrEqual(2);
    expect(pregVis.wheel.children.length).toBeGreaterThanOrEqual(2);
    expect(fatVis.markerArrow.children.length).toBeGreaterThanOrEqual(2);
    expect(pregVis.markerRing.children.length).toBeGreaterThanOrEqual(1);
  });
});
