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

const MAX_PARTICLES = 360;
const MAX_SKIDS = 260;

/**
 * Pooled particle & skid-mark system (§5.4, §7.2):
 * - Tire smoke & engine damage smoke
 * - Wall-scrape sparks
 * - Cartoon pedestrian explosion (fireball + star confetti)
 * - Skid mark decals
 * - Shockwave expanding ring
 */
export class EffectsManager {
  public readonly group = new THREE.Group();
  private readonly particles: Particle[] = [];
  private readonly particleMesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  private readonly skidMesh: THREE.InstancedMesh;
  private skidCursor = 0;
  private readonly lastWheelPos: THREE.Vector3[] = [];
  private readonly wheelHadSkid: boolean[] = [false, false, false, false];

  private readonly shockwaves: ShockwaveRing[] = [];
  private damageSmokeTimer = 0;
  private tireSmokeTimer = 0;
  private maxParticles = MAX_PARTICLES;

  constructor() {
    // Low-poly dodecahedron particle pool (1 draw call!)
    const pGeo = new THREE.DodecahedronGeometry(0.35, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, MAX_PARTICLES);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
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
      this.particleMesh.setMatrixAt(i, this.zeroMatrix);
      this.particleMesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.group.add(this.particleMesh);

    // Skid mark pool (1 draw call!)
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
    this.maxParticles = Math.max(60, Math.min(MAX_PARTICLES, limit));
  }

  private spawnParticle(
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
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
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
      this.spawnParticle(
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
    // Bright cartoon fireball puffs
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 5;
      this.spawnParticle(
        x + (Math.random() - 0.5) * 0.6,
        y + 0.6 + Math.random() * 0.5,
        z + (Math.random() - 0.5) * 0.6,
        Math.cos(ang) * spd,
        2.5 + Math.random() * 5,
        Math.sin(ang) * spd,
        0.55 + Math.random() * 0.35,
        1.1,
        2.3,
        -2.5,
        i % 3 === 0 ? 0xffee33 : i % 3 === 1 ? 0xff6600 : 0xff2244
      );
    }
    // Star confetti burst
    const confettiColors = [0x00e5ff, 0xffea00, 0xff4081, 0x69f0ae, 0xffffff];
    for (let i = 0; i < 18; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 9;
      this.spawnParticle(
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

  update(dt: number, vehicle: ArcadeVehicle, carCondition: number): void {
    // Tire smoke & skid marks
    this.tireSmokeTimer -= dt;
    const emitSmoke = this.tireSmokeTimer <= 0;
    if (emitSmoke) this.tireSmokeTimer = 0.045;

    for (let i = 0; i < vehicle.wheels.length; i++) {
      const w = vehicle.wheels[i];
      const slipping = w.grounded && w.slipAmount > 0.38 && vehicle.speed > 6;
      if (slipping) {
        if (emitSmoke) {
          this.spawnParticle(
            w.contactPoint.x,
            w.contactPoint.y + 0.15,
            w.contactPoint.z,
            (Math.random() - 0.5) * 1.4,
            0.9 + Math.random() * 0.8,
            (Math.random() - 0.5) * 1.4,
            0.55 + Math.random() * 0.3,
            0.5,
            1.6,
            0.6,
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

    // Engine damage smoke (§8.6: light smoke < 60%, dark smoke < 30%)
    if (carCondition < 60) {
      this.damageSmokeTimer -= dt;
      if (this.damageSmokeTimer <= 0) {
        this.damageSmokeTimer = carCondition < 30 ? 0.07 : 0.14;
        const hood = vehicle.currPosition
          .clone()
          .addScaledVector(vehicle.forwardDir, 1.5)
          .add(new THREE.Vector3(0, 0.7, 0));
        this.spawnParticle(
          hood.x,
          hood.y,
          hood.z,
          vehicle.velocity.x * 0.3 + (Math.random() - 0.5) * 1.0,
          1.8 + Math.random() * 1.2,
          vehicle.velocity.z * 0.3 + (Math.random() - 0.5) * 1.0,
          0.75,
          0.45,
          1.45,
          0.8,
          carCondition < 30 ? 0x2b2b2b : 0xb5bcc4
        );
      }
    }

    // Update particles
    let dirty = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirty = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        this.particleMesh.setMatrixAt(i, this.zeroMatrix);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = p.age / p.maxAge;
      const sc = THREE.MathUtils.lerp(p.scale0, p.scale1, t);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(t * 2.5, t * 3.1, 0);
      this.dummy.scale.setScalar(Math.max(0.01, sc));
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
      this.particleMesh.setColorAt(i, p.color);
    }
    if (dirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }

    // Update shockwaves
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
