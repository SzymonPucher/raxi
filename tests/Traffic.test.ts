import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/config/balance';
import { Rng } from '../src/core/Rng';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import {
  CYCLIST_SPEED_MAX,
  CYCLIST_SPEED_MIN,
  TRAFFIC_POOL_KINDS,
  VEHICLE_SPECS,
  getCyclistCruiseSpeed,
  pickTrafficKindForPoolIndex,
} from '../src/traffic/TrafficCar';
import { TrafficLights } from '../src/traffic/TrafficLights';
import {
  CYCLIST_POOL_COUNT,
  TrafficManager,
  computeCarLaneOffset,
  computeCyclistLaneOffset,
} from '../src/traffic/TrafficManager';
import { ArcadeVehicle } from '../src/vehicle/ArcadeVehicle';
import { createMapDefinition } from '../src/world/mapData';

function createMockPlayer(x = 0, y = 0.7, z = 0, vx = 0, vz = 0): ArcadeVehicle {
  return {
    currPosition: new THREE.Vector3(x, y, z),
    velocity: new THREE.Vector3(vx, 0, vz),
    speed: Math.hypot(vx, vz),
    isGhost: false,
  } as unknown as ArcadeVehicle;
}

describe('Traffic distribution (bus & truck 80% reduction)', () => {
  it('reduces bus and truck pool shares by 80% (~3.3% each) and replaces them with regular cars', () => {
    expect(TRAFFIC_POOL_KINDS.length).toBe(BALANCE.trafficMaxCount);

    const counts: Record<string, number> = {
      sedan: 0,
      hatchback: 0,
      van: 0,
      bus: 0,
      truck: 0,
      police: 0,
    };
    for (const kind of TRAFFIC_POOL_KINDS) {
      counts[kind] = (counts[kind] ?? 0) + 1;
    }

    const total = TRAFFIC_POOL_KINDS.length;
    const busShare = counts.bus / total;
    const truckShare = counts.truck / total;
    const regularShare = (counts.sedan + counts.hatchback + counts.van) / total;
    const policeShare = counts.police / total;

    // Previously 1/6 (16.67%) each -> 80% reduction gives 1/30 (3.33%) each
    expect(counts.bus).toBe(2);
    expect(counts.truck).toBe(2);
    expect(busShare).toBeCloseTo(1 / 30, 5);
    expect(truckShare).toBeCloseTo(1 / 30, 5);
    expect(busShare).toBeLessThanOrEqual(0.04);
    expect(truckShare).toBeLessThanOrEqual(0.04);

    // Removed 16 bus/truck slots replaced with sedan, hatchback, van (30 -> 46 of 60)
    expect(counts.sedan + counts.hatchback + counts.van).toBe(46);
    expect(regularShare).toBeCloseTo(46 / 60, 5);
    expect(counts.sedan).toBeGreaterThan(10);
    expect(counts.hatchback).toBeGreaterThan(10);
    expect(counts.van).toBeGreaterThan(10);
    expect(policeShare).toBeCloseTo(1 / 6, 5);
  });

  it('cycles deterministically via pickTrafficKindForPoolIndex across arbitrary indices', () => {
    const sampleCount = 300;
    let buses = 0;
    let trucks = 0;
    for (let i = 0; i < sampleCount; i++) {
      const k = pickTrafficKindForPoolIndex(i);
      if (k === 'bus') buses++;
      if (k === 'truck') trucks++;
    }
    expect(buses / sampleCount).toBeCloseTo(1 / 30, 5);
    expect(trucks / sampleCount).toBeCloseTo(1 / 30, 5);
    expect(pickTrafficKindForPoolIndex(-1)).toBe(pickTrafficKindForPoolIndex(29));
  });
});

describe('Cyclist specs, lane offset, and cruise speed', () => {
  it('defines a lightweight, narrow cyclist spec with realistic slower cruise speeds', () => {
    const spec = VEHICLE_SPECS.cyclist;
    expect(spec).toBeDefined();
    expect(spec.kind).toBe('cyclist');
    expect(spec.mass).toBeLessThan(150);
    expect(spec.w).toBeLessThan(1.0);
    expect(spec.l).toBeLessThan(2.2);

    const speeds = Array.from({ length: 16 }, (_, i) => getCyclistCruiseSpeed(i + 1));
    for (const s of speeds) {
      expect(s).toBeGreaterThanOrEqual(CYCLIST_SPEED_MIN);
      expect(s).toBeLessThanOrEqual(CYCLIST_SPEED_MAX);
    }
    expect(Math.min(...speeds)).toBeCloseTo(CYCLIST_SPEED_MIN, 5);
    expect(Math.max(...speeds)).toBeCloseTo(CYCLIST_SPEED_MAX, 5);
  });

  it('places cyclists closer to the right edge of the lane than regular cars while staying on asphalt', () => {
    const testEdges = [
      { width: 12, lanesPerDir: 1, isOneWay: false, isRoundabout: false }, // 2-lane street
      { width: 16, lanesPerDir: 2, isOneWay: false, isRoundabout: false }, // 4-lane avenue
      { width: 11, lanesPerDir: 1, isOneWay: false, isRoundabout: false }, // country road
      { width: 8, lanesPerDir: 1, isOneWay: true, isRoundabout: false }, // 1-lane one-way
      { width: 8, lanesPerDir: 1, isOneWay: true, isRoundabout: true }, // roundabout ring
    ];

    for (const edge of testEdges) {
      const cyclistOffset = computeCyclistLaneOffset(edge);
      const halfW = edge.width * 0.5;
      const rightmostCarOffset = computeCarLaneOffset(edge, edge.lanesPerDir - 1);

      expect(cyclistOffset).toBeGreaterThan(rightmostCarOffset);
      expect(cyclistOffset).toBeLessThan(halfW - 0.35);
    }
  });
});

describe('TrafficManager integration (pool, random slot spawning, cyclists)', () => {
  it('builds the reduced bus/truck car pool plus a dedicated cyclist pool', async () => {
    await PhysicsWorld.initRapier();
    const map = createMapDefinition();
    const physics = new PhysicsWorld();
    const lights = new TrafficLights(map);
    const traffic = new TrafficManager(map, physics, lights);

    expect(traffic.cars.length).toBe(BALANCE.trafficMaxCount);
    expect(traffic.cyclists.length).toBe(CYCLIST_POOL_COUNT);
    expect(traffic.cyclists.length).toBeGreaterThanOrEqual(8);
    expect(traffic.group.children.length).toBe(BALANCE.trafficMaxCount + CYCLIST_POOL_COUNT);

    const busCount = traffic.cars.filter((c) => c.spec.kind === 'bus').length;
    const truckCount = traffic.cars.filter((c) => c.spec.kind === 'truck').length;
    expect(busCount).toBe(2);
    expect(truckCount).toBe(2);

    for (const cyc of traffic.cyclists) {
      expect(cyc.spec.kind).toBe('cyclist');
      expect(cyc.isCyclist).toBe(true);
      expect(traffic.getCarById(cyc.id)).toBe(cyc);
      // Paint frame+rider, details, 2 animated wheels, 2 animated legs
      expect(cyc.mesh.children.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('spawns random inactive car slots and spawns slower right-edge cyclists alongside cars', async () => {
    await PhysicsWorld.initRapier();
    const map = createMapDefinition();
    const physics = new PhysicsWorld();
    const lights = new TrafficLights(map);
    const traffic = new TrafficManager(map, physics, lights);
    const rng = new Rng(1337);
    const player = createMockPlayer(0, 0.7, 0);

    // Step enough frames for both cars and cyclists to spawn and accelerate to cruising speed
    for (let step = 0; step < 80; step++) {
      traffic.update(0.1, player, BALANCE.trafficBaseCount, rng, false);
    }

    const activeCars = traffic.cars.filter((c) => c.active);
    const activeCyclists = traffic.cyclists.filter((c) => c.active);

    expect(activeCars.length).toBeGreaterThanOrEqual(20);
    expect(activeCyclists.length).toBeGreaterThanOrEqual(4);

    // Random slot selection means active car IDs should not just be contiguous 1..N
    const maxCarId = Math.max(...activeCars.map((c) => c.id));
    expect(maxCarId).toBeGreaterThan(activeCars.length + 5);

    // Cyclists ride slower than regular cars and stay near the right edge of their road
    for (const cyc of activeCyclists) {
      expect(cyc.speed).toBeLessThanOrEqual(CYCLIST_SPEED_MAX + 0.2);
      if (cyc.edge) {
        const expectedOffset = computeCyclistLaneOffset(cyc.edge);
        const rightmostCarOffset = computeCarLaneOffset(cyc.edge, cyc.edge.lanesPerDir - 1);
        expect(cyc.laneOffset).toBeCloseTo(expectedOffset, 4);
        expect(cyc.laneOffset).toBeGreaterThan(rightmostCarOffset);
      }
    }

    const avgCarSpeed =
      activeCars.reduce((acc, c) => acc + c.speed, 0) / Math.max(1, activeCars.length);
    const avgCyclistSpeed =
      activeCyclists.reduce((acc, c) => acc + c.speed, 0) / Math.max(1, activeCyclists.length);
    expect(avgCyclistSpeed).toBeLessThan(avgCarSpeed);
  });

  it('supports horn swerving, near-misses, and knocking for cyclists', async () => {
    await PhysicsWorld.initRapier();
    const map = createMapDefinition();
    const physics = new PhysicsWorld();
    const lights = new TrafficLights(map);
    const traffic = new TrafficManager(map, physics, lights);
    const rng = new Rng(42);

    const edge = map.graph.edges.find((e) => !e.isShortcut && e.roadType === 'street' && e.length >= 50)!;
    const fromN = map.graph.getNode(edge.from)!;
    const toN = map.graph.getNode(edge.to)!;
    const dx = toN.x - fromN.x;
    const dz = toN.z - fromN.z;
    const len = Math.hypot(dx, dz);
    const dirX = dx / len;
    const dirZ = dz / len;
    const laneOffset = computeCyclistLaneOffset(edge);
    const sx = fromN.x + dx * 0.5 - dirZ * laneOffset;
    const sz = fromN.z + dz * 0.5 + dirX * laneOffset;
    const sy = map.heightMap.sample(sx, sz) + VEHICLE_SPECS.cyclist.h * 0.5 + 0.04;

    const cyclist = traffic.cyclists[0];
    cyclist.spawnOnEdge(edge, true, len * 0.5, laneOffset, sx, sy, sz, Math.atan2(-dirX, -dirZ));

    // Horn reaction ahead of player triggers swerve on cyclist
    traffic.reactToHorn(sx - dirX * 10, sz - dirZ * 10, dirX, dirZ, false);
    expect(cyclist.swerveOffset).toBeGreaterThan(0);
    expect(cyclist.swerveTimer).toBeGreaterThan(0);

    // High-speed pass beside cyclist triggers near-miss without knocking them down
    const fastPlayer = createMockPlayer(
      sx - dirZ * -2.6,
      sy,
      sz + dirX * -2.6,
      dirX * 26,
      dirZ * 26
    );
    const hits = traffic.update(0.016, fastPlayer, 10, rng, true);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(cyclist.knocked).toBe(false);

    // Direct knock via knockCarById transitions cyclist to dynamic knocked state
    traffic.knockCarById(cyclist.id, new THREE.Vector3(20, 0, 0), false);
    expect(cyclist.knocked).toBe(true);
  });
});
