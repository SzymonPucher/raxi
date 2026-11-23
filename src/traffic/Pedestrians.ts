import * as THREE from 'three';
import { BALANCE } from '../core/config/balance';
import { Rng } from '../core/Rng';
import { WaitingPassenger } from '../gameplay/PassengerSpawner';
import { PassengerTypeId, getTripColorHex } from '../gameplay/Passenger';
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
  chainTimer: number;
  respawnTimer: number;
  shirtColor: THREE.Color;
  pantsColor: THREE.Color;
  skinColor: THREE.Color;
  hairColor: THREE.Color;
  heightScale: number;
  walkPhase: number;
}

export interface PedImpactResult {
  explosions: Array<{ x: number; y: number; z: number; isChain: boolean; wasPassenger: boolean; passengerId?: string }>;
  scares: number[];
}

/**
 * Builds a detailed GTA-SA-style articulated waiting passenger character tailored by archetype.
 */
function buildWaitingPassengerCharacter(typeId: PassengerTypeId, shirtColorHex: number): {
  root: THREE.Group;
  waveArm: THREE.Group;
} {
  const root = new THREE.Group();

  const skinHex = typeId === 'grandma' ? 0xf5d0b5 : 0xeec19a;
  const pantsHex =
    typeId === 'businessman' || typeId === 'lateGroom'
      ? 0x1b2028
      : typeId === 'grandma'
        ? 0x6a4c7a
        : typeId === 'tourist'
          ? 0xc8ad7f
          : 0x2a3b52;
  const hairHex =
    typeId === 'grandma'
      ? 0xe8ecf0
      : typeId === 'celebrity'
        ? 0xffd54f
        : typeId === 'thrillSeeker'
          ? 0xff3d00
          : 0x2c2018;

  const shirtMat = new THREE.MeshPhongMaterial({ color: shirtColorHex, shininess: 25 });
  const pantsMat = new THREE.MeshPhongMaterial({ color: pantsHex, shininess: 15 });
  const skinMat = new THREE.MeshPhongMaterial({ color: skinHex, shininess: 20 });
  const hairMat = new THREE.MeshPhongMaterial({ color: hairHex, shininess: 25 });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
  const darkMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 80 });

  // Legs + shoes
  const legGeo = new THREE.CylinderGeometry(0.105, 0.085, 0.78, 8);
  const shoeGeo = new THREE.BoxGeometry(0.14, 0.1, 0.25);
  for (const sx of [-0.12, 0.12]) {
    const leg = new THREE.Mesh(legGeo, pantsMat);
    leg.position.set(sx, 0.42, 0);
    leg.castShadow = true;
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(sx, 0.05, 0.04);
    root.add(leg, shoe);
  }

  // Pelvis & sculpted torso (wider shoulders, tapered waist)
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.22), pantsMat);
  pelvis.position.set(0, 0.84, 0);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.56, 8), shirtMat);
  torso.scale.set(1.05, 1, 0.68);
  torso.position.set(0, 1.18, 0);
  torso.castShadow = true;
  root.add(pelvis, torso);

  // Left arm (resting / holding briefcase for businessman)
  const armGeo = new THREE.CylinderGeometry(0.075, 0.06, 0.52, 8);
  armGeo.translate(0, -0.22, 0);
  const handGeo = new THREE.SphereGeometry(0.065, 8, 8);
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.27, 1.38, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, shirtMat);
  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.position.y = -0.5;
  leftArm.add(leftArmMesh, leftHand);
  if (typeId === 'businessman') {
    const briefcase = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.3, 0.4),
      new THREE.MeshPhongMaterial({ color: 0x4e342e, shininess: 40 })
    );
    briefcase.position.set(-0.04, -0.62, 0);
    leftArm.add(briefcase);
  }
  root.add(leftArm);

  // Right arm (animated waving to hail the taxi!)
  const waveArm = new THREE.Group();
  waveArm.position.set(0.27, 1.38, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, shirtMat);
  const rightHand = new THREE.Mesh(handGeo, skinMat);
  rightHand.position.y = -0.5;
  waveArm.add(rightArmMesh, rightHand);
  root.add(waveArm);

  // Neck + sculpted head + face/sunglasses + archetype headwear
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 8), skinMat);
  neck.position.set(0, 1.5, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skinMat);
  head.scale.set(0.92, 1.08, 0.96);
  head.position.set(0, 1.66, 0);
  head.castShadow = true;

  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
  hair.position.set(0, 1.68, -0.01);
  root.add(neck, head, hair);

  if (typeId === 'grandma') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), hairMat);
    bun.position.set(0, 1.78, -0.14);
    root.add(bun);
  } else if (typeId === 'tourist') {
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.04, 12), new THREE.MeshLambertMaterial({ color: 0xf4d06f }));
    hatBrim.position.set(0, 1.78, 0);
    const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0xf4d06f }));
    hatCrown.position.set(0, 1.85, 0);
    const camera = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.1), darkMat);
    camera.position.set(0, 1.24, 0.19);
    root.add(hatBrim, hatCrown, camera);
  } else if (typeId === 'celebrity' || typeId === 'thrillSeeker') {
    const shades = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.08), darkMat);
    shades.position.set(0, 1.67, 0.14);
    root.add(shades);
  } else if (typeId === 'lateGroom') {
    const bowTie = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.05), darkMat);
    bowTie.position.set(0, 1.44, 0.17);
    root.add(bowTie);
  }

  return { root, waveArm };
}

/**
 * GTA San Andreas–style articulated instanced pedestrians (§7.2):
 * - 9 instanced body parts (torso, hips, head, hair, visor/shades, 2 animated legs, 2 animated arms)
 * - Smooth walking stride + arm counter-swing + dynamic dive-away roll
 * - Cartoon explosion on overlap + 0.3s chain reaction within 3m
 * - Detailed waiting passenger figures waving to hail the cab + destination beams
 */
export class PedestriansManager {
  public readonly group = new THREE.Group();
  private readonly peds: Pedestrian[] = [];

  private readonly torsoInst: THREE.InstancedMesh;
  private readonly hipsInst: THREE.InstancedMesh;
  private readonly headInst: THREE.InstancedMesh;
  private readonly hairInst: THREE.InstancedMesh;
  private readonly shadesInst: THREE.InstancedMesh;
  private readonly leftLegInst: THREE.InstancedMesh;
  private readonly rightLegInst: THREE.InstancedMesh;
  private readonly leftArmInst: THREE.InstancedMesh;
  private readonly rightArmInst: THREE.InstancedMesh;

  private readonly rootObj = new THREE.Object3D();
  private readonly partObj = new THREE.Object3D();
  private readonly composedMat = new THREE.Matrix4();
  private readonly zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

  private readonly passengerVisuals = new Map<
    string,
    { group: THREE.Group; ring: THREE.Mesh; beacon: THREE.Mesh; waveArm: THREE.Group }
  >();
  private readonly destBeams: THREE.Group[] = [];

  constructor(private readonly map: MapDefinition) {
    const count = BALANCE.pedMaxCount;

    // Sculpted human proportions (GTA SA silhouette)
    const torsoGeo = new THREE.CylinderGeometry(0.22, 0.17, 0.54, 8);
    torsoGeo.scale(1.06, 1, 0.68);
    const hipsGeo = new THREE.BoxGeometry(0.34, 0.18, 0.21);
    const headGeo = new THREE.SphereGeometry(0.16, 10, 8);
    headGeo.scale(0.92, 1.08, 0.96);
    const hairGeo = new THREE.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58);
    const shadesGeo = new THREE.BoxGeometry(0.21, 0.055, 0.06);

    // Limb geometries pivoted at top joint (hip / shoulder) so rotation swings naturally!
    const legGeo = new THREE.CylinderGeometry(0.095, 0.072, 0.76, 8);
    legGeo.translate(0, -0.38, 0);
    const armGeo = new THREE.CylinderGeometry(0.068, 0.052, 0.52, 8);
    armGeo.translate(0, -0.25, 0);

    const clothMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 22 });
    const skinMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 20 });
    const hairMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 30 });
    const shadesMat = new THREE.MeshPhongMaterial({ color: 0x161920, shininess: 90 });

    const makeInst = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      return m;
    };

    this.torsoInst = makeInst(torsoGeo, clothMat);
    this.hipsInst = makeInst(hipsGeo, clothMat);
    this.headInst = makeInst(headGeo, skinMat);
    this.hairInst = makeInst(hairGeo, hairMat);
    this.shadesInst = makeInst(shadesGeo, shadesMat);
    this.leftLegInst = makeInst(legGeo, clothMat);
    this.rightLegInst = makeInst(legGeo, clothMat);
    this.leftArmInst = makeInst(armGeo, clothMat);
    this.rightArmInst = makeInst(armGeo, clothMat);

    this.torsoInst.castShadow = true;

    const shirtPalette = [0xc62828, 0x1565c0, 0x2e7d32, 0xf9a825, 0x6a1b9a, 0x00838f, 0xe64a19, 0xad1457, 0xeceff1, 0x37474f];
    const pantsPalette = [0x1f2d3d, 0x263238, 0x3e2723, 0x455a64, 0x2c3e50, 0x5d4037];
    const skinPalette = [0xf5cfa9, 0xe5b887, 0xc68642, 0x8d5524, 0xf2c9a0];
    const hairPalette = [0x1c1410, 0x4a2f1d, 0x8d5b2d, 0xd4a942, 0x9e9e9e, 0x2c1b18];

    for (let i = 0; i < count; i++) {
      const ped: Pedestrian = {
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
        pantsColor: new THREE.Color(pantsPalette[(i * 3) % pantsPalette.length]),
        skinColor: new THREE.Color(skinPalette[(i * 7) % skinPalette.length]),
        hairColor: new THREE.Color(hairPalette[(i * 5) % hairPalette.length]),
        heightScale: 0.94 + (i % 5) * 0.035,
        walkPhase: i * 0.9,
      };
      this.peds.push(ped);
      this.hidePedInstance(i);
      this.torsoInst.setColorAt(i, ped.shirtColor);
      this.leftArmInst.setColorAt(i, ped.shirtColor);
      this.rightArmInst.setColorAt(i, ped.shirtColor);
      this.hipsInst.setColorAt(i, ped.pantsColor);
      this.leftLegInst.setColorAt(i, ped.pantsColor);
      this.rightLegInst.setColorAt(i, ped.pantsColor);
      this.headInst.setColorAt(i, ped.skinColor);
      this.hairInst.setColorAt(i, ped.hairColor);
    }

    this.group.add(
      this.torsoInst,
      this.hipsInst,
      this.headInst,
      this.hairInst,
      this.shadesInst,
      this.leftLegInst,
      this.rightLegInst,
      this.leftArmInst,
      this.rightArmInst
    );

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

  private hidePedInstance(i: number): void {
    this.torsoInst.setMatrixAt(i, this.zeroMat);
    this.hipsInst.setMatrixAt(i, this.zeroMat);
    this.headInst.setMatrixAt(i, this.zeroMat);
    this.hairInst.setMatrixAt(i, this.zeroMat);
    this.shadesInst.setMatrixAt(i, this.zeroMat);
    this.leftLegInst.setMatrixAt(i, this.zeroMat);
    this.rightLegInst.setMatrixAt(i, this.zeroMat);
    this.leftArmInst.setMatrixAt(i, this.zeroMat);
    this.rightArmInst.setMatrixAt(i, this.zeroMat);
  }

  private updatePedInstance(i: number, p: Pedestrian): void {
    const yaw = p.diving ? Math.atan2(p.vx, p.vz) : Math.atan2(p.walkDirX, p.walkDirZ);
    const swing = p.diving ? 0.95 : Math.sin(p.walkPhase) * 0.55;
    const bob = p.diving ? 0.35 : Math.abs(Math.sin(p.walkPhase)) * 0.05;

    this.rootObj.position.set(p.x, p.y + bob, p.z);
    this.rootObj.rotation.set(p.diving ? 1.15 : 0, yaw, 0);
    this.rootObj.scale.setScalar(p.heightScale);
    this.rootObj.updateMatrix();
    const rootM = this.rootObj.matrix;

    const place = (
      inst: THREE.InstancedMesh,
      px: number,
      py: number,
      pz: number,
      rx = 0,
      rz = 0
    ) => {
      this.partObj.position.set(px, py, pz);
      this.partObj.rotation.set(rx, 0, rz);
      this.partObj.scale.setScalar(1);
      this.partObj.updateMatrix();
      this.composedMat.multiplyMatrices(rootM, this.partObj.matrix);
      inst.setMatrixAt(i, this.composedMat);
    };

    place(this.hipsInst, 0, 0.8, 0);
    place(this.torsoInst, 0, 1.14, 0);
    place(this.headInst, 0, 1.59, 0);
    place(this.hairInst, 0, 1.62, -0.01);
    place(this.shadesInst, 0, 1.6, 0.13);

    // Opposite-phase walking stride for legs and arms
    place(this.leftLegInst, -0.11, 0.78, 0, swing, 0);
    place(this.rightLegInst, 0.11, 0.78, 0, -swing, 0);
    place(this.leftArmInst, -0.25, 1.35, 0, p.diving ? -2.2 : -swing * 0.85, 0.08);
    place(this.rightArmInst, 0.25, 1.35, 0, p.diving ? -2.2 : swing * 0.85, -0.08);
  }

  private markAllDirty(): void {
    this.torsoInst.instanceMatrix.needsUpdate = true;
    this.hipsInst.instanceMatrix.needsUpdate = true;
    this.headInst.instanceMatrix.needsUpdate = true;
    this.hairInst.instanceMatrix.needsUpdate = true;
    this.shadesInst.instanceMatrix.needsUpdate = true;
    this.leftLegInst.instanceMatrix.needsUpdate = true;
    this.rightLegInst.instanceMatrix.needsUpdate = true;
    this.leftArmInst.instanceMatrix.needsUpdate = true;
    this.rightArmInst.instanceMatrix.needsUpdate = true;
  }

  reset(): void {
    for (let i = 0; i < this.peds.length; i++) {
      this.peds[i].active = false;
      this.peds[i].chainTimer = 0;
      this.peds[i].respawnTimer = 0;
      this.hidePedInstance(i);
    }
    this.markAllDirty();
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
        this.hidePedInstance(i);
        continue;
      }

      if (p.scareCooldown > 0) p.scareCooldown -= dt;

      if (p.chainTimer > 0) {
        p.chainTimer -= dt;
        if (p.chainTimer <= 0) {
          p.active = false;
          p.respawnTimer = BALANCE.pedRespawnDelay;
          out.explosions.push({ x: p.x, y: p.y, z: p.z, isChain: true, wasPassenger: false });
          triggerChainAround(p.x, p.z);
          this.hidePedInstance(i);
          continue;
        }
      }

      const dx = p.x - px;
      const dz = p.z - pz;
      const dist = Math.hypot(dx, dz);

      if (dist > BALANCE.pedDespawnRadius) {
        p.active = false;
        p.respawnTimer = 0.5;
        this.hidePedInstance(i);
        continue;
      }

      // Dive-away AI
      if (!p.diving && dist < BALANCE.pedDiveDetectRadius && pSpd > 8) {
        const dot = (dx * fwdX + dz * fwdZ) / Math.max(0.1, dist);
        if (dot > 0.45) {
          const cross = fwdX * dz - fwdZ * dx;
          const sideSign = cross >= 0 ? 1 : -1;
          p.diving = true;
          p.diveTimer = 0.65;
          p.vx = -fwdZ * sideSign * 5.2;
          p.vz = fwdX * sideSign * 5.2;
        }
      }

      if (p.diving) {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.diveTimer -= dt;
        if (p.diveTimer <= 0) p.diving = false;
      } else {
        p.x += p.walkDirX * p.walkSpeed * dt;
        p.z += p.walkDirZ * p.walkSpeed * dt;
        p.walkPhase += dt * p.walkSpeed * 4.2;
      }

      // Player overlap -> cartoon explosion!
      if (!player.isGhost && Math.abs(py - p.y) < 2.2) {
        if (dist < 1.85) {
          p.active = false;
          p.respawnTimer = BALANCE.pedRespawnDelay;
          out.explosions.push({ x: p.x, y: p.y, z: p.z, isChain: false, wasPassenger: false });
          triggerChainAround(p.x, p.z);
          this.hidePedInstance(i);
          continue;
        } else if (dist < 2.85 && pSpd > 9 && p.scareCooldown <= 0) {
          p.scareCooldown = 3.0;
          out.scares.push(dist - 1.85);
        }
      }

      this.updatePedInstance(i, p);
    }

    this.markAllDirty();

    // Waiting passenger direct impacts
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

    this.syncWaitingPassengerVisuals(waitingPassengers, timeSec, px, pz);

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

  private syncWaitingPassengerVisuals(
    waiting: WaitingPassenger[],
    timeSec: number,
    playerX: number,
    playerZ: number
  ): void {
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

        const char = buildWaitingPassengerCharacter(wp.type.id, wp.type.shirtColor);
        g.add(char.root);

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

        const beacon = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.85, 0),
          new THREE.MeshBasicMaterial({ color: colorHex })
        );
        beacon.position.y = 3.5;

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

        g.add(ring, beacon, pillar);
        g.position.set(wp.x, wp.y, wp.z);
        this.group.add(g);
        vis = { group: g, ring, beacon, waveArm: char.waveArm };
        this.passengerVisuals.set(wp.id, vis);
      }

      // Face toward the approaching taxi and enthusiastically wave their right arm!
      const charRoot = vis.group.children[0];
      charRoot.rotation.y = Math.atan2(playerX - wp.x, playerZ - wp.z);
      vis.waveArm.rotation.z = -2.4 + Math.sin(timeSec * 8.5) * 0.35;

      vis.beacon.position.y = 3.5 + Math.sin(timeSec * 4.5) * 0.45;
      vis.beacon.rotation.y = timeSec * 2.4;
      const pulse = 1 + Math.sin(timeSec * 5) * 0.05;
      vis.ring.scale.set(pulse, pulse, 1);
    }
  }
}
