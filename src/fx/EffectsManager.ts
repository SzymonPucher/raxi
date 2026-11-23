import * as THREE from 'three';
import { ArcadeVehicle } from '../vehicle/ArcadeVehicle';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  scale0: number;
  scale1: number;
  gravity: number;
  color: THREE.Color;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  age: number;
  maxAge: number;
  maxRadius: number;
}

const MAX_SOLID_PARTICLES = 240;
const MAX_SMOKE_PARTICLES = 160;
const MAX_SKIDS = 260;

/**
 * Pooled particle & skid-mark system (§5.4, §7.2):
 * - Translucent soft tire smoke & engine damage smoke (never blocks the screen)
 * - Crisp wall-scrape sparks & cartoon pedestrian fireball + star confetti
 * - Skid mark decals & expanding shockwave rings
 */
export class EffectsManager {
  public readonly group = new THREE.Group();
  private readonly solidParticles: Particle[] = [];
  private readonly smokeParticles: Particle[] = [];
  private readonly solidMesh: THREE.InstancedMesh;
  private readonly smokeMesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  private readonly skidMesh: THREE.InstancedMesh;
  private skidCursor = 0;
  private readonly lastWheelPos: THREE.Vector3[] = [];
  private readonly wheelHadSkid: boolean[] = [false, false, false, false];

  private readonly shockwaves: ShockwaveRing[] = [];
  private damageSmokeTimer = 0;
  private tireSmokeTimer = 0;
  private maxSolid = MAX_SOLID_PARTICLES;
  private maxSmoke = MAX_SMOKE_PARTICLES;

  constructor() {
    const makePool = (count: number) => {
      const list: Particle[] = [];
      for (let i = 0; i < count; i++) {
        list.push({
          active: false,
          x: 0,
          y: -999,
          z: 0,
          vx: 0,
          vy: 0,
          vz: 0,
          age: 0,
          maxAge: 1,
          scale0: 1,
          scale1: 0,
          gravity: 0,
          color: new THREE.Color(0xffffff),
        });
      }
      return list;
    };

    // Crisp sparks / confetti / fireball pool
    const solidGeo = new THREE.DodecahedronGeometry(0.32, 0);
    const solidMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.solidMesh = new THREE.InstancedMesh(solidGeo, solidMat, MAX_SOLID_PARTICLES);
    this.solidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.solidMesh.frustumCulled = false;
    this.solidParticles = makePool(MAX_SOLID_PARTICLES);
    for (let i = 0; i < MAX_SOLID_PARTICLES; i++) {
      this.solidMesh.setMatrixAt(i, this.zeroMatrix);
      this.solidMesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.group.add(this.solidMesh);

    // Translucent soft smoke pool (low opacity, no depth write -> never obscures road/view!)
    const smokeGeo = new THREE.SphereGeometry(0.34, 8, 6);
    const smokeMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    this.smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, MAX_SMOKE_PARTICLES);
    this.smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.renderOrder = 2;
    this.smokeParticles = makePool(MAX_SMOKE_PARTICLES);
    for (let i = 0; i < MAX_SMOKE_PARTICLES; i++) {
      this.smokeMesh.setMatrixAt(i, this.zeroMatrix);
      this.smokeMesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.group.add(this.smokeMesh);

    // Skid mark pool
    const skidGeo = new THREE.PlaneGeometry(0.34, 1.0);
    skidGeo.rotateX(-Math.PI * 0.5);
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x161616,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, MAX_SKIDS);
    this.skidMesh.frustumCulled = false;
    for (let i = 0; i < MAX_SKIDS; i++) {
      this.skidMesh.setMatrixAt(i, this.zeroMatrix);
    }
    this.group.add(this.skidMesh);

    for (let i = 0; i < 4; i++) {
      this.lastWheelPos.push(new THREE.Vector3());
    }
  }

  setMaxParticles(limit: number): void {
    this.maxSolid = Math.max(60, Math.min(MAX_SOLID_PARTICLES, Math.round(limit * 0.65)));
    this.maxSmoke = Math.max(40, Math.min(MAX_SMOKE_PARTICLES, Math.round(limit * 0.45)));
  }

  private spawnInPool(
    pool: Particle[],
    limit: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxAge: number,
    scale0: number,
    scale1: number,
    gravity: number,
    hexColor: number
  ): void {
    for (let i = 0; i < limit; i++) {
      const p = pool[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = vx;
        p.vy = vy;
        p.vz = vz;
        p.age = 0;
        p.maxAge = maxAge;
        p.scale0 = scale0;
        p.scale1 = scale1;
        p.gravity = gravity;
        p.color.setHex(hexColor);
        return;
      }
    }
  }

  spawnSparks(x: number, y: number, z: number, count = 10): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 8;
      this.spawnInPool(
        this.solidParticles,
        this.maxSolid,
        x,
        y,
        z,
        Math.cos(ang) * spd,
        2 + Math.random() * 5,
        Math.sin(ang) * spd,
        0.3 + Math.random() * 0.25,
        0.35,
        0.02,
        -14,
        i % 2 === 0 ? 0xffdd44 : 0xff7722
      );
    }
  }

  /** Cartoon fireball + colorful confetti burst (no gore §7.2). */
  spawnPedestrianExplosion(x: number, y: number, z: number): void {
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 5;
      this.spawnInPool(
        this.solidParticles,
        this.maxSolid,
        x + (Math.random() - 0.5) * 0.6,
        y + 0.6 + Math.random() * 0.5,
        z + (Math.random() - 0.5) * 0.6,
        Math.cos(ang) * spd,
        2.5 + Math.random() * 5,
        Math.sin(ang) * spd,
        0.55 + Math.random() * 0.35,
        1.1,
        2.1,
        -2.5,
        i % 3 === 0 ? 0xffee33 : i % 3 === 1 ? 0xff6600 : 0xff2244
      );
    }
    const confettiColors = [0x00e5ff, 0xffea00, 0xff4081, 0x69f0ae, 0xffffff];
    for (let i = 0; i < 18; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 9;
      this.spawnInPool(
        this.solidParticles,
        this.maxSolid,
        x,
        y + 0.9,
        z,
        Math.cos(ang) * spd,
        5 + Math.random() * 7,
        Math.sin(ang) * spd,
        0.9 + Math.random() * 0.5,
        0.45,
        0.15,
        -12,
        confettiColors[i % confettiColors.length]
      );
    }
  }

  spawnShockwave(x: number, y: number, z: number, maxRadius = 25): void {
    const geo = new THREE.RingGeometry(0.6, 1.0, 28);
    geo.rotateX(-Math.PI * 0.5);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x33eeff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.35, z);
    this.group.add(mesh);
    this.shockwaves.push({ mesh, age: 0, maxAge: 0.55, maxRadius });
  }

  clearSkids(): void {
    for (let i = 0; i < MAX_SKIDS; i++) {
      this.skidMesh.setMatrixAt(i, this.zeroMatrix);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.wheelHadSkid.fill(false);
  }

  private stepPool(pool: Particle[], mesh: THREE.InstancedMesh, dt: number, fadeScaleOut: boolean): void {
    let dirty = false;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      dirty = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        mesh.setMatrixAt(i, this.zeroMatrix);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.age / p.maxAge;
      // Soft smoke grows then shrinks gently at the end so puffs dissolve smoothly
      const sc = fadeScaleOut
        ? THREE.MathUtils.lerp(p.scale0, p.scale1, Math.sin(t * Math.PI))
        : THREE.MathUtils.lerp(p.scale0, p.scale1, t);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(t * 2.1, t * 2.7, 0);
      this.dummy.scale.setScalar(Math.max(0.01, sc));
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      mesh.setColorAt(i, p.color);
    }
    if (dirty) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  update(dt: number, vehicle: ArcadeVehicle, carCondition: number): void {
    // Translucent wispy tire smoke & skid marks
    this.tireSmokeTimer -= dt;
    const emitSmoke = this.tireSmokeTimer <= 0;
    if (emitSmoke) this.tireSmokeTimer = 0.06;

    for (let i = 0; i < vehicle.wheels.length; i++) {
      const w = vehicle.wheels[i];
      const slipping = w.grounded && w.slipAmount > 0.38 && vehicle.speed > 6;
      if (slipping) {
        if (emitSmoke) {
          this.spawnInPool(
            this.smokeParticles,
            this.maxSmoke,
            w.contactPoint.x,
            w.contactPoint.y + 0.14,
            w.contactPoint.z,
            (Math.random() - 0.5) * 1.2,
            0.55 + Math.random() * 0.45,
            (Math.random() - 0.5) * 1.2,
            0.48 + Math.random() * 0.22,
            0.35,
            1.05,
            0.3,
            0xe4e8ec
          );
        }
        if (this.wheelHadSkid[i]) {
          const prev = this.lastWheelPos[i];
          const dx = w.contactPoint.x - prev.x;
          const dz = w.contactPoint.z - prev.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.35 && dist < 8) {
            const mx = (prev.x + w.contactPoint.x) * 0.5;
            const my = w.contactPoint.y + 0.04;
            const mz = (prev.z + w.contactPoint.z) * 0.5;
            const yaw = Math.atan2(dx, dz);
            this.dummy.position.set(mx, my, mz);
            this.dummy.rotation.set(0, yaw, 0);
            this.dummy.scale.set(1, 1, dist + 0.15);
            this.dummy.updateMatrix();
            this.skidMesh.setMatrixAt(this.skidCursor, this.dummy.matrix);
            this.skidCursor = (this.skidCursor + 1) % MAX_SKIDS;
            this.skidMesh.instanceMatrix.needsUpdate = true;
            this.lastWheelPos[i].copy(w.contactPoint);
          }
        } else {
          this.lastWheelPos[i].copy(w.contactPoint);
          this.wheelHadSkid[i] = true;
        }
      } else {
        this.wheelHadSkid[i] = false;
      }
    }

    // Translucent engine damage smoke (§8.6: light smoke < 60%, dark smoke < 30%)
    if (carCondition < 60) {
      this.damageSmokeTimer -= dt;
      if (this.damageSmokeTimer <= 0) {
        this.damageSmokeTimer = carCondition < 30 ? 0.1 : 0.18;
        const hood = vehicle.currPosition
          .clone()
          .addScaledVector(vehicle.forwardDir, 1.55)
          .addScaledVector(vehicle.rightDir, (Math.random() - 0.5) * 0.55)
          .add(new THREE.Vector3(0, 0.55, 0));
        this.spawnInPool(
          this.smokeParticles,
          this.maxSmoke,
          hood.x,
          hood.y,
          hood.z,
          vehicle.velocity.x * 0.25 + (Math.random() - 0.5) * 1.1,
          1.25 + Math.random() * 0.75,
          vehicle.velocity.z * 0.25 + (Math.random() - 0.5) * 1.1,
          0.62,
          0.32,
          0.95,
          0.4,
          carCondition < 30 ? 0x2b2b2b : 0xb5bcc4
        );
      }
    }

    this.stepPool(this.solidParticles, this.solidMesh, dt, false);
    this.stepPool(this.smokeParticles, this.smokeMesh, dt, true);

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      if (sw.age >= sw.maxAge) {
        this.group.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        (sw.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      const t = sw.age / sw.maxAge;
      const r = 1 + t * sw.maxRadius;
      sw.mesh.scale.set(r, 1, r);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
    }
  }
}
