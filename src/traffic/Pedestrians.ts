import * as THREE from 'three';
import { BALANCE } from '../core/config/balance';
import { Rng } from '../core/Rng';
import { WaitingPassenger } from '../gameplay/PassengerSpawner';
import { getTripColorHex } from '../gameplay/Passenger';
import { ArcadeVehicle } from '../vehicle/ArcadeVehicle';
import { MapDefinition, SidewalkSpot } from '../world/mapData';

interface Pedestrian {
  id: number;
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  walkDirX: number;
  walkDirZ: number;
  walkSpeed: number;
  diving: boolean;
  diveTimer: number;
  scareCooldown: number;
  chainTimer: number; // > 0 when triggered by nearby explosion chain reaction
  respawnTimer: number;
  shirtColor: THREE.Color;
  walkPhase: number;
}

export interface PedImpactResult {
  explosions: Array<{ x: number; y: number; z: number; isChain: boolean; wasPassenger: boolean; passengerId?: string }>;
  scares: number[];
}

/**
 * Low-poly instanced pedestrians (§7.2):
 * - Walk along sidewalks near the player (~55 max)
 * - Dive away when car approaches fast (not guaranteed -> avoidable but risky!)
 * - Cartoon explosion on overlap with player car + 0.3s chain reaction within 3 m
 * - Also renders Waiting Passengers (rings + markers + figures) and Destination Light Beams!
 */
export class PedestriansManager {
  public readonly group = new THREE.Group();
  private readonly peds: Pedestrian[] = [];
  private readonly bodyInst: THREE.InstancedMesh;
  private readonly headInst: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

  // Waiting passenger visuals
  private readonly passengerVisuals = new Map<
    string,
    { group: THREE.Group; ring: THREE.Mesh; beacon: THREE.Mesh }
  >();
  // Active destination beams (up to 2 for Double Booking)
  private readonly destBeams: THREE.Group[] = [];

  constructor(private readonly map: MapDefinition) {
    const count = BALANCE.pedMaxCount;
    const bodyGeo = new THREE.CylinderGeometry(0.24, 0.28, 1.15, 6);
    bodyGeo.translate(0, 0.58, 0);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.bodyInst = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    this.bodyInst.frustumCulled = false;

    const headGeo = new THREE.SphereGeometry(0.22, 6, 6);
    headGeo.translate(0, 1.38, 0);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffd1a9 });
    this.headInst = new THREE.InstancedMesh(headGeo, headMat, count);
    this.headInst.frustumCulled = false;

    const shirtPalette = [0xe53935, 0x1e88e5, 0x43a047, 0xffb300, 0x8e24aa, 0x00acc1, 0xff7043, 0xec407a];
    for (let i = 0; i < count; i++) {
      this.peds.push({
        id: i + 1,
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vz: 0,
        walkDirX: 1,
        walkDirZ: 0,
        walkSpeed: 1.5,
        diving: false,
        diveTimer: 0,
        scareCooldown: 0,
        chainTimer: 0,
        respawnTimer: 0,
        shirtColor: new THREE.Color(shirtPalette[i % shirtPalette.length]),
        walkPhase: i * 0.7,
      });
      this.bodyInst.setMatrixAt(i, this.zeroMat);
      this.headInst.setMatrixAt(i, this.zeroMat);
      this.bodyInst.setColorAt(i, this.peds[i].shirtColor);
    }
    this.group.add(this.bodyInst, this.headInst);

    // Pre-create 2 destination light beams
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 4.6, 150, 14, 1, true),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0x00e676 : 0xffd600,
          transparent: true,
          opacity: 0.34,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      beam.position.y = 75;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(6.8, 8.2, 28),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0x00e676 : 0xffd600,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.75,
        })
      );
      ring.rotation.x = -Math.PI * 0.5;
      ring.position.y = 0.16;
      g.add(beam, ring);
      g.visible = false;
      this.group.add(g);
      this.destBeams.push(g);
    }
  }

  reset(): void {
    for (let i = 0; i < this.peds.length; i++) {
      this.peds[i].active = false;
      this.peds[i].chainTimer = 0;
      this.peds[i].respawnTimer = 0;
      this.bodyInst.setMatrixAt(i, this.zeroMat);
      this.headInst.setMatrixAt(i, this.zeroMat);
    }
    this.bodyInst.instanceMatrix.needsUpdate = true;
    this.headInst.instanceMatrix.needsUpdate = true;
    for (const v of this.passengerVisuals.values()) {
      this.group.remove(v.group);
    }
    this.passengerVisuals.clear();
    for (const b of this.destBeams) b.visible = false;
  }

  update(
    dt: number,
    player: ArcadeVehicle,
    waitingPassengers: WaitingPassenger[],
    activeDestinations: Array<{ x: number; y: number; z: number }>,
    rng: Rng,
    timeSec: number
  ): PedImpactResult {
    const out: PedImpactResult = { explosions: [], scares: [] };
    const px = player.currPosition.x;
    const py = player.currPosition.y;
    const pz = player.currPosition.z;
    const pSpd = player.speed;
    const fwdX = player.forwardDir.x;
    const fwdZ = player.forwardDir.z;

    const triggerChainAround = (ex: number, ez: number) => {
      const r2 = BALANCE.pedChainRadius * BALANCE.pedChainRadius;
      for (const other of this.peds) {
        if (!other.active || other.chainTimer > 0) continue;
        const d2 = (other.x - ex) ** 2 + (other.z - ez) ** 2;
        if (d2 <= r2) {
          other.chainTimer = BALANCE.pedChainDelay;
        }
      }
    };

    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      if (!p.active) {
        if (p.respawnTimer > 0) {
          p.respawnTimer -= dt;
        } else {
          this.trySpawnPed(p, px, pz, rng);
        }
        this.bodyInst.setMatrixAt(i, this.zeroMat);
        this.headInst.setMatrixAt(i, this.zeroMat);
        continue;
      }

      if (p.scareCooldown > 0) p.scareCooldown -= dt;

      // Chain reaction countdown (§7.2: 0.3s delay)
      if (p.chainTimer > 0) {
        p.chainTimer -= dt;
        if (p.chainTimer <= 0) {
          p.active = false;
          p.respawnTimer = BALANCE.pedRespawnDelay;
          out.explosions.push({ x: p.x, y: p.y, z: p.z, isChain: true, wasPassenger: false });
          triggerChainAround(p.x, p.z);
          this.bodyInst.setMatrixAt(i, this.zeroMat);
          this.headInst.setMatrixAt(i, this.zeroMat);
          continue;
        }
      }

      const dx = p.x - px;
      const dz = p.z - pz;
      const dist = Math.hypot(dx, dz);

      if (dist > BALANCE.pedDespawnRadius) {
        p.active = false;
        p.respawnTimer = 0.5;
        this.bodyInst.setMatrixAt(i, this.zeroMat);
        this.headInst.setMatrixAt(i, this.zeroMat);
        continue;
      }

      // Dive-away AI when fast car approaches (§7.2)
      if (!p.diving && dist < BALANCE.pedDiveDetectRadius && pSpd > 8) {
        const dot = (dx * fwdX + dz * fwdZ) / Math.max(0.1, dist);
        if (dot > 0.45) {
          // Lateral vector away from car path
          const cross = fwdX * dz - fwdZ * dx;
          const sideSign = cross >= 0 ? 1 : -1;
          const latX = -fwdZ * sideSign;
          const latZ = fwdX * sideSign;
          p.diving = true;
          p.diveTimer = 0.65;
          p.vx = latX * 5.2;
          p.vz = latZ * 5.2;
        }
      }

      if (p.diving) {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.diveTimer -= dt;
        if (p.diveTimer <= 0) {
          p.diving = false;
        }
      } else {
        p.x += p.walkDirX * p.walkSpeed * dt;
        p.z += p.walkDirZ * p.walkSpeed * dt;
        p.walkPhase += dt * 6;
      }

      // Check player overlap -> cartoon explosion! (Ghost Cab passes safely §7.2)
      if (!player.isGhost && Math.abs(py - p.y) < 2.2) {
        if (dist < 1.85) {
          p.active = false;
          p.respawnTimer = BALANCE.pedRespawnDelay;
          out.explosions.push({ x: p.x, y: p.y, z: p.z, isChain: false, wasPassenger: false });
          triggerChainAround(p.x, p.z);
          this.bodyInst.setMatrixAt(i, this.zeroMat);
          this.headInst.setMatrixAt(i, this.zeroMat);
          continue;
        } else if (dist < 2.85 && pSpd > 9 && p.scareCooldown <= 0) {
          p.scareCooldown = 3.0;
          out.scares.push(dist - 1.85);
        }
      }

      // Update instanced transform
      const bob = p.diving ? 0.15 : Math.abs(Math.sin(p.walkPhase)) * 0.08;
      this.dummy.position.set(p.x, p.y + bob, p.z);
      this.dummy.rotation.set(p.diving ? 0.7 : 0, Math.atan2(p.walkDirX, p.walkDirZ), 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.bodyInst.setMatrixAt(i, this.dummy.matrix);
      this.headInst.setMatrixAt(i, this.dummy.matrix);
    }

    this.bodyInst.instanceMatrix.needsUpdate = true;
    this.headInst.instanceMatrix.needsUpdate = true;

    // Check waiting passenger direct impacts (§7.2: hitting a waiting passenger explodes them too!)
    if (!player.isGhost) {
      for (const wp of waitingPassengers) {
        if (wp.exploded) continue;
        const d = Math.hypot(wp.x - px, wp.z - pz);
        if (d < 1.75 && Math.abs(wp.y - py) < 2.2 && pSpd > 4.5) {
          wp.exploded = true;
          out.explosions.push({
            x: wp.x,
            y: wp.y,
            z: wp.z,
            isChain: false,
            wasPassenger: true,
            passengerId: wp.id,
          });
          triggerChainAround(wp.x, wp.z);
        }
      }
    }

    // Sync waiting passenger 3D markers
    this.syncWaitingPassengerVisuals(waitingPassengers, timeSec);

    // Sync active destination beams
    for (let i = 0; i < this.destBeams.length; i++) {
      const dest = activeDestinations[i];
      const beamGroup = this.destBeams[i];
      if (dest) {
        beamGroup.visible = true;
        beamGroup.position.set(dest.x, dest.y, dest.z);
        beamGroup.rotation.y = timeSec * 1.2;
      } else {
        beamGroup.visible = false;
      }
    }

    return out;
  }

  private trySpawnPed(p: Pedestrian, px: number, pz: number, rng: Rng): void {
    const spots: SidewalkSpot[] = this.map.sidewalkSpots;
    for (let attempt = 0; attempt < 8; attempt++) {
      const s = rng.pick(spots);
      const d = Math.hypot(s.x - px, s.z - pz);
      if (d < 22 || d > BALANCE.pedSpawnRadius) continue;

      const edge = this.map.graph.edgeMap.get(s.edgeId);
      let dirX = 1;
      let dirZ = 0;
      if (edge) {
        const a = this.map.graph.getNode(edge.from)!;
        const b = this.map.graph.getNode(edge.to)!;
        const len = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
        const sign = rng.chance(0.5) ? 1 : -1;
        dirX = ((b.x - a.x) / len) * sign;
        dirZ = ((b.z - a.z) / len) * sign;
      }

      p.active = true;
      p.x = s.x + rng.range(-2.5, 2.5);
      p.y = s.y;
      p.z = s.z + rng.range(-2.5, 2.5);
      p.walkDirX = dirX;
      p.walkDirZ = dirZ;
      p.walkSpeed = rng.range(1.2, 2.1);
      p.diving = false;
      p.chainTimer = 0;
      return;
    }
    p.respawnTimer = 0.6;
  }

  private syncWaitingPassengerVisuals(waiting: WaitingPassenger[], timeSec: number): void {
    const liveIds = new Set(waiting.map((w) => w.id));
    for (const [id, vis] of this.passengerVisuals.entries()) {
      if (!liveIds.has(id)) {
        this.group.remove(vis.group);
        this.passengerVisuals.delete(id);
      }
    }

    for (const wp of waiting) {
      let vis = this.passengerVisuals.get(wp.id);
      if (!vis) {
        const colorHex = getTripColorHex(wp.tripCategory);
        const g = new THREE.Group();

        // Waiting person mesh
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.34, 1.25, 7),
          new THREE.MeshLambertMaterial({ color: wp.type.shirtColor })
        );
        body.position.y = 0.65;
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.26, 7, 7),
          new THREE.MeshLambertMaterial({ color: 0xffd5b5 })
        );
        head.position.y = 1.5;

        // Pickup ring (radius 6m §8.3)
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(4.8, 6.0, 26),
          new THREE.MeshBasicMaterial({
            color: colorHex,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.72,
          })
        );
        ring.rotation.x = -Math.PI * 0.5;
        ring.position.y = 0.16;

        // Tall color-coded pickup beacon / diamond marker above passenger
        const beacon = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.85, 0),
          new THREE.MeshBasicMaterial({ color: colorHex })
        );
        beacon.position.y = 3.4;

        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.9, 28, 8, 1, true),
          new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        pillar.position.y = 14;

        g.add(body, head, ring, beacon, pillar);
        g.position.set(wp.x, wp.y, wp.z);
        this.group.add(g);
        vis = { group: g, ring, beacon };
        this.passengerVisuals.set(wp.id, vis);
      }

      vis.beacon.position.y = 3.4 + Math.sin(timeSec * 4.5) * 0.45;
      vis.beacon.rotation.y = timeSec * 2.4;
      const pulse = 1 + Math.sin(timeSec * 5) * 0.05;
      vis.ring.scale.set(pulse, pulse, 1);
    }
  }
}
