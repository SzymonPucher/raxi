import * as THREE from 'three';
import { BALANCE } from '../core/config/balance';
import { Rng } from '../core/Rng';
import { WaitingPassenger } from '../gameplay/PassengerSpawner';
import { PassengerTypeId, getTripColorHex } from '../gameplay/Passenger';
import { ArcadeVehicle } from '../vehicle/ArcadeVehicle';
import { MapDefinition, SidewalkSpot } from '../world/mapData';
import { OneWheelManager, OneWheelRiderSnapshot, OneWheelVariant } from './OneWheelRider';

export type { OneWheelRiderSnapshot, OneWheelVariant };

interface Pedestrian {
  id: number;
  active: boolean;
  wasVisible: boolean;
  inHotspot: boolean;
  x: number;
  y: number;
  z: number;
  anchorX: number;
  anchorZ: number;
  patrolRadius: number;
  vx: number;
  vz: number;
  walkDirX: number;
  walkDirZ: number;
  walkSpeed: number;
  stopped: boolean;
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

interface PedHotspot {
  x: number;
  z: number;
  radius: number;
  densityWeight: number;
  spots: SidewalkSpot[];
}

export interface PedExplosionEvent {
  x: number;
  y: number;
  z: number;
  isChain: boolean;
  wasPassenger: boolean;
  passengerId?: string;
  bonusTimeSeconds?: number;
  oneWheelVariant?: OneWheelVariant;
}

export interface PedImpactResult {
  explosions: PedExplosionEvent[];
  scares: number[];
}

export interface PedestrianSnapshot {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  stopped: boolean;
  diving: boolean;
  diveTimer: number;
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
  private readonly hotspots: PedHotspot[] = [];
  private readonly hotspotSpots: SidewalkSpot[] = [];

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
  private readonly oneWheel: OneWheelManager;

  constructor(private readonly map: MapDefinition) {
    this.oneWheel = new OneWheelManager(map);
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
        wasVisible: false,
        inHotspot: false,
        x: 0,
        y: -100,
        z: 0,
        anchorX: 0,
        anchorZ: 0,
        patrolRadius: 18,
        vx: 0,
        vz: 0,
        walkDirX: 1,
        walkDirZ: 0,
        walkSpeed: 1.5,
        stopped: false,
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

    this.buildCrowdHotspots();

    this.group.add(
      this.torsoInst,
      this.hipsInst,
      this.headInst,
      this.hairInst,
      this.shadesInst,
      this.leftLegInst,
      this.rightLegInst,
      this.leftArmInst,
      this.rightArmInst,
      this.oneWheel.group
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

  /**
   * Builds concentrated pedestrian crowd hotspots around major squares (Rynek), stations,
   * shopping malls/centers, civic hubs, and parks so crowds gather densely in lively focal areas
   * while ordinary residential and outskirts streets stay sparse.
   */
  private buildCrowdHotspots(): void {
    const spots = this.map.sidewalkSpots;
    const majorStyles = new Set([
      'townhall',
      'train_station',
      'station',
      'mall',
      'retail_center',
      'tower',
      'basilika',
      'basilica',
      'stadium',
    ]);
    const secondaryStyles = new Set([
      'church',
      'hall',
      'campus',
      'cinema',
      'hospital',
      'bar',
      'block_estate',
      'beach',
    ]);

    for (const lm of this.map.landmarks) {
      const isMajor = majorStyles.has(lm.style);
      const isSecondary = secondaryStyles.has(lm.style);
      if (!isMajor && !isSecondary) continue;

      const radius = isMajor ? BALANCE.pedHotspotRadius : BALANCE.pedHotspotRadius * 0.75;
      const densityWeight = isMajor ? 1.0 : 0.65;
      const nearSpots = spots.filter(
        (s) =>
          s.landmarkId === lm.id ||
          Math.hypot(s.x - lm.curbX, s.z - lm.curbZ) <= radius * 0.68
      );
      if (nearSpots.length > 0) {
        this.hotspots.push({
          x: lm.curbX,
          z: lm.curbZ,
          radius,
          densityWeight,
          spots: nearSpots,
        });
      }
    }

    const seen = new Set<SidewalkSpot>();
    for (const hs of this.hotspots) {
      for (const s of hs.spots) {
        if (!seen.has(s)) {
          seen.add(s);
          this.hotspotSpots.push(s);
        }
      }
    }
  }

  /**
   * Computes how many pedestrians should be active around (px, pz):
   * - High (up to pedMaxCount) when inside or approaching a dense crowd hotspot
   * - Low (2..pedBaseSparseCount) on ordinary streets and outskirts so pedestrians aren't everywhere
   */
  private computeLocalTargetCount(px: number, pz: number): {
    targetCount: number;
    nearbyHotspots: PedHotspot[];
  } {
    const nearbyHotspots: PedHotspot[] = [];
    let hotspotInfluence = 0;

    for (let i = 0; i < this.hotspots.length; i++) {
      const hs = this.hotspots[i];
      const d = Math.hypot(hs.x - px, hs.z - pz);
      const reach = BALANCE.pedSpawnRadius + hs.radius * 0.5;
      if (d <= reach) {
        nearbyHotspots.push(hs);
        const closeness = Math.max(0, 1 - d / reach);
        hotspotInfluence += hs.densityWeight * (0.45 + 0.55 * closeness);
      }
    }

    const distFromCenter = Math.hypot(px, pz);
    const baseSparse =
      distFromCenter > this.map.cityCoreHalfSize
        ? Math.max(2, Math.floor(BALANCE.pedBaseSparseCount * 0.4))
        : BALANCE.pedBaseSparseCount;

    if (nearbyHotspots.length === 0) {
      return { targetCount: baseSparse, nearbyHotspots };
    }

    const extra = Math.round(
      Math.min(1, hotspotInfluence) * (BALANCE.pedMaxCount - baseSparse)
    );
    return {
      targetCount: Math.min(BALANCE.pedMaxCount, baseSparse + extra),
      nearbyHotspots,
    };
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
    const swing = p.diving ? 0.95 : p.stopped ? 0 : Math.sin(p.walkPhase) * 0.55;
    const bob = p.diving ? 0.35 : p.stopped ? 0 : Math.abs(Math.sin(p.walkPhase)) * 0.05;

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
      this.peds[i].wasVisible = false;
      this.peds[i].stopped = false;
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
    this.oneWheel.reset();
  }

  getActivePedestrians(): PedestrianSnapshot[] {
    const active: PedestrianSnapshot[] = [];
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      if (!p.active) continue;
      active.push({
        id: p.id,
        x: p.x,
        y: p.y,
        z: p.z,
        vx: p.vx,
        vz: p.vz,
        stopped: p.stopped,
        diving: p.diving,
        diveTimer: p.diveTimer,
      });
    }
    return active;
  }

  getActiveOneWheelRiders(): OneWheelRiderSnapshot[] {
    return this.oneWheel.getActiveRiders();
  }

  update(
    dt: number,
    player: ArcadeVehicle,
    waitingPassengers: WaitingPassenger[],
    activeDestinations: Array<{ x: number; y: number; z: number }>,
    rng: Rng,
    timeSec: number,
    allowSpecialSpawn = true
  ): PedImpactResult {
    const out: PedImpactResult = { explosions: [], scares: [] };
    const px = player.currPosition.x;
    const py = player.currPosition.y;
    const pz = player.currPosition.z;
    const pSpd = player.speed;
    const pSpdKmh = Math.abs(pSpd) * 3.6;
    const carIsSlow = pSpdKmh < BALANCE.pedYieldSpeedKmh;
    const fwdX = player.forwardDir.x;
    const fwdZ = player.forwardDir.z;

    const { targetCount, nearbyHotspots } = this.computeLocalTargetCount(px, pz);
    let activeCount = 0;
    for (let i = 0; i < this.peds.length; i++) {
      if (this.peds[i].active) activeCount++;
    }

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

    let anyMatrixChanged = false;

    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      if (!p.active) {
        if (p.respawnTimer > 0) {
          p.respawnTimer -= dt;
        } else if (activeCount < targetCount) {
          if (this.trySpawnPed(p, px, pz, nearbyHotspots, rng)) {
            activeCount++;
          }
        }
        if (p.wasVisible && !p.active) {
          this.hidePedInstance(i);
          p.wasVisible = false;
          anyMatrixChanged = true;
        }
        continue;
      }

      if (p.scareCooldown > 0) p.scareCooldown -= dt;

      if (p.chainTimer > 0) {
        p.chainTimer -= dt;
        if (p.chainTimer <= 0) {
          p.active = false;
          p.wasVisible = false;
          activeCount--;
          p.respawnTimer = BALANCE.pedRespawnDelay;
          out.explosions.push({ x: p.x, y: p.y, z: p.z, isChain: true, wasPassenger: false });
          triggerChainAround(p.x, p.z);
          this.hidePedInstance(i);
          anyMatrixChanged = true;
          continue;
        }
      }

      const dx = p.x - px;
      const dz = p.z - pz;
      const dist = Math.hypot(dx, dz);

      // Cull pedestrians beyond despawn radius, or trim excess background peds when leaving a hotspot
      if (
        dist > BALANCE.pedDespawnRadius ||
        (activeCount > targetCount && !p.inHotspot && dist > 65)
      ) {
        p.active = false;
        p.wasVisible = false;
        activeCount--;
        p.respawnTimer = 0.5;
        this.hidePedInstance(i);
        anyMatrixChanged = true;
        continue;
      }

      // Dive-away AI
      if (!p.diving && dist < BALANCE.pedDiveDetectRadius && pSpd > 8) {
        const dot = (dx * fwdX + dz * fwdZ) / Math.max(0.1, dist);
        if (dot > 0.45) {
          const cross = fwdX * dz - fwdZ * dx;
          const sideSign = cross >= 0 ? 1 : -1;
          p.diving = true;
          p.stopped = false;
          p.diveTimer = BALANCE.pedDiveDuration;
          p.vx = -fwdZ * sideSign * BALANCE.pedDiveSpeed;
          p.vz = fwdX * sideSign * BALANCE.pedDiveSpeed;
        }
      }

      if (p.diving) {
        p.stopped = false;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.diveTimer -= dt;
        if (p.diveTimer <= 0) p.diving = false;
      } else {
        const nextX = p.x + p.walkDirX * p.walkSpeed * dt;
        const nextZ = p.z + p.walkDirZ * p.walkSpeed * dt;
        const nextDist = Math.hypot(nextX - px, nextZ - pz);
        const walkingIntoCar = nextDist < dist && nextDist < BALANCE.pedStopRadius;
        const shouldStopForCar =
          !player.isGhost &&
          Math.abs(py - p.y) < 2.2 &&
          (walkingIntoCar || (carIsSlow && dist < BALANCE.pedStopRadius));

        if (shouldStopForCar) {
          p.stopped = true;
          p.vx = 0;
          p.vz = 0;
        } else {
          p.stopped = false;
          p.x = nextX;
          p.z = nextZ;
          p.vx = p.walkDirX * p.walkSpeed;
          p.vz = p.walkDirZ * p.walkSpeed;
          p.walkPhase += dt * p.walkSpeed * 4.2;

          // Keep pedestrians patrolling within their sidewalk/hotspot cluster instead of wandering away
          const adx = p.x - p.anchorX;
          const adz = p.z - p.anchorZ;
          if (
            adx * adx + adz * adz > p.patrolRadius * p.patrolRadius &&
            adx * p.walkDirX + adz * p.walkDirZ > 0
          ) {
            p.walkDirX = -p.walkDirX;
            p.walkDirZ = -p.walkDirZ;
          }
        }
      }
      p.y = this.map.heightMap.sample(p.x, p.z);

      const postDist = Math.hypot(p.x - px, p.z - pz);

      // Player overlap -> cartoon explosion (only when car is moving >= 5 km/h)
      if (!player.isGhost && Math.abs(py - p.y) < 2.2) {
        if (postDist < 1.85 && !carIsSlow) {
          p.active = false;
          p.wasVisible = false;
          activeCount--;
          p.respawnTimer = BALANCE.pedRespawnDelay;
          out.explosions.push({ x: p.x, y: p.y, z: p.z, isChain: false, wasPassenger: false });
          triggerChainAround(p.x, p.z);
          this.hidePedInstance(i);
          anyMatrixChanged = true;
          continue;
        } else if (postDist < 2.85 && pSpd > 9 && p.scareCooldown <= 0) {
          p.scareCooldown = 3.0;
          out.scares.push(postDist - 1.85);
        }
      }

      this.updatePedInstance(i, p);
      p.wasVisible = true;
      anyMatrixChanged = true;
    }

    if (anyMatrixChanged) {
      this.markAllDirty();
    }

    // Special OneWheel bonus riders (+10s time bonus every 3 minutes)
    const oneWheelHits = this.oneWheel.update(dt, player, rng, timeSec, allowSpecialSpawn);
    for (const hit of oneWheelHits) {
      out.explosions.push({
        x: hit.x,
        y: hit.y,
        z: hit.z,
        isChain: false,
        wasPassenger: false,
        bonusTimeSeconds: hit.bonusTimeSeconds,
        oneWheelVariant: hit.oneWheelVariant,
      });
      triggerChainAround(hit.x, hit.z);
    }

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

  private trySpawnPed(
    p: Pedestrian,
    px: number,
    pz: number,
    nearbyHotspots: PedHotspot[],
    rng: Rng
  ): boolean {
    const allSpots: SidewalkSpot[] = this.map.sidewalkSpots;
    const useHotspot = nearbyHotspots.length > 0 && rng.chance(0.88);

    for (let attempt = 0; attempt < 10; attempt++) {
      let s: SidewalkSpot;
      let isHotspotSpawn = false;
      if (useHotspot) {
        const hs = rng.pick(nearbyHotspots);
        s = rng.pick(hs.spots);
        isHotspotSpawn = true;
      } else {
        s = rng.pick(allSpots);
      }

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

      // In hotspots, cluster people tightly along the sidewalk promenade (±6m along sidewalk, ±0.8m lateral)
      const alongOffset = isHotspotSpawn ? rng.range(-7.5, 7.5) : rng.range(-2.5, 2.5);
      const latOffset = isHotspotSpawn ? rng.range(-0.85, 0.85) : rng.range(-0.6, 0.6);
      const rightX = -dirZ;
      const rightZ = dirX;

      p.active = true;
      p.inHotspot = isHotspotSpawn;
      p.anchorX = s.x;
      p.anchorZ = s.z;
      p.patrolRadius = isHotspotSpawn ? 16 : 24;
      p.x = s.x + dirX * alongOffset + rightX * latOffset;
      p.z = s.z + dirZ * alongOffset + rightZ * latOffset;
      p.y = this.map.heightMap.sample(p.x, p.z);
      p.walkDirX = dirX;
      p.walkDirZ = dirZ;
      p.walkSpeed = rng.range(1.2, 2.0);
      p.stopped = false;
      p.diving = false;
      p.chainTimer = 0;
      return true;
    }
    p.respawnTimer = 0.6;
    return false;
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
