import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEmptyInputState } from '../src/input/Actions';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { StatSystem } from '../src/powers/StatSystem';
import { ArcadeVehicle } from '../src/vehicle/ArcadeVehicle';
import { VehicleStats } from '../src/vehicle/VehicleStats';
import { HeightMap } from '../src/world/HeightMap';

interface SimMetrics {
  maxRollDeg: number;
  endRollDeg: number;
  maxVisualRollRad: number;
  minGroundedWheels: number;
  twoWheelFrames: number;
  maxCompressionDiff: number;
  maxSlipDeg: number;
  endSlipDeg: number;
  avgTurnRadius: number;
  endSpeedKmh: number;
  driftingFrames: number;
  exitBoostTriggered: boolean;
  twoWheelAwarded: boolean;
}

function createSettledVehicle(options?: {
  bulldozer?: boolean;
  rain?: boolean;
  turboStacks?: number;
}): { physics: PhysicsWorld; vehicle: ArcadeVehicle } {
  const heightMap = new HeightMap(600, 12, () => 0);
  const physics = new PhysicsWorld();
  const stats = new StatSystem();
  if (options?.bulldozer) {
    stats.setSource('bulldozer_bumper', [{ stat: 'car.mass', mul: 0.6 }], 1);
  }
  if (options?.turboStacks) {
    stats.setSource(
      'turbocharger',
      [
        { stat: 'car.topSpeed', mul: 0.08 },
        { stat: 'car.accel', mul: 0.08 },
      ],
      options.turboStacks
    );
  }
  const vehicleStats = new VehicleStats(stats);
  if (options?.rain) {
    vehicleStats.rainGripMult = 0.85;
  }

  const vehicle = new ArcadeVehicle(physics, vehicleStats, heightMap, new THREE.Vector3(0, 1.0, 0), 0);
  const dt = 1 / 60;
  const idle = createEmptyInputState();
  for (let i = 0; i < 48; i++) {
    vehicle.step(dt, idle, { allowControl: false, boostActive: false });
    physics.step(dt);
    vehicle.syncFromBody();
  }
  return { physics, vehicle };
}

function simulateManeuver(
  initialSpeedKmh: number,
  durationSec: number,
  controlFn: (t: number) => { throttle: number; steer: number; handbrake: boolean; boost?: boolean },
  mods?: { bulldozer?: boolean; rain?: boolean; turboStacks?: number }
): SimMetrics {
  const { physics, vehicle } = createSettledVehicle(mods);
  const dt = 1 / 60;
  const inp = createEmptyInputState();
  vehicle.body.setLinvel({ x: 0, y: 0, z: -(initialSpeedKmh / 3.6) }, true);
  vehicle.syncFromBody();

  let maxRollDeg = 0;
  let endRollDeg = 0;
  let maxVisualRollRad = 0;
  let minGroundedWheels = 4;
  let twoWheelFrames = 0;
  let maxCompressionDiff = 0;
  let maxSlipDeg = 0;
  let endSlipDeg = 0;
  let totalYawTurned = 0;
  let pathLen = 0;
  let driftingFrames = 0;
  let exitBoostTriggered = false;
  let twoWheelAwarded = false;

  let prevYaw = vehicle.getYaw();
  let prevX = vehicle.currPosition.x;
  let prevZ = vehicle.currPosition.z;
  let steerVal = 0;

  const steps = Math.round(durationSec / dt);
  for (let i = 0; i < steps; i++) {
    const t = i * dt;
    const ctrl = controlFn(t);
    const reversing =
      Math.sign(ctrl.steer) !== Math.sign(steerVal) && steerVal !== 0 && ctrl.steer !== 0;
    const rate = (ctrl.steer === 0 ? 10 : reversing ? 14 : 6) * dt;
    if (Math.abs(ctrl.steer - steerVal) <= rate) {
      steerVal = ctrl.steer;
    } else {
      steerVal += Math.sign(ctrl.steer - steerVal) * rate;
    }

    inp.throttle = ctrl.throttle;
    inp.steer = steerVal;
    inp.handbrake = ctrl.handbrake;

    const { driftOut } = vehicle.step(dt, inp, {
      allowControl: true,
      boostActive: Boolean(ctrl.boost),
    });
    physics.step(dt);
    vehicle.syncFromBody();

    const rollDeg = Math.abs(
      THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, vehicle.rightDir.y))))
    );
    maxRollDeg = Math.max(maxRollDeg, rollDeg);
    endRollDeg = rollDeg;
    maxVisualRollRad = Math.max(maxVisualRollRad, Math.abs(vehicle.visualRoll));

    const grounded = vehicle.wheels.filter((w) => w.grounded).length;
    minGroundedWheels = Math.min(minGroundedWheels, grounded);
    if (grounded <= 2) twoWheelFrames++;
    if (driftOut.twoWheelAwarded) twoWheelAwarded = true;

    const compLeft = (vehicle.wheels[0].compression + vehicle.wheels[2].compression) * 0.5;
    const compRight = (vehicle.wheels[1].compression + vehicle.wheels[3].compression) * 0.5;
    maxCompressionDiff = Math.max(maxCompressionDiff, Math.abs(compLeft - compRight));

    maxSlipDeg = Math.max(maxSlipDeg, driftOut.slipDeg);
    endSlipDeg = driftOut.slipDeg;
    if (driftOut.isDrifting) driftingFrames++;
    if (vehicle.driftExitBoostTimer > 0) exitBoostTriggered = true;

    const yaw = vehicle.getYaw();
    let dyaw = yaw - prevYaw;
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    totalYawTurned += Math.abs(dyaw);
    prevYaw = yaw;

    pathLen += Math.hypot(vehicle.currPosition.x - prevX, vehicle.currPosition.z - prevZ);
    prevX = vehicle.currPosition.x;
    prevZ = vehicle.currPosition.z;
  }

  const endSpeedKmh = vehicle.speed * 3.6;
  physics.dispose();

  return {
    maxRollDeg,
    endRollDeg,
    maxVisualRollRad,
    minGroundedWheels,
    twoWheelFrames,
    maxCompressionDiff,
    maxSlipDeg,
    endSlipDeg,
    avgTurnRadius: totalYawTurned > 0.2 ? pathLen / totalYawTurned : Infinity,
    endSpeedKmh,
    driftingFrames,
    exitBoostTriggered,
    twoWheelAwarded,
  };
}

describe('ArcadeVehicle Drift Mode & Suspension Handling', () => {
  beforeAll(async () => {
    await PhysicsWorld.initRapier();
  });

  it('visibly uses suspension during normal turns without ever entering 2-wheel riding', () => {
    for (const speedKmh of [40, 80, 120, 160]) {
      const m = simulateManeuver(speedKmh, 2.5, () => ({
        throttle: 1,
        steer: 1,
        handbrake: false,
      }));

      // Suspension visibly compresses outer side vs inner side & leans the body
      expect(m.maxRollDeg).toBeGreaterThan(2.5);
      expect(m.maxRollDeg).toBeLessThan(8.0);
      expect(m.maxCompressionDiff).toBeGreaterThan(0.08);

      // Never rides on 2 wheels
      expect(m.twoWheelFrames).toBe(0);
      expect(m.twoWheelAwarded).toBe(false);
      expect(m.minGroundedWheels).toBeGreaterThanOrEqual(3);
    }
  });

  it('stays planted on all 4 wheels during high-speed slaloms (including Turbo + Nitro & Bulldozer)', () => {
    const slalom160 = simulateManeuver(160, 3.0, (t) => ({
      throttle: 1,
      steer: Math.floor(t / 0.65) % 2 === 0 ? 1 : -1,
      handbrake: false,
    }));
    expect(slalom160.twoWheelFrames).toBe(0);
    expect(slalom160.minGroundedWheels).toBe(4);
    expect(slalom160.maxRollDeg).toBeGreaterThan(3.0);
    expect(slalom160.maxRollDeg).toBeLessThan(8.0);

    const slalomNitro = simulateManeuver(
      200,
      3.0,
      (t) => ({
        throttle: 1,
        steer: Math.floor(t / 0.65) % 2 === 0 ? 1 : -1,
        handbrake: false,
        boost: true,
      }),
      { turboStacks: 3 }
    );
    expect(slalomNitro.twoWheelFrames).toBe(0);
    expect(slalomNitro.minGroundedWheels).toBe(4);
    expect(slalomNitro.maxRollDeg).toBeLessThan(8.0);

    const bulldozerTurn = simulateManeuver(
      120,
      2.5,
      () => ({
        throttle: 1,
        steer: 1,
        handbrake: false,
      }),
      { bulldozer: true }
    );
    expect(bulldozerTurn.twoWheelFrames).toBe(0);
    expect(bulldozerTurn.minGroundedWheels).toBe(4);
  });

  it('drifts flat with zero tipping and dramatically tighter turn radius when pressing Space', () => {
    for (const speedKmh of [40, 80, 120, 160]) {
      const normal = simulateManeuver(speedKmh, 2.5, () => ({
        throttle: 1,
        steer: 1,
        handbrake: false,
      }));
      const drift = simulateManeuver(speedKmh, 2.5, () => ({
        throttle: 1,
        steer: 1,
        handbrake: true,
      }));

      // Drift Mode does NOT tip at all
      expect(drift.maxRollDeg).toBeLessThan(1.5);
      expect(drift.maxVisualRollRad).toBeLessThan(0.02);
      expect(drift.minGroundedWheels).toBe(4);
      expect(drift.twoWheelFrames).toBe(0);

      // Drift Mode carves corners with significantly decreased turn radius (at least 35% tighter!)
      expect(drift.avgTurnRadius).toBeLessThan(normal.avgTurnRadius * 0.65);

      // True drift-car slip angle (20..42 deg) without spinning out, carrying strong speed
      expect(drift.maxSlipDeg).toBeGreaterThan(20);
      expect(drift.maxSlipDeg).toBeLessThan(42);
      expect(drift.driftingFrames).toBeGreaterThan(80);
      expect(drift.endSpeedKmh).toBeGreaterThan(Math.min(speedKmh * 0.75, 85));
    }
  });

  it('glides smoothly without handbrake-braking to a halt when coasting in Drift Mode', () => {
    const coastDrift = simulateManeuver(100, 2.0, () => ({
      throttle: 0,
      steer: 1,
      handbrake: true,
    }));
    expect(coastDrift.endSpeedKmh).toBeGreaterThan(45);
    expect(coastDrift.maxRollDeg).toBeLessThan(1.5);
    expect(coastDrift.minGroundedWheels).toBe(4);
    expect(coastDrift.maxSlipDeg).toBeGreaterThan(20);
  });

  it('flattens cleanly from a leaning normal turn into Drift Mode, transitions S-curves, and exits cleanly with boost', () => {
    // 1. Enter Drift Mode mid-turn from a leaning normal turn -> flattens to ~0 deg roll
    const leanToDrift = simulateManeuver(100, 2.5, (t) => ({
      throttle: 1,
      steer: 1,
      handbrake: t >= 1.0,
    }));
    expect(leanToDrift.maxRollDeg).toBeGreaterThan(3.0);
    expect(leanToDrift.endRollDeg).toBeLessThan(0.8);
    expect(leanToDrift.minGroundedWheels).toBe(4);

    // 2. S-curve drift transition (right -> left) stays flat and controlled
    const sCurve = simulateManeuver(100, 3.0, (t) => ({
      throttle: 1,
      steer: t < 1.4 ? 1 : -1,
      handbrake: true,
    }));
    expect(sCurve.maxRollDeg).toBeLessThan(1.5);
    expect(sCurve.minGroundedWheels).toBe(4);
    expect(sCurve.maxSlipDeg).toBeGreaterThan(22);
    expect(sCurve.maxSlipDeg).toBeLessThan(42);

    // 3. Releasing Space straightens cleanly (no spin-out/fishtail) and awards exit traction boost
    const driftExit = simulateManeuver(100, 2.8, (t) => ({
      throttle: 1,
      steer: t < 1.3 ? 1 : 0,
      handbrake: t < 1.3,
    }));
    expect(driftExit.endSlipDeg).toBeLessThan(2.5);
    expect(driftExit.exitBoostTriggered).toBe(true);
    expect(driftExit.minGroundedWheels).toBe(4);
  });
});
