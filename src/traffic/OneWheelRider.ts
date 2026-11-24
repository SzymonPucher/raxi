import * as THREE from 'three';
import { BALANCE } from '../core/config/balance';
import { Rng } from '../core/Rng';
import { ArcadeVehicle } from '../vehicle/ArcadeVehicle';
import { MapDefinition, SidewalkSpot } from '../world/mapData';
import { RoadEdge } from '../world/RoadGraph';

export type OneWheelVariant = 'fatMan' | 'pregnantWoman';

export interface OneWheelRiderSnapshot {
  id: number;
  variant: OneWheelVariant;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  speed: number;
  age: number;
}

export interface OneWheelHitEvent {
  x: number;
  y: number;
  z: number;
  bonusTimeSeconds: number;
  oneWheelVariant: OneWheelVariant;
}

export interface OneWheelRiderVisual {
  root: THREE.Group;
  boardTilt: THREE.Group;
  wheel: THREE.Group;
  markerArrow: THREE.Group;
  markerRing: THREE.Group;
}

interface OneWheelRiderEntity {
  id: number;
  variant: OneWheelVariant;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  speed: number;
  age: number;
  phase: number;
  edgeId: string | null;
  fromNodeId: string | null;
  toNodeId: string | null;
  edgeProgress: number;
  edgeLength: number;
  lateralOffset: number;
  visual: OneWheelRiderVisual;
}

const WHEEL_RADIUS = 0.18;
const HIT_RADIUS = 2.2;
const HIT_MAX_DY = 2.4;
const SPAWN_DIST_MIN = 35;
const SPAWN_DIST_MAX = 85;
const MAX_ACTIVE_RIDERS = 2;

/**
 * 50/50 deterministic selection between the two OneWheel bonus rider variants.
 */
export function pickOneWheelVariant(rng: Rng): OneWheelVariant {
  return rng.chance(0.5) ? 'fatMan' : 'pregnantWoman';
}

/**
 * Builds the OneWheel board + sculpted low-poly rider ('fatMan' or 'pregnantWoman')
 * plus a golden/cyan floating arrow and ground ring marker so players spot the +10s bonus target.
 */
export function buildOneWheelRiderMesh(variant: OneWheelVariant): OneWheelRiderVisual {
  const root = new THREE.Group();
  root.name = `onewheel_${variant}`;

  const boardTilt = new THREE.Group();
  root.add(boardTilt);

  // --- OneWheel board (oriented forward along +Z) ---
  const railMat = new THREE.MeshPhongMaterial({
    color: variant === 'fatMan' ? 0x263238 : 0x37474f,
    shininess: 65,
  });
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x15181c });
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x111316 });
  const hubMat = new THREE.MeshPhongMaterial({ color: 0xd8dee9, shininess: 90 });
  const fenderMat = new THREE.MeshPhongMaterial({
    color: variant === 'fatMan' ? 0x00e5ff : 0xffca28,
    shininess: 70,
  });
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xe8ffff });
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });

  // Thick central tire with spinning hub/spokes
  const wheel = new THREE.Group();
  wheel.position.set(0, WHEEL_RADIUS, 0);

  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.19, 14),
    tireMat
  );
  tire.rotation.z = Math.PI * 0.5;
  tire.castShadow = true;

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 10), hubMat);
  hub.rotation.z = Math.PI * 0.5;

  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.035, 0.24), fenderMat);
  wheel.add(tire, hub, spoke);
  boardTilt.add(wheel);

  // Curved fender arch over the central tire
  const fender = new THREE.Mesh(
    new THREE.CylinderGeometry(0.205, 0.205, 0.215, 12, 1, true, 0.18, Math.PI - 0.36),
    fenderMat
  );
  fender.rotation.z = Math.PI * 0.5;
  fender.position.set(0, WHEEL_RADIUS, 0);
  fender.material.side = THREE.DoubleSide;
  boardTilt.add(fender);

  // Left & right structural rails
  const railGeo = new THREE.BoxGeometry(0.04, 0.055, 0.84);
  for (const sx of [-0.135, 0.135]) {
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(sx, WHEEL_RADIUS + 0.02, 0);
    boardTilt.add(rail);
  }

  // Front & rear footpads
  const padGeo = new THREE.BoxGeometry(0.25, 0.03, 0.27);
  const frontPad = new THREE.Mesh(padGeo, gripMat);
  frontPad.position.set(0, WHEEL_RADIUS + 0.055, 0.27);
  const rearPad = new THREE.Mesh(padGeo, gripMat);
  rearPad.position.set(0, WHEEL_RADIUS + 0.055, -0.27);
  boardTilt.add(frontPad, rearPad);

  // LED headlight & taillight strips
  const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.03), headlightMat);
  headlight.position.set(0, WHEEL_RADIUS + 0.02, 0.425);
  const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.03), taillightMat);
  taillight.position.set(0, WHEEL_RADIUS + 0.02, -0.425);
  boardTilt.add(headlight, taillight);

  // --- Rider character standing on the footpads ---
  const riderRoot = new THREE.Group();
  riderRoot.position.set(0, WHEEL_RADIUS + 0.07, 0);
  riderRoot.rotation.x = 0.07; // slight lean forward into cruise direction
  boardTilt.add(riderRoot);

  const skinMat = new THREE.MeshPhongMaterial({
    color: variant === 'fatMan' ? 0xf2c29b : 0xf6cfb0,
    shininess: 20,
  });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
  const darkMat = new THREE.MeshPhongMaterial({ color: 0x161920, shininess: 85 });

  if (variant === 'fatMan') {
    const shirtMat = new THREE.MeshPhongMaterial({ color: 0xff7043, shininess: 22 });
    const shortsMat = new THREE.MeshPhongMaterial({ color: 0x455a64, shininess: 16 });
    const capMat = new THREE.MeshPhongMaterial({ color: 0x0288d1, shininess: 30 });
    const hairMat = new THREE.MeshPhongMaterial({ color: 0x3e2723, shininess: 20 });

    // Sturdy legs planted on front & rear footpads
    const legGeo = new THREE.CylinderGeometry(0.125, 0.105, 0.72, 8);
    const shoeGeo = new THREE.BoxGeometry(0.24, 0.11, 0.15);
    for (const sz of [0.24, -0.24]) {
      const leg = new THREE.Mesh(legGeo, shortsMat);
      leg.position.set(0, 0.39, sz);
      leg.rotation.x = sz > 0 ? -0.14 : 0.14;
      leg.castShadow = true;
      const shoe = new THREE.Mesh(shoeGeo, shoeMat);
      shoe.position.set(0.03, 0.055, sz);
      riderRoot.add(leg, shoe);
    }

    // Sideways-angled heavy body
    const upper = new THREE.Group();
    upper.position.set(0, 0.76, 0);
    upper.rotation.y = 0.72;
    riderRoot.add(upper);

    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.24, 0.38), shortsMat);
    hips.position.set(0, 0.08, 0);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.62, 10), shirtMat);
    torso.scale.set(1.08, 1.0, 0.92);
    torso.position.set(0, 0.44, 0);
    torso.castShadow = true;

    // Prominent round belly protruding forward
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), shirtMat);
    belly.scale.set(1.06, 0.92, 1.15);
    belly.position.set(0, 0.34, 0.19);
    belly.castShadow = true;

    // Thick arms stretched slightly out for balance
    const armGeo = new THREE.CylinderGeometry(0.095, 0.08, 0.54, 8);
    const handGeo = new THREE.SphereGeometry(0.075, 8, 8);
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.39, 0.64, 0);
      arm.rotation.z = side * 0.55;
      const armMesh = new THREE.Mesh(armGeo, shirtMat);
      armMesh.position.y = -0.24;
      const hand = new THREE.Mesh(handGeo, skinMat);
      hand.position.y = -0.52;
      arm.add(armMesh, hand);
      upper.add(arm);
    }

    // Head looking forward along +Z with cap & shades
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.9, 0);
    headGroup.rotation.y = -0.6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skinMat);
    head.scale.set(1.04, 1.02, 1.0);
    head.castShadow = true;
    const beard = new THREE.Mesh(
      new THREE.SphereGeometry(0.185, 10, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45),
      hairMat
    );
    beard.position.set(0, -0.02, 0.04);
    const shades = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.08), darkMat);
    shades.position.set(0, 0.03, 0.16);
    const capCrown = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      capMat
    );
    capCrown.position.set(0, 0.05, 0);
    const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.18), capMat);
    capVisor.position.set(0, 0.08, 0.18);
    headGroup.add(head, beard, shades, capCrown, capVisor);

    upper.add(hips, torso, belly, headGroup);
  } else {
    // 'pregnantWoman'
    const dressMat = new THREE.MeshPhongMaterial({ color: 0xec407a, shininess: 26 });
    const leggingsMat = new THREE.MeshPhongMaterial({ color: 0x263238, shininess: 18 });
    const hairMat = new THREE.MeshPhongMaterial({ color: 0x5d4037, shininess: 30 });

    // Legs in OneWheel stance
    const legGeo = new THREE.CylinderGeometry(0.088, 0.07, 0.72, 8);
    const shoeGeo = new THREE.BoxGeometry(0.21, 0.095, 0.13);
    for (const sz of [0.24, -0.24]) {
      const leg = new THREE.Mesh(legGeo, leggingsMat);
      leg.position.set(0, 0.39, sz);
      leg.rotation.x = sz > 0 ? -0.14 : 0.14;
      leg.castShadow = true;
      const shoe = new THREE.Mesh(shoeGeo, shoeMat);
      shoe.position.set(0.02, 0.048, sz);
      riderRoot.add(leg, shoe);
    }

    // Sideways-angled maternity dress body
    const upper = new THREE.Group();
    upper.position.set(0, 0.72, 0);
    upper.rotation.y = 0.62;
    riderRoot.add(upper);

    // Flared maternity skirt & upper bodice
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.33, 0.42, 10), dressMat);
    skirt.position.set(0, 0.06, 0);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.48, 10), dressMat);
    torso.scale.set(1.0, 1.0, 0.8);
    torso.position.set(0, 0.46, 0);
    torso.castShadow = true;

    // Clearly sculpted round pregnant belly bump
    const pregnantBelly = new THREE.Mesh(new THREE.SphereGeometry(0.255, 12, 10), dressMat);
    pregnantBelly.scale.set(0.95, 0.98, 1.08);
    pregnantBelly.position.set(0, 0.31, 0.21);
    pregnantBelly.castShadow = true;

    // Slender balancing arms
    const armGeo = new THREE.CylinderGeometry(0.062, 0.05, 0.5, 8);
    const handGeo = new THREE.SphereGeometry(0.058, 8, 8);
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.26, 0.64, 0);
      arm.rotation.z = side * 0.6;
      const armMesh = new THREE.Mesh(armGeo, skinMat);
      armMesh.position.y = -0.23;
      const hand = new THREE.Mesh(handGeo, skinMat);
      hand.position.y = -0.49;
      arm.add(armMesh, hand);
      upper.add(arm);
    }

    // Head looking forward with long flowing hair
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.86, 0);
    headGroup.rotation.y = -0.52;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 10), skinMat);
    head.scale.set(0.92, 1.06, 0.96);
    head.castShadow = true;
    const hairTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.178, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      hairMat
    );
    hairTop.position.set(0, 0.02, -0.01);
    const longHair = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, 0.14), hairMat);
    longHair.position.set(0, -0.14, -0.13);
    headGroup.add(head, hairTop, longHair);

    upper.add(skirt, torso, pregnantBelly, headGroup);
  }

  // --- Subtle golden/cyan bonus target marker (ground ring + floating downward arrow) ---
  const markerRing = new THREE.Group();
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(1.12, 1.46, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffd54f,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    })
  );
  outerRing.rotation.x = -Math.PI * 0.5;
  outerRing.position.y = 0.12;

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.84, 1.0, 24),
    new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    })
  );
  innerRing.rotation.x = -Math.PI * 0.5;
  innerRing.position.y = 0.13;
  markerRing.add(outerRing, innerRing);
  root.add(markerRing);

  const markerArrow = new THREE.Group();
  markerArrow.position.set(0, 2.75, 0);
  const arrowGoldMat = new THREE.MeshBasicMaterial({ color: 0xffd54f });
  const arrowCyanMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
  });
  const arrowShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.38, 8), arrowGoldMat);
  arrowShaft.position.y = 0.22;
  const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.36, 8), arrowGoldMat);
  arrowHead.rotation.x = Math.PI; // point downward toward rider
  arrowHead.position.y = -0.1;
  const arrowHalo = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.38, 18), arrowCyanMat);
  arrowHalo.rotation.x = -Math.PI * 0.5;
  arrowHalo.position.y = 0.1;
  markerArrow.add(arrowShaft, arrowHead, arrowHalo);
  root.add(markerArrow);

  return { root, boardTilt, wheel, markerArrow, markerRing };
}

/**
 * Manages periodic special OneWheel bonus riders (+10s time bonus on collision).
 * Spawns one rider every `BALANCE.oneWheelSpawnIntervalSec` (180s) of active driving.
 */
export class OneWheelManager {
  public readonly group = new THREE.Group();
  private readonly riders: OneWheelRiderEntity[] = [];
  private elapsedSec = 0;
  private nextSpawnSec = BALANCE.oneWheelSpawnIntervalSec;
  private nextId = 1;

  constructor(private readonly map: MapDefinition) {}

  reset(): void {
    this.elapsedSec = 0;
    this.nextSpawnSec = BALANCE.oneWheelSpawnIntervalSec;
    for (const r of this.riders) {
      this.group.remove(r.visual.root);
    }
    this.riders.length = 0;
  }

  getElapsedSec(): number {
    return this.elapsedSec;
  }

  getActiveRiders(): OneWheelRiderSnapshot[] {
    return this.riders.map((r) => ({
      id: r.id,
      variant: r.variant,
      x: r.x,
      y: r.y,
      z: r.z,
      vx: r.dirX * r.speed,
      vz: r.dirZ * r.speed,
      speed: r.speed,
      age: r.age,
    }));
  }

  update(
    dt: number,
    player: ArcadeVehicle,
    rng: Rng,
    timeSec: number,
    allowSpecialSpawn = true
  ): OneWheelHitEvent[] {
    const hits: OneWheelHitEvent[] = [];
    const px = player.currPosition.x;
    const py = player.currPosition.y;
    const pz = player.currPosition.z;
    const fwdX = player.forwardDir.x;
    const fwdZ = player.forwardDir.z;

    // 1. Update existing riders & check player collision / despawn
    for (let i = this.riders.length - 1; i >= 0; i--) {
      const r = this.riders[i];
      r.age += dt;

      this.advanceRider(r, dt, rng);
      r.y = this.map.heightMap.sample(r.x, r.z);

      const dist = Math.hypot(r.x - px, r.z - pz);

      if (!player.isGhost && dist < HIT_RADIUS && Math.abs(py - r.y) < HIT_MAX_DY) {
        hits.push({
          x: r.x,
          y: r.y,
          z: r.z,
          bonusTimeSeconds: BALANCE.oneWheelTimeBonus,
          oneWheelVariant: r.variant,
        });
        this.group.remove(r.visual.root);
        this.riders.splice(i, 1);
        continue;
      }

      if (dist > BALANCE.oneWheelDespawnRadius || r.age >= BALANCE.oneWheelLifetimeSec) {
        this.group.remove(r.visual.root);
        this.riders.splice(i, 1);
        continue;
      }

      this.syncRiderVisual(r, dt, timeSec);
    }

    // 2. Advance active gameplay timer and spawn every 180s (3 minutes)
    if (allowSpecialSpawn && dt > 0) {
      this.elapsedSec += dt;
      while (this.elapsedSec >= this.nextSpawnSec) {
        this.nextSpawnSec += BALANCE.oneWheelSpawnIntervalSec;
        this.spawnNearPlayer(px, pz, fwdX, fwdZ, rng, timeSec);
      }
    }

    return hits;
  }

  private advanceRider(r: OneWheelRiderEntity, dt: number, rng: Rng): void {
    const step = r.speed * dt;

    if (r.edgeId && r.fromNodeId && r.toNodeId) {
      r.edgeProgress += step;

      if (r.edgeProgress >= r.edgeLength) {
        const overflow = r.edgeProgress - r.edgeLength;
        const arrivedNodeId = r.toNodeId;
        const prevNodeId = r.fromNodeId;
        const nextChoice = this.pickNextEdge(arrivedNodeId, prevNodeId, rng);

        if (nextChoice) {
          r.edgeId = nextChoice.edge.id;
          r.fromNodeId = arrivedNodeId;
          r.toNodeId = nextChoice.to;
          const a = this.map.graph.getNode(arrivedNodeId)!;
          const b = this.map.graph.getNode(nextChoice.to)!;
          r.edgeLength = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
          r.edgeProgress = Math.min(r.edgeLength * 0.5, overflow);
          r.dirX = (b.x - a.x) / r.edgeLength;
          r.dirZ = (b.z - a.z) / r.edgeLength;
          r.lateralOffset = nextChoice.edge.width * 0.5 + 0.6;
        } else {
          // Reverse along same edge, keeping the same sidewalk side
          r.fromNodeId = arrivedNodeId;
          r.toNodeId = prevNodeId;
          r.edgeProgress = Math.min(r.edgeLength * 0.5, overflow);
          r.dirX = -r.dirX;
          r.dirZ = -r.dirZ;
          r.lateralOffset = -r.lateralOffset;
        }
      }

      const a = this.map.graph.getNode(r.fromNodeId);
      const b = this.map.graph.getNode(r.toNodeId);
      if (a && b) {
        const t = Math.max(0, Math.min(1, r.edgeProgress / Math.max(1, r.edgeLength)));
        const rightX = -r.dirZ;
        const rightZ = r.dirX;
        r.x = a.x + (b.x - a.x) * t + rightX * r.lateralOffset;
        r.z = a.z + (b.z - a.z) * t + rightZ * r.lateralOffset;
        return;
      }
    }

    // Fallback free-cruise along direction
    r.x += r.dirX * step;
    r.z += r.dirZ * step;
  }

  private pickNextEdge(
    nodeId: string,
    prevNodeId: string,
    rng: Rng
  ): { to: string; edge: RoadEdge } | null {
    const adj = this.map.graph.adjacency.get(nodeId);
    if (!adj || adj.length === 0) return null;

    const forwardNonHighway = adj.filter(
      (c) => c.to !== prevNodeId && c.edge.roadType !== 'highway' && !c.edge.blocked
    );
    if (forwardNonHighway.length > 0) {
      return rng.pick(forwardNonHighway);
    }

    const forwardAny = adj.filter((c) => c.to !== prevNodeId && !c.edge.blocked);
    if (forwardAny.length > 0) {
      return rng.pick(forwardAny);
    }

    return null;
  }

  private spawnNearPlayer(
    px: number,
    pz: number,
    fwdX: number,
    fwdZ: number,
    rng: Rng,
    timeSec: number
  ): void {
    // Keep active pool bounded
    while (this.riders.length >= MAX_ACTIVE_RIDERS) {
      const oldest = this.riders.shift()!;
      this.group.remove(oldest.visual.root);
    }

    const variant = pickOneWheelVariant(rng);
    const speed = rng.range(4.5, 5.5);

    const fwdLen = Math.hypot(fwdX, fwdZ);
    const nfX = fwdLen > 0.001 ? fwdX / fwdLen : 0;
    const nfZ = fwdLen > 0.001 ? fwdZ / fwdLen : 1;

    const placement = this.pickSpawnPlacement(px, pz, nfX, nfZ, rng);
    const y = this.map.heightMap.sample(placement.x, placement.z);

    const visual = buildOneWheelRiderMesh(variant);
    const entity: OneWheelRiderEntity = {
      id: this.nextId++,
      variant,
      x: placement.x,
      y,
      z: placement.z,
      dirX: placement.dirX,
      dirZ: placement.dirZ,
      speed,
      age: 0,
      phase: rng.range(0, Math.PI * 2),
      edgeId: placement.edgeId,
      fromNodeId: placement.fromNodeId,
      toNodeId: placement.toNodeId,
      edgeProgress: placement.edgeProgress,
      edgeLength: placement.edgeLength,
      lateralOffset: placement.lateralOffset,
      visual,
    };

    this.syncRiderVisual(entity, 0, timeSec);
    this.group.add(visual.root);
    this.riders.push(entity);
  }

  private pickSpawnPlacement(
    px: number,
    pz: number,
    fwdX: number,
    fwdZ: number,
    rng: Rng
  ): {
    x: number;
    z: number;
    dirX: number;
    dirZ: number;
    edgeId: string | null;
    fromNodeId: string | null;
    toNodeId: string | null;
    edgeProgress: number;
    edgeLength: number;
    lateralOffset: number;
  } {
    const aheadSpots: SidewalkSpot[] = [];
    const nearbySpots: SidewalkSpot[] = [];

    for (let i = 0; i < this.map.sidewalkSpots.length; i++) {
      const s = this.map.sidewalkSpots[i];
      const dx = s.x - px;
      const dz = s.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist < SPAWN_DIST_MIN || dist > SPAWN_DIST_MAX) continue;
      nearbySpots.push(s);
      const dot = (dx * fwdX + dz * fwdZ) / Math.max(0.1, dist);
      if (dot > 0.15) {
        aheadSpots.push(s);
      }
    }

    const chosenSpot =
      aheadSpots.length > 0
        ? rng.pick(aheadSpots)
        : nearbySpots.length > 0
          ? rng.pick(nearbySpots)
          : null;

    if (chosenSpot) {
      const edge = this.map.graph.edgeMap.get(chosenSpot.edgeId);
      if (edge) {
        const placement = this.placementOnEdge(edge, chosenSpot.x, chosenSpot.z, rng);
        if (placement) {
          const d = Math.hypot(placement.x - px, placement.z - pz);
          if (d >= SPAWN_DIST_MIN - 2 && d <= SPAWN_DIST_MAX + 2) {
            return placement;
          }
        }
      }
    }

    // Secondary attempt: project ahead of player onto nearest road edge
    const probeDist = rng.range(45, 70);
    const probeX = px + fwdX * probeDist;
    const probeZ = pz + fwdZ * probeDist;
    const proj = this.map.graph.projectPoint(probeX, probeZ, fwdX, fwdZ, 80);
    if (proj) {
      const placement = this.placementOnEdge(proj.edge, proj.closestX, proj.closestZ, rng);
      if (placement) {
        const d = Math.hypot(placement.x - px, placement.z - pz);
        if (d >= SPAWN_DIST_MIN && d <= SPAWN_DIST_MAX) {
          return placement;
        }
      }
    }

    // Final fallback: cruise directly ahead-right of player
    const rightX = -fwdZ;
    const rightZ = fwdX;
    const dist = rng.range(42, 72);
    const side = rng.chance(0.5) ? 1 : -1;
    const lat = rng.range(3.5, 6.5) * side;
    return {
      x: px + fwdX * dist + rightX * lat,
      z: pz + fwdZ * dist + rightZ * lat,
      dirX: fwdX,
      dirZ: fwdZ,
      edgeId: null,
      fromNodeId: null,
      toNodeId: null,
      edgeProgress: 0,
      edgeLength: 0,
      lateralOffset: 0,
    };
  }

  private placementOnEdge(
    edge: RoadEdge,
    refX: number,
    refZ: number,
    rng: Rng
  ): {
    x: number;
    z: number;
    dirX: number;
    dirZ: number;
    edgeId: string;
    fromNodeId: string;
    toNodeId: string;
    edgeProgress: number;
    edgeLength: number;
    lateralOffset: number;
  } | null {
    const nA = this.map.graph.getNode(edge.from);
    const nB = this.map.graph.getNode(edge.to);
    if (!nA || !nB) return null;

    const forward = edge.isOneWay ? true : rng.chance(0.5);
    const fromNode = forward ? nA : nB;
    const toNode = forward ? nB : nA;

    const ex = toNode.x - fromNode.x;
    const ez = toNode.z - fromNode.z;
    const edgeLength = Math.max(1, Math.hypot(ex, ez));
    const dirX = ex / edgeLength;
    const dirZ = ez / edgeLength;

    const rawProgress = (refX - fromNode.x) * dirX + (refZ - fromNode.z) * dirZ;
    const edgeProgress = Math.max(0, Math.min(edgeLength, rawProgress));
    const rightX = -dirZ;
    const rightZ = dirX;
    const refLat = (refX - fromNode.x) * rightX + (refZ - fromNode.z) * rightZ;
    const sideSign = refLat < 0 ? -1 : 1;
    const lateralOffset = (edge.width * 0.5 + 0.6) * sideSign;

    return {
      x: fromNode.x + dirX * edgeProgress + rightX * lateralOffset,
      z: fromNode.z + dirZ * edgeProgress + rightZ * lateralOffset,
      dirX,
      dirZ,
      edgeId: edge.id,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      edgeProgress,
      edgeLength,
      lateralOffset,
    };
  }

  private syncRiderVisual(r: OneWheelRiderEntity, dt: number, timeSec: number): void {
    const yaw = Math.atan2(r.dirX, r.dirZ);
    r.visual.root.position.set(r.x, r.y, r.z);
    r.visual.root.rotation.y = yaw;

    // Spin central OneWheel tire & gently carve side-to-side
    r.visual.wheel.rotation.x += (r.speed * dt) / WHEEL_RADIUS;
    r.visual.boardTilt.rotation.z = Math.sin(timeSec * 3.4 + r.phase) * 0.065;

    // Animate golden/cyan floating arrow and ground ring
    r.visual.markerArrow.position.y = 2.75 + Math.sin(timeSec * 5.2 + r.phase) * 0.18;
    r.visual.markerArrow.rotation.y = timeSec * 2.2;
    const pulse = 1 + Math.sin(timeSec * 4.8 + r.phase) * 0.08;
    r.visual.markerRing.scale.set(pulse, 1, pulse);
  }
}
