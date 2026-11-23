import * as THREE from 'three';
import { BALANCE } from '../core/config/balance';
import { Rng } from '../core/Rng';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ArcadeVehicle } from '../vehicle/ArcadeVehicle';
import { MapDefinition } from '../world/mapData';
import { RoadEdge } from '../world/RoadGraph';
import { TrafficCar } from './TrafficCar';
import { TrafficLights } from './TrafficLights';

export interface NearMissHit {
  relSpeed: number;
  distance: number;
}

/**
 * Pooled traffic manager (§7.1):
 * - 34..60 active cars around the player (scales with tier, Rush Hour, and traffic.density)
 * - Lane following, red-light stopping, following distance braking, stuck timeout -> despawn
 * - Knocked dynamic physics on collision or Shockwave
 * - Horn reaction (stronger with Loud Horn)
 * - Near-miss detection
 */
export class TrafficManager {
  public readonly group = new THREE.Group();
  public readonly cars: TrafficCar[] = [];
  private readonly carById = new Map<number, TrafficCar>();
  private readonly candidateEdges: RoadEdge[];
  private spawnCooldown = 0;

  constructor(
    private readonly map: MapDefinition,
    physics: PhysicsWorld,
    private readonly lights: TrafficLights
  ) {
    this.candidateEdges = map.graph.edges.filter((e) => !e.isShortcut && e.length >= 45);
    for (let i = 0; i < BALANCE.trafficMaxCount; i++) {
      const car = new TrafficCar(i + 1, i, physics);
      this.cars.push(car);
      this.carById.set(car.id, car);
      this.group.add(car.mesh);
    }
  }

  reset(): void {
    for (const c of this.cars) {
      c.despawn();
    }
    this.spawnCooldown = 0;
  }

  getCarById(id: number): TrafficCar | undefined {
    return this.carById.get(id);
  }

  knockCarById(id: number, playerVel: THREE.Vector3, bulldozer: boolean): void {
    const car = this.carById.get(id);
    if (!car || !car.active) return;
    const mult = bulldozer ? 1.85 : 1.15;
    const speed = Math.max(12, playerVel.length());
    const dir = playerVel.lengthSq() > 1 ? playerVel.clone().normalize() : new THREE.Vector3(0, 0, -1);
    car.knock(dir.x * speed * mult, 4.5 + speed * 0.16, dir.z * speed * mult);
  }

  /** Shockwave (#24): blast all traffic within radius away. Returns count of blasted cars. */
  pushTrafficAround(x: number, z: number, radius: number, force: number): number {
    let count = 0;
    const r2 = radius * radius;
    for (const c of this.cars) {
      if (!c.active) continue;
      const dx = c.x - x;
      const dz = c.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const falloff = 1 - (d / radius) * 0.45;
        c.knock(nx * force * falloff, 8 + 6 * falloff, nz * force * falloff);
        count++;
      }
    }
    return count;
  }

  /** Horn reaction (§7.1 + Loud Horn #10): cars ahead swerve aside. */
  reactToHorn(px: number, pz: number, fwdX: number, fwdZ: number, loud: boolean): void {
    const range = loud ? 58 : 30;
    const swerveMag = loud ? 4.4 : 2.1;
    for (const c of this.cars) {
      if (!c.active || c.knocked) continue;
      const dx = c.x - px;
      const dz = c.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 1) continue;
      const dot = (dx * fwdX + dz * fwdZ) / dist;
      if (dot > 0.35) {
        c.swerveOffset = swerveMag;
        c.swerveTimer = loud ? 3.5 : 2.0;
      }
    }
  }

  update(
    dt: number,
    player: ArcadeVehicle,
    targetCount: number,
    rng: Rng,
    detectNearMisses: boolean
  ): NearMissHit[] {
    const nearMisses: NearMissHit[] = [];
    const px = player.currPosition.x;
    const pz = player.currPosition.z;
    const clampedTarget = Math.max(10, Math.min(BALANCE.trafficMaxCount, Math.round(targetCount)));

    let activeCount = 0;
    for (const c of this.cars) {
      if (c.active) activeCount++;
    }

    // Spawn cars up to targetCount
    this.spawnCooldown -= dt;
    if (activeCount < clampedTarget && this.spawnCooldown <= 0) {
      const toSpawn = Math.min(3, clampedTarget - activeCount);
      for (let s = 0; s < toSpawn; s++) {
        this.trySpawnCar(px, pz, rng);
      }
      this.spawnCooldown = 0.25;
    }

    const despawnSq = BALANCE.trafficDespawnDist * BALANCE.trafficDespawnDist;

    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      if (!c.active) continue;

      if (c.nearMissCooldown > 0) c.nearMissCooldown -= dt;

      if (c.knocked) {
        c.knockedTimer += dt;
        const t = c.body.translation();
        const r = c.body.rotation();
        c.x = t.x;
        c.y = t.y;
        c.z = t.z;
        c.mesh.position.set(t.x, t.y, t.z);
        c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        const distSq = (t.x - px) ** 2 + (t.z - pz) ** 2;
        if (c.knockedTimer >= BALANCE.trafficKnockedDespawnTime || distSq > despawnSq || t.y < -20) {
          c.despawn();
        }
        continue;
      }

      // Despawn when too far
      const distPlayerSq = (c.x - px) ** 2 + (c.z - pz) ** 2;
      if (distPlayerSq > despawnSq) {
        c.despawn();
        continue;
      }

      const edge = c.edge;
      if (!edge || edge.blocked) {
        c.despawn();
        continue;
      }

      const fromN = this.map.graph.getNode(c.forward ? edge.from : edge.to)!;
      const toN = this.map.graph.getNode(c.forward ? edge.to : edge.from)!;
      const dx = toN.x - fromN.x;
      const dz = toN.z - fromN.z;
      const len = Math.max(0.01, Math.hypot(dx, dz));
      const dirX = dx / len;
      const dirZ = dz / len;
      const rightX = -dirZ;
      const rightZ = dirX;

      // Determine desired speed (respect red light, car ahead, player ahead)
      let desiredSpeed = edge.speedLimit * 0.85;
      const distToEnd = len - c.progress;

      // Red light check before stop line
      if (
        toN.hasTrafficLight &&
        distToEnd < 20 &&
        distToEnd > 8.5 &&
        this.lights.isRedForDirection(toN.id, dirX, dirZ)
      ) {
        desiredSpeed = 0;
      }

      // Brake for another traffic car directly ahead
      for (let j = 0; j < this.cars.length; j++) {
        if (i === j) continue;
        const o = this.cars[j];
        if (!o.active || o.knocked) continue;
        const ox = o.x - c.x;
        const oz = o.z - c.z;
        const ahead = ox * dirX + oz * dirZ;
        if (ahead > 2 && ahead < 16) {
          const lat = Math.abs(ox * rightX + oz * rightZ);
          if (lat < 2.2) {
            desiredSpeed = Math.min(desiredSpeed, Math.max(0, (ahead - 7) * 1.4));
          }
        }
      }

      // Brake gently if player is directly in front
      const pdx = px - c.x;
      const pdz = pz - c.z;
      const pAhead = pdx * dirX + pdz * dirZ;
      if (pAhead > 2 && pAhead < 14) {
        const pLat = Math.abs(pdx * rightX + pdz * rightZ);
        if (pLat < 2.2) {
          desiredSpeed = Math.min(desiredSpeed, 0);
        }
      }

      // Smooth accel / braking
      const rate = desiredSpeed > c.speed ? 6.5 : 14.0;
      c.speed += Math.sign(desiredSpeed - c.speed) * Math.min(Math.abs(desiredSpeed - c.speed), rate * dt);

      // Stuck timeout -> despawn (prevents permanent intersection gridlock, M4 acceptance!)
      if (c.speed < 0.8) {
        c.stuckTimer += dt;
        if (c.stuckTimer >= BALANCE.trafficStuckTimeout) {
          c.despawn();
          continue;
        }
      } else {
        c.stuckTimer = 0;
      }

      // Horn swerve decay
      if (c.swerveTimer > 0) {
        c.swerveTimer -= dt;
        if (c.swerveTimer <= 0) c.swerveOffset = 0;
      }

      c.progress += c.speed * dt;

      // Reached intersection -> choose next road edge
      if (c.progress >= len) {
        const adj = this.map.graph.adjacency.get(toN.id) ?? [];
        const options = adj.filter(
          (a) => a.edge.id !== edge.id && !a.edge.isShortcut && !a.edge.blocked
        );
        if (options.length === 0) {
          c.despawn();
          continue;
        }
        const pick = rng.pick(options);
        c.edge = pick.edge;
        c.forward = pick.edge.from === toN.id;
        c.progress = 1.0;
        const maxLane = Math.max(1, pick.edge.lanesPerDir);
        const laneIdx = rng.int(0, maxLane - 1);
        const laneW = (pick.edge.width * 0.5) / maxLane;
        c.laneOffset = (laneIdx + 0.5) * laneW;
      }

      const curEdge = c.edge!;
      const curFrom = this.map.graph.getNode(c.forward ? curEdge.from : curEdge.to)!;
      const curTo = this.map.graph.getNode(c.forward ? curEdge.to : curEdge.from)!;
      const cdx = curTo.x - curFrom.x;
      const cdy = curTo.y - curFrom.y;
      const cdz = curTo.z - curFrom.z;
      const clen = Math.max(0.01, Math.hypot(cdx, cdz));
      const cdirX = cdx / clen;
      const cdirZ = cdz / clen;
      const crightX = -cdirZ;
      const crightZ = cdirX;
      const tFrac = Math.min(1, c.progress / clen);
      const lat = c.laneOffset + c.swerveOffset;

      const nx = curFrom.x + cdx * tFrac + crightX * lat;
      const ny = curFrom.y + cdy * tFrac + c.spec.h * 0.5 + 0.1;
      const nz = curFrom.z + cdz * tFrac + crightZ * lat;
      const nyaw = Math.atan2(-cdirX, -cdirZ);

      c.setKinematicPose(nx, ny, nz, nyaw);

      // Near miss check (§9.4: within 1.2m clearance at > 15 m/s relative speed)
      if (detectNearMisses && c.nearMissCooldown <= 0 && !player.isGhost) {
        const halfSumX = (c.spec.w + 1.9) * 0.5;
        const halfSumZ = (c.spec.l + 4.4) * 0.5;
        const dist = Math.hypot(px - nx, pz - nz);
        const clearance = dist - Math.min(halfSumX, halfSumZ);
        if (clearance > 0.1 && clearance <= BALANCE.styleNearMissRadius + 1.4) {
          const tvx = cdirX * c.speed;
          const tvz = cdirZ * c.speed;
          const relSpeed = Math.hypot(player.velocity.x - tvx, player.velocity.z - tvz);
          if (relSpeed >= BALANCE.styleNearMissRelSpeed) {
            c.nearMissCooldown = 3.0;
            nearMisses.push({ relSpeed, distance: clearance });
          }
        }
      }
    }

    return nearMisses;
  }

  private trySpawnCar(px: number, pz: number, rng: Rng): void {
    const slot = this.cars.find((c) => !c.active);
    if (!slot) return;

    // Sample a few candidate edges in the 110..240m ring around the player
    for (let attempt = 0; attempt < 16; attempt++) {
      const edge = rng.pick(this.candidateEdges);
      if (edge.blocked) continue;
      const a = this.map.graph.getNode(edge.from)!;
      const b = this.map.graph.getNode(edge.to)!;
      const mx = (a.x + b.x) * 0.5;
      const mz = (a.z + b.z) * 0.5;
      const d = Math.hypot(mx - px, mz - pz);
      if (d < BALANCE.trafficSpawnMin || d > BALANCE.trafficSpawnMax) continue;

      const forward = rng.chance(0.5);
      const fromN = forward ? a : b;
      const toN = forward ? b : a;
      const dx = toN.x - fromN.x;
      const dy = toN.y - fromN.y;
      const dz = toN.z - fromN.z;
      const len = Math.max(1, Math.hypot(dx, dz));
      const t = rng.range(0.15, 0.85);
      const maxLane = Math.max(1, edge.lanesPerDir);
      const laneW = (edge.width * 0.5) / maxLane;
      const laneOffset = (rng.int(0, maxLane - 1) + 0.5) * laneW;
      const dirX = dx / len;
      const dirZ = dz / len;
      const sx = fromN.x + dx * t - dirZ * laneOffset;
      const sy = fromN.y + dy * t + slot.spec.h * 0.5 + 0.1;
      const sz = fromN.z + dz * t + dirX * laneOffset;

      // Ensure not spawning on top of another traffic car
      if (this.cars.some((o) => o.active && Math.hypot(o.x - sx, o.z - sz) < 12)) continue;

      slot.spawnOnEdge(edge, forward, t * len, laneOffset, sx, sy, sz, Math.atan2(-dirX, -dirZ));
      return;
    }
  }
}
