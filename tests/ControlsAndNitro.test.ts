import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Rng } from '../src/core/Rng';
import { createEmptyInputState } from '../src/input/Actions';
import { DEFAULT_KEY_BINDINGS } from '../src/input/bindings';
import { PowerManager } from '../src/powers/PowerManager';
import { PowerCtx } from '../src/powers/PowerTypes';
import {
  NITRO_NORMAL_DURATION,
  NITRO_RANDOM_MAX_DURATION,
  NITRO_RANDOM_MIN_DURATION,
  rollNitroDuration,
} from '../src/powers/powers/actives';
import { StatSystem } from '../src/powers/StatSystem';
import {
  ArcadeVehicle,
  canTurnAround180,
  computeTurnAround180Quat,
  computeTurnAround180Yaw,
} from '../src/vehicle/ArcadeVehicle';

function makeMockCtx(seed = 42): PowerCtx {
  return {
    addTime: vi.fn(),
    subtractTime: vi.fn(),
    addCash: vi.fn(),
    repairCar: vi.fn(),
    addStyle: vi.fn(),
    addStyleRating: vi.fn(),
    activateStuntBoost: vi.fn(),
    showPopup: vi.fn(),
    pushTrafficAround: vi.fn(() => 0),
    setGhost: vi.fn(),
    setTimeScale: vi.fn(),
    setNitroActive: vi.fn(),
    playNitroGrunt: vi.fn(),
    hopCar: vi.fn(),
    reduceActiveCooldowns: vi.fn(),
    rng: new Rng(seed),
  };
}

describe('180° Turnaround Control & Math', () => {
  it('binds turnAround to KeyT and defaults InputState.turnAround to false', () => {
    expect(DEFAULT_KEY_BINDINGS.turnAround).toEqual(['KeyT']);
    expect(createEmptyInputState().turnAround).toBe(false);
  });

  it('allows turnaround only when speed is strictly below 10 km/h', () => {
    expect(canTurnAround180(0)).toBe(true);
    expect(canTurnAround180(5 / 3.6)).toBe(true);
    expect(canTurnAround180(9.9 / 3.6)).toBe(true);
    expect(canTurnAround180(-9.9 / 3.6)).toBe(true);

    expect(canTurnAround180(10 / 3.6)).toBe(false);
    expect(canTurnAround180(15 / 3.6)).toBe(false);
    expect(canTurnAround180(50 / 3.6)).toBe(false);
    expect(canTurnAround180(-10 / 3.6)).toBe(false);
  });

  it('rotates yaw by 180° around world Y while staying upright', () => {
    const testYaws = [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 3, -2.1];
    for (const yaw of testYaws) {
      const beforeQuat = new THREE.Quaternion(0, Math.sin(yaw * 0.5), 0, Math.cos(yaw * 0.5));
      const beforeFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(beforeQuat);

      const nextYaw = computeTurnAround180Yaw(yaw);
      const rot = computeTurnAround180Quat(yaw);
      expect(rot.x).toBe(0);
      expect(rot.z).toBe(0);

      const afterQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
      const afterFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(afterQuat);
      const afterUp = new THREE.Vector3(0, 1, 0).applyQuaternion(afterQuat);

      // Forward vector is inverted (180° turn), up vector remains world +Y
      expect(afterFwd.dot(beforeFwd)).toBeCloseTo(-1, 5);
      expect(afterUp.x).toBeCloseTo(0, 5);
      expect(afterUp.y).toBeCloseTo(1, 5);
      expect(afterUp.z).toBeCloseTo(0, 5);
      expect(Math.abs(nextYaw)).toBeLessThanOrEqual(Math.PI + 1e-6);
    }
  });

  it('ArcadeVehicle.turnAround180 rotates body below 10 km/h and refuses at >= 10 km/h', () => {
    let bodyRot = { x: 0, y: 0, z: 0, w: 1 };
    let bodyLinvel = { x: 1.2, y: -0.5, z: -1.5 };
    let bodyAngvel = { x: 0.1, y: 0.8, z: -0.2 };
    const bodyPos = { x: 12, y: 1.5, z: -8 };

    const mockBody = {
      translation: () => bodyPos,
      rotation: () => bodyRot,
      linvel: () => bodyLinvel,
      setRotation: vi.fn((r: { x: number; y: number; z: number; w: number }) => {
        bodyRot = r;
      }),
      setLinvel: vi.fn((v: { x: number; y: number; z: number }) => {
        bodyLinvel = v;
      }),
      setAngvel: vi.fn((a: { x: number; y: number; z: number }) => {
        bodyAngvel = a;
      }),
    };

    const fakeVehicle = Object.create(ArcadeVehicle.prototype) as ArcadeVehicle;
    Object.assign(fakeVehicle, {
      body: mockBody,
      currPosition: new THREE.Vector3(),
      prevPosition: new THREE.Vector3(),
      currQuaternion: new THREE.Quaternion(0, 0, 0, 1),
      prevQuaternion: new THREE.Quaternion(0, 0, 0, 1),
      velocity: new THREE.Vector3(1.2, -0.5, -1.5),
      forwardDir: new THREE.Vector3(0, 0, -1),
      rightDir: new THREE.Vector3(1, 0, 0),
      upDir: new THREE.Vector3(0, 1, 0),
      speed: 10 / 3.6, // exactly 10 km/h -> must be rejected
      forwardSpeed: 10 / 3.6,
      lateralSpeed: 0,
    });

    expect(fakeVehicle.turnAround180()).toBe(false);
    expect(mockBody.setRotation).not.toHaveBeenCalled();

    // Below 10 km/h (e.g., 5 km/h) -> executes turnaround
    fakeVehicle.speed = 5 / 3.6;
    expect(fakeVehicle.turnAround180()).toBe(true);
    expect(mockBody.setRotation).toHaveBeenCalledTimes(1);
    expect(bodyAngvel).toEqual({ x: 0, y: 0, z: 0 });
    expect(bodyLinvel).toEqual({ x: 0, y: -0.5, z: 0 });
    expect(fakeVehicle.forwardDir.z).toBeCloseTo(1, 5);
    expect(fakeVehicle.rightDir.x).toBeCloseTo(-1, 5);
    expect(fakeVehicle.upDir.y).toBeCloseTo(1, 5);
    expect(fakeVehicle.prevQuaternion.equals(fakeVehicle.currQuaternion)).toBe(true);
  });
});

describe('Randomized Nitro Duration & End Grunt', () => {
  it('rollNitroDuration returns exact 3s ~50% of the time and random [1, 5]s the other ~50%', () => {
    const samples = 2000;
    let exactNormalCount = 0;
    const nonNormalValues: number[] = [];

    for (let seed = 1; seed <= samples; seed++) {
      const dur = rollNitroDuration(new Rng(seed));
      expect(dur).toBeGreaterThanOrEqual(NITRO_RANDOM_MIN_DURATION);
      expect(dur).toBeLessThanOrEqual(NITRO_RANDOM_MAX_DURATION);
      if (dur === NITRO_NORMAL_DURATION) {
        exactNormalCount++;
      } else {
        nonNormalValues.push(dur);
      }
    }

    const normalRatio = exactNormalCount / samples;
    expect(normalRatio).toBeGreaterThan(0.45);
    expect(normalRatio).toBeLessThan(0.55);
    expect(nonNormalValues.length).toBeGreaterThan(samples * 0.45);
    // Ensure non-normal durations actually span below and above 3s
    expect(Math.min(...nonNormalValues)).toBeLessThan(1.2);
    expect(Math.max(...nonNormalValues)).toBeGreaterThan(4.8);
    expect(new Set(nonNormalValues).size).toBeGreaterThan(500);
  });

  it('PowerManager activates nitro_tank with rolled duration and invokes playNitroGrunt on expiry', () => {
    // Pick a deterministic seed where rollNitroDuration returns a non-3 duration to prove getDuration is used
    let nonNormalSeed = 1;
    let expectedDuration = NITRO_NORMAL_DURATION;
    for (let s = 1; s < 500; s++) {
      const rolled = rollNitroDuration(new Rng(s));
      if (rolled !== NITRO_NORMAL_DURATION) {
        nonNormalSeed = s;
        expectedDuration = rolled;
        break;
      }
    }
    expect(expectedDuration).not.toBe(NITRO_NORMAL_DURATION);

    const stats = new StatSystem();
    const pm = new PowerManager(stats);
    const ctx = makeMockCtx(nonNormalSeed);

    pm.acquire('nitro_tank', ctx);
    const result = pm.tryActivateSlot(0, ctx);

    expect(result.activated).toBe(true);
    expect(result.powerId).toBe('nitro_tank');
    expect(result.duration).toBeCloseTo(expectedDuration, 6);
    expect(pm.activeSlots[0]?.activeRemaining).toBeCloseTo(expectedDuration, 6);
    expect(ctx.setNitroActive).toHaveBeenCalledWith(true);
    expect(ctx.playNitroGrunt).not.toHaveBeenCalled();

    // Tick partway through -> still active, no grunt yet
    pm.tick(expectedDuration * 0.5, ctx, false);
    expect(pm.activeSlots[0]?.isActive).toBe(true);
    expect(ctx.playNitroGrunt).not.toHaveBeenCalled();

    // Tick past expiration -> ends nitro and plays grunt sound
    pm.tick(expectedDuration * 0.6, ctx, false);
    expect(pm.activeSlots[0]?.isActive).toBe(false);
    expect(ctx.setNitroActive).toHaveBeenLastCalledWith(false);
    expect(ctx.playNitroGrunt).toHaveBeenCalledTimes(1);
  });
});
