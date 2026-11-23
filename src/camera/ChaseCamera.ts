import * as THREE from 'three';
import { CAMERA_RAY_FILTER } from '../physics/collisionGroups';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ArcadeVehicle } from '../vehicle/ArcadeVehicle';

/**
 * Spring-damped chase camera (§5.5):
 * - ~6.5m back, ~2.5m up, looks ahead along velocity
 * - Dynamic FOV 65..80 deg (+ boost kick)
 * - Raycast pull-in against buildings
 * - Smooth swing when reversing > 2s, instant look-back key
 * - Shake on impacts/explosions
 */
export class ChaseCamera {
  private readonly currentPos = new THREE.Vector3(0, 6, 12);
  private readonly currentLook = new THREE.Vector3(0, 1, 0);
  private readonly smoothedDir = new THREE.Vector3(0, 0, -1);

  private shakeIntensity = 0;
  private shakeTimer = 0;
  private shakeDuration = 0.2;
  public shakeEnabled = true;

  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpFwd = new THREE.Vector3();

  constructor(
    public readonly camera: THREE.PerspectiveCamera,
    private readonly physics: PhysicsWorld
  ) {
    this.camera.fov = 65;
    this.camera.updateProjectionMatrix();
  }

  snapToVehicle(vehicle: ArcadeVehicle): void {
    vehicle.syncFromBody();
    const back = vehicle.forwardDir.clone().negate();
    this.smoothedDir.copy(vehicle.forwardDir);
    this.currentPos
      .copy(vehicle.currPosition)
      .addScaledVector(back, 6.8)
      .add(new THREE.Vector3(0, 2.7, 0));
    this.currentLook.copy(vehicle.currPosition).addScaledVector(vehicle.forwardDir, 4);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  addShake(intensity: number, duration = 0.25): void {
    if (!this.shakeEnabled) return;
    if (intensity >= this.shakeIntensity) {
      this.shakeIntensity = Math.min(1.6, intensity);
      this.shakeDuration = Math.max(0.08, duration);
      this.shakeTimer = this.shakeDuration;
    }
  }

  update(vehicle: ArcadeVehicle, alpha: number, dt: number, lookBack: boolean): void {
    vehicle.getInterpolatedTransform(alpha, this.tmpPos, this.tmpQuat);
    this.tmpFwd.set(0, 0, -1).applyQuaternion(this.tmpQuat);
    this.tmpFwd.y = 0;
    if (this.tmpFwd.lengthSq() > 0.001) {
      this.tmpFwd.normalize();
    } else {
      this.tmpFwd.set(0, 0, -1);
    }

    // Blend heading toward velocity when moving fast so drifts feel cinematic
    const desiredDir = this.tmpFwd.clone();
    const horizSpeed = Math.hypot(vehicle.velocity.x, vehicle.velocity.z);
    if (horizSpeed > 6 && !vehicle.isReversing) {
      const velDir = new THREE.Vector3(vehicle.velocity.x, 0, vehicle.velocity.z).normalize();
      desiredDir.lerp(velDir, 0.35).normalize();
    } else if (vehicle.reverseDuration > 2.0) {
      desiredDir.negate();
    }

    this.smoothedDir.lerp(desiredDir, Math.min(1, dt * 6.5)).normalize();

    const activeDir = lookBack ? this.tmpFwd.clone().negate() : this.smoothedDir;

    const backDist = 6.7;
    const upHeight = 2.6;
    const pivot = new THREE.Vector3(this.tmpPos.x, this.tmpPos.y + 1.35, this.tmpPos.z);
    const idealPos = pivot
      .clone()
      .addScaledVector(activeDir, -backDist)
      .add(new THREE.Vector3(0, upHeight - 1.35, 0));

    // Raycast from car to ideal camera position to prevent building clipping (§5.5)
    const rayVec = new THREE.Vector3().subVectors(idealPos, pivot);
    const rayDist = rayVec.length();
    if (rayDist > 0.2) {
      const rayDir = rayVec.clone().divideScalar(rayDist);
      const hit = this.physics.castRay(
        { x: pivot.x, y: pivot.y, z: pivot.z },
        { x: rayDir.x, y: rayDir.y, z: rayDir.z },
        rayDist,
        CAMERA_RAY_FILTER,
        vehicle.body
      );
      if (hit && hit.toi < rayDist) {
        const pullDist = Math.max(1.8, hit.toi - 0.45);
        idealPos.copy(pivot).addScaledVector(rayDir, pullDist);
      }
    }

    if (lookBack) {
      this.currentPos.copy(idealPos);
    } else {
      this.currentPos.lerp(idealPos, Math.min(1, dt * 11.5));
    }

    // Look ahead of car along velocity
    const lookTarget = this.tmpPos
      .clone()
      .add(new THREE.Vector3(0, 1.15, 0))
      .addScaledVector(activeDir, 4.5 + Math.min(5, horizSpeed * 0.14));

    if (lookBack) {
      this.currentLook.copy(lookTarget);
    } else {
      this.currentLook.lerp(lookTarget, Math.min(1, dt * 14));
    }

    // Camera shake
    const shakeOffset = new THREE.Vector3();
    if (this.shakeTimer > 0 && this.shakeEnabled) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      const decay = this.shakeTimer / this.shakeDuration;
      const amp = this.shakeIntensity * decay * 0.45;
      shakeOffset.set(
        (Math.random() - 0.5) * amp,
        (Math.random() - 0.5) * amp,
        (Math.random() - 0.5) * amp
      );
      if (this.shakeTimer <= 0) this.shakeIntensity = 0;
    }

    this.camera.position.copy(this.currentPos).add(shakeOffset);
    this.camera.lookAt(this.currentLook);

    // Dynamic FOV 65..80 (+6 boost kick)
    const speedNorm = Math.min(1, vehicle.speed / 45);
    const targetFov = 65 + speedNorm * 15 + (vehicle.isBoosting ? 6 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 7));
      this.camera.updateProjectionMatrix();
    }
  }
}
