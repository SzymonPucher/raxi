import * as THREE from 'three';
import { BALANCE } from '../core/config/balance';
import { InputState } from '../input/Actions';
import {
  CG,
  PLAYER_GHOST_FILTER,
  PLAYER_NORMAL_FILTER,
  WORLD_WHEEL_RAY_FILTER,
  makeCollisionGroups,
} from '../physics/collisionGroups';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { HeightMap } from '../world/HeightMap';
import { DriftDetector, DriftEventsOut } from './DriftDetector';
import { VehicleStats } from './VehicleStats';

export interface WheelRuntime {
  name: 'FL' | 'FR' | 'RL' | 'RR';
  isFront: boolean;
  isLeft: boolean;
  localMount: THREE.Vector3;
  grounded: boolean;
  compression: number;
  prevCompression: number;
  contactPoint: THREE.Vector3;
  contactNormal: THREE.Vector3;
  steerAngle: number;
  spinAngle: number;
  slipAmount: number;
}

export type BlinkerSide = 'off' | 'left' | 'right';

export const TURN_AROUND_MAX_SPEED_KMH = 10;

/** Returns true when speed (m/s) is strictly below 10 km/h so instant 180° turnaround is allowed. */
export function canTurnAround180(speedMs: number): boolean {
  return Math.abs(speedMs) * 3.6 < TURN_AROUND_MAX_SPEED_KMH;
}

/** Computes yaw rotated by 180° (π radians) around world Y, normalized to [-π, π]. */
export function computeTurnAround180Yaw(yaw: number): number {
  const next = yaw + Math.PI;
  return Math.atan2(Math.sin(next), Math.cos(next));
}

/** Builds an upright quaternion rotated 180° around world Y from the given yaw. */
export function computeTurnAround180Quat(yaw: number): { x: number; y: number; z: number; w: number } {
  const nextYaw = computeTurnAround180Yaw(yaw);
  return {
    x: 0,
    y: Math.sin(nextYaw * 0.5),
    z: 0,
    w: Math.cos(nextYaw * 0.5),
  };
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _rMount = new THREE.Vector3();
const _omega = new THREE.Vector3();
const _mountVel = new THREE.Vector3();
const _wheelFwd = new THREE.Vector3();
const _wheelRight = new THREE.Vector3();
const _rVec = new THREE.Vector3();
const _ptVel = new THREE.Vector3();
const _latImpulse = new THREE.Vector3();
const _gripPoint = new THREE.Vector3();
const _imp = new THREE.Vector3();
const _rollVec = new THREE.Vector3();
const _torque = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(0, 0, -1);
const _right = new THREE.Vector3(1, 0, 0);

/**
 * Custom raycast-wheel arcade vehicle controller (§5).
 * Local coordinate convention: +Z = back, -Z = forward, +X = right, +Y = up.
 */
export class ArcadeVehicle {
  public readonly body: RAPIER.RigidBody;
  public readonly collider: RAPIER.Collider;
  public readonly wheels: WheelRuntime[];
  public readonly drift = new DriftDetector();

  public readonly prevPosition = new THREE.Vector3();
  public readonly currPosition = new THREE.Vector3();
  public readonly prevQuaternion = new THREE.Quaternion();
  public readonly currQuaternion = new THREE.Quaternion();
  public readonly velocity = new THREE.Vector3();
  public readonly forwardDir = new THREE.Vector3(0, 0, -1);
  public readonly rightDir = new THREE.Vector3(1, 0, 0);
  public readonly upDir = new THREE.Vector3(0, 1, 0);

  public speed = 0; // m/s scalar
  public forwardSpeed = 0; // signed (+ forward, - reverse)
  public lateralSpeed = 0;
  public steerAngle = 0;
  public isReversing = false;
  public reverseDuration = 0;
  public isBraking = false;
  public isBoosting = false;
  public isGhost = false;
  public hasRollCage = false;
  public hasBulldozer = false;

  // Blinker state (§9.5)
  public blinker: BlinkerSide = 'off';
  public blinkerOnTime = 0;

  // Flip / reset tracking
  public upsideDownTimer = 0;
  public resetHoldTimer = 0;
  public distanceDriven = 0;

  // Visual helpers
  public visualRoll = 0;
  public visualPitch = 0;
  private prevForwardSpeed = 0;
  private currentMass = 1200;
  private readonly preStepVel = new THREE.Vector3();
  private hopGraceTimer = 0;

  constructor(
    private readonly physics: PhysicsWorld,
    public readonly vehicleStats: VehicleStats,
    private readonly heightMap: HeightMap,
    spawnPos = new THREE.Vector3(0, 1.5, 0),
    spawnYaw = 0
  ) {
    const cfg = vehicleStats.config;
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
      .setRotation({ x: 0, y: Math.sin(spawnYaw * 0.5), z: 0, w: Math.cos(spawnYaw * 0.5) })
      .setLinearDamping(cfg.linearDamping)
      .setAngularDamping(cfg.angularDamping)
      .setCcdEnabled(true);

    this.body = physics.world.createRigidBody(bodyDesc);

    // Offset collider up slightly relative to rigid body center of mass -> lowers COM by ~0.4m
    const colDesc = RAPIER.ColliderDesc.cuboid(
      cfg.chassisWidth * 0.5,
      cfg.chassisHeight * 0.5,
      cfg.chassisLength * 0.5
    )
      .setTranslation(0, -cfg.comOffsetY * 0.65, 0)
      .setMass(cfg.mass)
      .setFriction(0.15)
      .setRestitution(0.0)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setCollisionGroups(makeCollisionGroups(CG.PLAYER, PLAYER_NORMAL_FILTER));

    this.collider = physics.world.createCollider(colDesc, this.body);
    this.physics.registerTag(this.collider, { kind: 'player' });
    this.currentMass = cfg.mass;

    const zf = -cfg.wheelBaseHalfZ;
    const zr = cfg.wheelBaseHalfZ;
    const xl = -cfg.trackHalfX;
    const xr = cfg.trackHalfX;
    const ym = cfg.wheelMountY;

    this.wheels = [
      this.makeWheel('FL', true, true, xl, ym, zf),
      this.makeWheel('FR', true, false, xr, ym, zf),
      this.makeWheel('RL', false, true, xl, ym, zr),
      this.makeWheel('RR', false, false, xr, ym, zr),
    ];

    this.syncFromBody();
    this.prevPosition.copy(this.currPosition);
    this.prevQuaternion.copy(this.currQuaternion);
  }

  private makeWheel(
    name: WheelRuntime['name'],
    isFront: boolean,
    isLeft: boolean,
    x: number,
    y: number,
    z: number
  ): WheelRuntime {
    return {
      name,
      isFront,
      isLeft,
      localMount: new THREE.Vector3(x, y, z),
      grounded: false,
      compression: 0,
      prevCompression: 0,
      contactPoint: new THREE.Vector3(),
      contactNormal: new THREE.Vector3(0, 1, 0),
      steerAngle: 0,
      spinAngle: 0,
      slipAmount: 0,
    };
  }

  setGhost(ghost: boolean): void {
    if (this.isGhost === ghost) return;
    this.isGhost = ghost;
    const filter = ghost ? PLAYER_GHOST_FILTER : PLAYER_NORMAL_FILTER;
    this.collider.setCollisionGroups(makeCollisionGroups(CG.PLAYER, filter));
  }

  setPositionAndYaw(x: number, y: number, z: number, yaw = 0): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation(
      { x: 0, y: Math.sin(yaw * 0.5), z: 0, w: Math.cos(yaw * 0.5) },
      true
    );
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.upsideDownTimer = 0;
    this.resetHoldTimer = 0;
    this.syncFromBody();
    this.prevPosition.copy(this.currPosition);
    this.prevQuaternion.copy(this.currQuaternion);
  }

  resetUpright(): void {
    const pos = this.body.translation();
    const yaw = this.getYaw();
    this.setPositionAndYaw(pos.x, pos.y + 1.4, pos.z, yaw);
  }

  /**
   * Instantly turns the vehicle 180° around the world Y axis when moving slower than 10 km/h.
   * Returns true if the turnaround was executed, false if moving too fast.
   */
  turnAround180(): boolean {
    if (!canTurnAround180(this.speed)) {
      return false;
    }
    const rot = computeTurnAround180Quat(this.getYaw());
    const vel = this.body.linvel();
    this.body.setRotation(rot, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setLinvel({ x: 0, y: vel.y, z: 0 }, true);
    this.syncFromBody();
    this.prevQuaternion.copy(this.currQuaternion);
    this.forwardSpeed = this.velocity.dot(this.forwardDir);
    this.lateralSpeed = this.velocity.dot(this.rightDir);
    this.speed = this.velocity.length();
    return true;
  }

  /** Hydraulics hop (§10.3 #13: jump ~4m up). */
  hop(heightMeters = 4.0): void {
    const g = 9.81 * this.vehicleStats.config.airGravityMult;
    const vy = Math.sqrt(2 * g * heightMeters);
    const vel = this.body.linvel();
    this.hopGraceTimer = 0.25;
    this.body.setLinvel({ x: vel.x, y: Math.max(vel.y, vy), z: vel.z }, true);
  }

  /** Capture velocity right before Rapier steps so collision catapult spikes can be clamped. */
  capturePreStepVelocity(): void {
    const v = this.body.linvel();
    this.preStepVel.set(v.x, v.y, v.z);
  }

  /**
   * Prevents Rapier depenetration or high-speed glancing impacts from catapulting the taxi
   * sky-high or flinging it far across the map.
   */
  clampPostStepVelocity(): void {
    const v = this.body.linvel();
    const eff = this.vehicleStats.getEffective(this.isBoosting);

    const preHoriz = Math.hypot(this.preStepVel.x, this.preStepVel.z);
    let vx = v.x;
    let vy = v.y;
    let vz = v.z;
    let changed = false;

    // 1. Cap abnormal single-step horizontal velocity jump (depenetration catapult)
    const dvx = vx - this.preStepVel.x;
    const dvz = vz - this.preStepVel.z;
    const dvHoriz = Math.hypot(dvx, dvz);
    const maxSingleStepDelta = 20.0;
    if (dvHoriz > maxSingleStepDelta) {
      const s = maxSingleStepDelta / dvHoriz;
      vx = this.preStepVel.x + dvx * s;
      vz = this.preStepVel.z + dvz * s;
      changed = true;
    }

    // 2. A collision must never fling the car faster than its pre-impact speed (or topSpeed)
    const postHoriz = Math.hypot(vx, vz);
    const maxAllowedHoriz = Math.min(eff.topSpeed * 1.25, Math.max(preHoriz + 2.5, 16.0));
    if (postHoriz > maxAllowedHoriz && postHoriz > 0.001) {
      const s = maxAllowedHoriz / postHoriz;
      vx *= s;
      vz *= s;
      changed = true;
    }

    // 3. Cap sudden upward vertical launch from collisions (while still permitting ramp jumps & Hydraulics)
    if (this.hopGraceTimer <= 0) {
      const maxUpVel = Math.min(14.5, Math.max(this.preStepVel.y + 3.0, 4.2));
      if (vy > maxUpVel) {
        vy = maxUpVel;
        changed = true;
      }
    } else if (vy > 16.5) {
      vy = 16.5;
      changed = true;
    }

    if (changed) {
      this.body.setLinvel({ x: vx, y: vy, z: vz }, true);
    }

    // 4. Clamp post-collision spin immediately
    const ang = this.body.angvel();
    const maxAng = this.vehicleStats.config.maxCollisionAngVel;
    const angMag = Math.hypot(ang.x, ang.y, ang.z);
    if (angMag > maxAng) {
      const s = maxAng / angMag;
      this.body.setAngvel({ x: ang.x * s, y: ang.y * s, z: ang.z * s }, true);
    }
  }

  /** Explosion knockback (§7.2: upward kick ~2 m/s, -15% forward speed, never flips). */
  applyExplosionKnockback(): void {
    const vel = this.body.linvel();
    this.body.setLinvel(
      {
        x: vel.x * BALANCE.pedExplosionSpeedKeep,
        y: Math.max(vel.y, BALANCE.pedExplosionKnockbackUp),
        z: vel.z * BALANCE.pedExplosionSpeedKeep,
      },
      true
    );
  }

  getYaw(): number {
    this.syncBasis();
    return Math.atan2(-this.forwardDir.x, -this.forwardDir.z);
  }

  toggleBlinker(side: 'left' | 'right'): BlinkerSide {
    if (this.blinker === side) {
      this.blinker = 'off';
      this.blinkerOnTime = 0;
    } else {
      this.blinker = side;
      this.blinkerOnTime = 0;
    }
    return this.blinker;
  }

  cancelBlinker(): void {
    this.blinker = 'off';
    this.blinkerOnTime = 0;
  }

  syncFromBody(): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    const v = this.body.linvel();
    this.currPosition.set(t.x, t.y, t.z);
    this.currQuaternion.set(r.x, r.y, r.z, r.w);
    this.velocity.set(v.x, v.y, v.z);
    this.syncBasis();
  }

  private syncBasis(): void {
    this.forwardDir.copy(_fwd).applyQuaternion(this.currQuaternion).normalize();
    this.rightDir.copy(_right).applyQuaternion(this.currQuaternion).normalize();
    this.upDir.copy(_up).applyQuaternion(this.currQuaternion).normalize();
  }

  /**
   * Run one fixed physics step before `physics.step()`.
   * Returns drift/airtime info + whether auto/manual reset occurred.
   */
  step(
    dt: number,
    input: InputState,
    options: { allowControl: boolean; boostActive: boolean }
  ): { driftOut: DriftEventsOut; autoReset: boolean; manualReset: boolean } {
    this.prevPosition.copy(this.currPosition);
    this.prevQuaternion.copy(this.currQuaternion);
    this.syncFromBody();

    const cfg = this.vehicleStats.config;
    const eff = this.vehicleStats.getEffective(options.boostActive);
    this.isBoosting = options.boostActive;

    // Update dynamic mass if changed by powers (e.g. Bulldozer Bumper)
    if (Math.abs(eff.mass - this.currentMass) > 1) {
      this.collider.setMass(eff.mass);
      this.currentMass = eff.mass;
    }

    // Clamp excessive angular velocity from collisions (§5.1)
    const ang = this.body.angvel();
    const angMag = Math.hypot(ang.x, ang.y, ang.z);
    if (angMag > cfg.maxCollisionAngVel) {
      const s = cfg.maxCollisionAngVel / angMag;
      this.body.setAngvel({ x: ang.x * s, y: ang.y * s, z: ang.z * s }, true);
    }

    // Blinker auto-cancel timer
    if (this.hopGraceTimer > 0) this.hopGraceTimer = Math.max(0, this.hopGraceTimer - dt);
    if (this.blinker !== 'off') {
      this.blinkerOnTime += dt;
      if (this.blinkerOnTime >= BALANCE.ruleBlinkerAutoCancelTime) {
        this.cancelBlinker();
      }
    }

    const throttle = options.allowControl ? input.throttle : 0;
    const brake = options.allowControl ? input.brake : 0;
    const steerInput = options.allowControl ? input.steer : 0;
    const handbrake = options.allowControl ? input.handbrake : false;

    this.forwardSpeed = this.velocity.dot(this.forwardDir);
    this.lateralSpeed = this.velocity.dot(this.rightDir);
    this.speed = this.velocity.length();
    this.distanceDriven += this.speed * dt;

    // Reverse logic (§5.1: below ~1 m/s with brake held -> reverse)
    if (brake > 0.1 && this.forwardSpeed <= 1.2) {
      this.isReversing = true;
      this.isBraking = false;
    } else if (throttle > 0.1 || this.forwardSpeed > 2.0) {
      this.isReversing = false;
      this.isBraking = brake > 0.1 && this.forwardSpeed > 0.5;
    } else {
      this.isBraking = brake > 0.1 || handbrake;
    }

    if (this.isReversing && this.forwardSpeed < -0.5) {
      this.reverseDuration += dt;
    } else {
      this.reverseDuration = 0;
    }

    // Speed-dependent steering (§5.1: 35° at 0 -> 8° at top speed)
    const speedFrac = Math.min(1, this.speed / Math.max(15, eff.topSpeed));
    const maxSteerDeg =
      THREE.MathUtils.lerp(cfg.maxSteerDegLow, cfg.maxSteerDegHigh, Math.pow(speedFrac, 0.72)) *
      eff.steerMult;
    const targetSteerRad = THREE.MathUtils.degToRad(-steerInput * maxSteerDeg);
    const steerStep = cfg.steerSpeed * dt;
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteerRad, Math.min(1, steerStep));

    // Per-wheel contact (analytic HeightMap ground + Rapier raycast for ramps/structures)
    const rayLen = cfg.suspensionRestLength + cfg.wheelRadius;
    const downDir = _v1.copy(this.upDir).negate();
    let groundedCount = 0;
    let leftGrounded = 0;
    let rightGrounded = 0;

    // Keep track of suspension compression per side for anti-roll
    const comps = [0, 0, 0, 0];

    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      w.prevCompression = w.compression;
      w.steerAngle = w.isFront ? this.steerAngle : 0;

      // World mount point
      const mountWorld = _v2
        .copy(w.localMount)
        .applyQuaternion(this.currQuaternion)
        .add(this.currPosition);

      // 1. Exact analytic HeightMap ground contact (100% seam-free, zero trimesh edge glitches!)
      let hitToi = Infinity;
      let hitNormalX = 0;
      let hitNormalY = 1;
      let hitNormalZ = 0;

      if (downDir.y < -0.25) {
        const groundY = this.heightMap.sample(mountWorld.x, mountWorld.z);
        const toiGround = (mountWorld.y - groundY) / -downDir.y;
        if (toiGround >= 0 && toiGround <= rayLen) {
          hitToi = toiGround;
          const n = this.heightMap.sampleNormal(mountWorld.x, mountWorld.z);
          hitNormalX = n.x;
          hitNormalY = n.y;
          hitNormalZ = n.z;
        }
      }

      // 2. Also raycast against elevated structures / jump ramps (CG.STATIC_WORLD)
      const rampHit = this.physics.castRay(
        { x: mountWorld.x, y: mountWorld.y, z: mountWorld.z },
        { x: downDir.x, y: downDir.y, z: downDir.z },
        Math.min(rayLen, hitToi),
        WORLD_WHEEL_RAY_FILTER,
        this.body
      );
      if (rampHit && rampHit.toi < hitToi && rampHit.normal.y > 0.35) {
        hitToi = rampHit.toi;
        hitNormalX = rampHit.normal.x;
        hitNormalY = rampHit.normal.y;
        hitNormalZ = rampHit.normal.z;
      }

      if (hitToi <= rayLen) {
        w.grounded = true;
        groundedCount++;
        if (w.isLeft) leftGrounded++;
        else rightGrounded++;

        const dist = Math.max(0.05, hitToi - cfg.wheelRadius);
        const compression = Math.max(0, Math.min(cfg.suspensionRestLength, cfg.suspensionRestLength - dist));
        w.compression = compression;
        comps[i] = compression;

        w.contactPoint.copy(mountWorld).addScaledVector(downDir, hitToi);
        w.contactNormal.set(hitNormalX, hitNormalY, hitNormalZ);

        // Velocity at mount point = v + omega x r (smooth velocity-based damper, zero finite-diff chatter!)
        _rMount.subVectors(mountWorld, this.currPosition);
        _omega.set(ang.x, ang.y, ang.z);
        _mountVel.copy(_omega).cross(_rMount).add(this.velocity);

        // 1. Suspension spring + velocity damper force
        const compVel = -_mountVel.dot(this.upDir);
        const springF = Math.max(
          0,
          Math.min(
            cfg.maxSuspensionForce,
            cfg.suspensionStiffness * compression + cfg.suspensionDamping * compVel
          )
        );
        const fUp = _v3.copy(this.upDir).multiplyScalar(springF * dt);
        this.body.applyImpulseAtPoint(
          { x: fUp.x, y: fUp.y, z: fUp.z },
          { x: mountWorld.x, y: mountWorld.y, z: mountWorld.z },
          true
        );

        // Compute wheel world basis (steered for front wheels)
        _wheelFwd.copy(this.forwardDir);
        _wheelRight.copy(this.rightDir);
        if (w.isFront && Math.abs(w.steerAngle) > 0.0001) {
          _wheelFwd.applyAxisAngle(this.upDir, w.steerAngle);
          _wheelRight.applyAxisAngle(this.upDir, w.steerAngle);
        }

        // Velocity at contact point = v + omega x r
        _rVec.subVectors(w.contactPoint, this.currPosition);
        _omega.set(ang.x, ang.y, ang.z);
        _ptVel.copy(_omega).cross(_rVec).add(this.velocity);

        const wheelFwdVel = _ptVel.dot(_wheelFwd);
        const wheelLatVel = _ptVel.dot(_wheelRight);

        // 2. Lateral grip impulse (§5.1)
        let wheelGrip = eff.grip;
        if (!w.isFront && handbrake) {
          wheelGrip = eff.handbrakeGrip;
        } else if (!w.isFront && this.drift.isDrifting && throttle > 0.3) {
          // Keep smooth controllable drift under throttle
          wheelGrip = Math.min(wheelGrip, 0.55);
        }

        // Scale grip into crisp per-step lateral impulse (normalized per wheel mass share)
        const wheelMassShare = eff.mass * 0.25;
        const cancelFraction = Math.min(0.95, wheelGrip * (handbrake && !w.isFront ? 0.35 : 0.42));
        const latImpulseMag = -wheelLatVel * wheelMassShare * cancelFraction;
        _latImpulse.copy(_wheelRight).multiplyScalar(latImpulseMag);
        // Apply at COM vertical height (zero local Y offset) so sharp cornering never tips the car
        _gripPoint
          .set(w.localMount.x, 0, w.localMount.z)
          .applyQuaternion(this.currQuaternion)
          .add(this.currPosition);
        this.body.applyImpulseAtPoint(
          { x: _latImpulse.x, y: _latImpulse.y, z: _latImpulse.z },
          { x: _gripPoint.x, y: _gripPoint.y, z: _gripPoint.z },
          true
        );

        w.slipAmount = Math.min(1, Math.abs(wheelLatVel) / 10 + (handbrake && !w.isFront && this.speed > 4 ? 0.6 : 0));

        // 3. Longitudinal forces (drive / brake / reverse / coast drag)
        const isDriven = cfg.driveType === 'AWD' || !w.isFront;
        const drivenShare = cfg.driveType === 'AWD' ? 0.25 : 0.5;
        let longForce = 0;

        if (this.isReversing && brake > 0.05) {
          if (this.forwardSpeed > -eff.reverseTopSpeed) {
            const revFade = Math.max(0, 1 - Math.abs(this.forwardSpeed) / eff.reverseTopSpeed);
            longForce -= eff.engineForce * 0.62 * brake * drivenShare * (0.35 + 0.65 * revFade);
          }
        } else {
          if (isDriven && throttle > 0.01) {
            const speedRatio = Math.max(0, this.forwardSpeed / eff.topSpeed);
            if (speedRatio < 1.0) {
              // Strong arcade punch off the line, smooth fade near top speed (~3.5s 0-100 km/h)
              const curve = Math.pow(Math.max(0, 1 - speedRatio * 0.92), 0.65);
              const driftExtra = this.drift.isDrifting ? cfg.driftThrottleBoost : 1.0;
              longForce += eff.engineForce * throttle * drivenShare * curve * driftExtra;
            }
          }
          if (brake > 0.05 && this.forwardSpeed > 0.2) {
            longForce -= eff.brakeForce * brake * 0.25;
          }
        }

        if (handbrake && !w.isFront && Math.abs(wheelFwdVel) > 0.5) {
          longForce -= Math.sign(wheelFwdVel) * eff.brakeForce * 0.16;
        }

        // Rolling resistance / gentle speed cap
        if (throttle < 0.05 && brake < 0.05) {
          longForce -= wheelFwdVel * eff.mass * cfg.coastDrag * 0.25;
        }
        if (this.forwardSpeed > eff.topSpeed) {
          longForce -= (this.forwardSpeed - eff.topSpeed) * eff.mass * 0.8 * 0.25;
        }

        if (Math.abs(longForce) > 0.01) {
          _imp.copy(_wheelFwd).multiplyScalar(longForce * dt);
          this.body.applyImpulseAtPoint(
            { x: _imp.x, y: _imp.y, z: _imp.z },
            { x: _gripPoint.x, y: _gripPoint.y, z: _gripPoint.z },
            true
          );
        }

        w.spinAngle += (wheelFwdVel / cfg.wheelRadius) * dt;
      } else {
        w.grounded = false;
        w.compression = 0;
        w.slipAmount = 0;
        w.spinAngle += (this.forwardSpeed / cfg.wheelRadius) * dt * 0.5;
      }
    }

    // Anti-roll bars + roll angular velocity damping (front FL-FR, rear RL-RR)
    // Positive torque around forwardDir (-Z) lifts left (-X) and presses right (+X)
    if (groundedCount >= 1) {
      const frontRollDiff = comps[0] - comps[1];
      const rearRollDiff = comps[2] - comps[3];
      const rollRate = ang.x * this.forwardDir.x + ang.y * this.forwardDir.y + ang.z * this.forwardDir.z;
      const antiRollTorque =
        (frontRollDiff + rearRollDiff) * cfg.antiRollStrength * dt -
        rollRate * eff.mass * 1.65 * dt;
      _rollVec.copy(this.forwardDir).multiplyScalar(antiRollTorque);
      this.body.applyTorqueImpulse({ x: _rollVec.x, y: _rollVec.y, z: _rollVec.z }, true);
    }

    // Downforce proportional to v^2 (§5.1)
    if (groundedCount > 0) {
      const downforce = cfg.downforceCoeff * this.speed * this.speed;
      this.body.applyImpulse({ x: 0, y: -downforce * dt, z: 0 }, true);
    } else {
      // Airborne: extra gravity (x1.6) + air pitch/yaw control (§5.1)
      const extraGravity = (cfg.airGravityMult - 1) * 9.81 * eff.mass;
      this.body.applyImpulse({ x: 0, y: -extraGravity * dt, z: 0 }, true);

      if (options.allowControl) {
        const yawT = -steerInput * cfg.airYawTorque * dt;
        const pitchT = (throttle - brake) * cfg.airPitchTorque * dt;
        _torque
          .set(0, 0, 0)
          .addScaledVector(this.upDir, yawT)
          .addScaledVector(this.rightDir, -pitchT * 0.6);
        this.body.applyTorqueImpulse({ x: _torque.x, y: _torque.y, z: _torque.z }, true);
      }
    }

    // Drift yaw stabilization + responsive turning assist (§5.1 / §5.3)
    if (groundedCount >= 2 && this.speed > 4) {
      const targetYawRate = -steerInput * (handbrake ? 2.15 : 1.55) * Math.min(1, this.speed / 12);
      const curYawRate = ang.y;
      if (this.drift.isDrifting || handbrake) {
        const yawDelta = targetYawRate - curYawRate;
        this.body.applyTorqueImpulse(
          { x: 0, y: yawDelta * cfg.driftYawAssist * eff.mass * 0.25 * dt, z: 0 },
          true
        );
      } else if (Math.abs(steerInput) > 0.05) {
        // Subtle arcade cornering help so 90-degree turn at 60 km/h feels crisp
        const yawHelp = (targetYawRate * 0.85 - curYawRate) * 1.15 * eff.mass * 0.2 * dt;
        this.body.applyTorqueImpulse({ x: 0, y: yawHelp, z: 0 }, true);
      }
    }

    // Self-righting torque past 50 deg roll (§5.1) and Roll Cage (#19)
    const upDot = this.upDir.y; // cos(tilt)
    const tiltDeg = THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, upDot))));
    if (this.hasRollCage && tiltDeg > 42) {
      // Roll Cage: never flips, instant gentle uprighting
      _axis.crossVectors(this.upDir, _up);
      if (_axis.lengthSq() > 0.0001) {
        _axis.normalize();
        const strength = cfg.selfRightingTorque * 2.5 * dt;
        this.body.applyTorqueImpulse(
          { x: _axis.x * strength, y: _axis.y * strength, z: _axis.z * strength },
          true
        );
      }
    } else if (tiltDeg > cfg.selfRightingAngleDeg) {
      _axis.crossVectors(this.upDir, _up);
      if (_axis.lengthSq() > 0.0001) {
        _axis.normalize();
        const factor = Math.min(1.5, (tiltDeg - cfg.selfRightingAngleDeg) / 40);
        const strength = cfg.selfRightingTorque * factor * dt;
        this.body.applyTorqueImpulse(
          { x: _axis.x * strength, y: _axis.y * strength, z: _axis.z * strength },
          true
        );
      }
    }

    // Upside-down auto-reset (§5.1: > 2s upside down)
    let autoReset = false;
    if (upDot < 0.25 && this.speed < 4) {
      this.upsideDownTimer += dt;
      if (this.hasRollCage || this.upsideDownTimer >= BALANCE.autoFlipTimeout) {
        this.resetUpright();
        autoReset = !this.hasRollCage; // Roll Cage reset is free (no penalty)
      }
    } else {
      this.upsideDownTimer = 0;
    }

    // Manual reset (hold R for 1s)
    let manualReset = false;
    if (options.allowControl && input.resetCar) {
      this.resetHoldTimer += dt;
      if (this.resetHoldTimer >= BALANCE.resetHoldTime) {
        this.resetUpright();
        manualReset = true;
      }
    } else {
      this.resetHoldTimer = 0;
    }

    // Visual body roll & pitch (subtle sporty feedback)
    const accelG = (this.forwardSpeed - this.prevForwardSpeed) / Math.max(0.001, dt);
    this.prevForwardSpeed = this.forwardSpeed;
    const targetPitch = THREE.MathUtils.clamp(-accelG * 0.0045, -0.075, 0.075);
    const targetRoll = THREE.MathUtils.clamp(
      (steerInput * Math.min(1, this.speed / 24) * 0.08) + this.lateralSpeed * 0.004,
      -0.1,
      0.1
    );
    this.visualPitch = THREE.MathUtils.lerp(this.visualPitch, targetPitch, Math.min(1, dt * 8));
    this.visualRoll = THREE.MathUtils.lerp(this.visualRoll, targetRoll, Math.min(1, dt * 8));

    // Drift & airtime tracking
    const driftOut = this.drift.update({
      groundedWheels: groundedCount,
      leftGrounded,
      rightGrounded,
      speed: this.speed,
      forwardSpeed: this.forwardSpeed,
      lateralSpeed: this.lateralSpeed,
      yawRate: ang.y,
      altitude: this.currPosition.y,
      posY: this.currPosition.y,
      dt,
    });

    return { driftOut, autoReset, manualReset };
  }

  getInterpolatedTransform(alpha: number, outPos: THREE.Vector3, outQuat: THREE.Quaternion): void {
    outPos.lerpVectors(this.prevPosition, this.currPosition, alpha);
    outQuat.slerpQuaternions(this.prevQuaternion, this.currQuaternion, alpha);
  }
}
