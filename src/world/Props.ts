import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { CG, makeCollisionGroups } from '../physics/collisionGroups';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { MapDefinition, getDistrictAt } from './mapData';

interface BreakableProp {
  id: number;
  kind: 'hydrant' | 'cone' | 'stand';
  homeX: number;
  homeY: number;
  homeZ: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Object3D;
  smashed: boolean;
  resetTimer: number;
}

interface TreePlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  tint: number;
  kind: 'conifer' | 'deciduous';
}

function pointInPolygon(x: number, z: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const zi = polygon[i][1];
    const xj = polygon[j][0];
    const zj = polygon[j][1];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonArea(polygon: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]);
  }
  return Math.abs(area * 0.5);
}

function distToSegmentSq(
  px: number,
  pz: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number
): number {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return (px - x0) ** 2 + (pz - z0) ** 2;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / lenSq));
  const cx = x0 + dx * t;
  const cz = z0 + dz * t;
  return (px - cx) ** 2 + (pz - cz) ** 2;
}

/**
 * Instanced static street props (trees, street lamps) + pooled dynamic breakable props (§6.2, §9.4).
 */
export class PropsManager {
  public readonly group = new THREE.Group();
  private readonly breakables: BreakableProp[] = [];
  private readonly breakableById = new Map<number, BreakableProp>();

  constructor(map: MapDefinition, physics: PhysicsWorld) {
    const rng = new Rng(201207);
    this.buildInstancedTreesAndLamps(map, rng);
    this.buildBreakableProps(map, physics, rng);
  }

  private buildInstancedTreesAndLamps(map: MapDefinition, rng: Rng): void {
    const hasGreenZones = Boolean(map.greenZones && map.greenZones.length > 0);
    if (hasGreenZones) {
      this.buildGreenZoneTreesAndLamps(map, rng);
      return;
    }

    // --- Original Raxi City tree & lamp generation (100% unchanged!) ---
    const treePositions: Array<{ x: number; y: number; z: number; scale: number; tint: number }> = [];
    const lampPositions: Array<{ x: number; y: number; z: number; yaw: number }> = [];

    // Place lamps along city avenues and trees in park / residential / outskirts
    for (let i = 0; i < map.graph.edges.length; i++) {
      const e = map.graph.edges[i];
      if (e.isShortcut) continue;
      const a = map.graph.getNode(e.from)!;
      const b = map.graph.getNode(e.to)!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 30) continue;
      const rx = -dz / len;
      const rz = dx / len;
      const yaw = Math.atan2(dx, dz);

      if (e.roadType === 'avenue' || e.roadType === 'street') {
        const lx = a.x + dx * 0.5 + rx * (e.width * 0.5 + 1.6);
        const lz = a.z + dz * 0.5 + rz * (e.width * 0.5 + 1.6);
        lampPositions.push({ x: lx, y: map.heightMap.sample(lx, lz), z: lz, yaw });
      }
    }

    // Central park trees
    for (let i = 0; i < 85; i++) {
      const x = rng.range(map.parkBounds.minX + 10, map.parkBounds.maxX - 10);
      const z = rng.range(map.parkBounds.minZ + 10, map.parkBounds.maxZ - 10);
      const proj = map.graph.projectPoint(x, z, 0, -1, 10);
      if (proj && proj.distFromCenter < proj.halfWidth + 3) continue;
      treePositions.push({ x, y: map.heightMap.sample(x, z), z, scale: rng.range(0.85, 1.45), tint: rng.pick([0x3ca347, 0x2e8b40, 0x58b848]) });
    }

    // Residential & Outskirts trees
    for (let i = 0; i < 180; i++) {
      const x = rng.range(-1000, 920);
      const z = rng.range(-1000, 880);
      const dist = getDistrictAt(x, z);
      if (dist !== 'residential' && dist !== 'outskirts') continue;
      if (x > 800 || z > 800) continue;
      const proj = map.graph.projectPoint(x, z, 0, -1, 16);
      if (proj && proj.distFromCenter < proj.halfWidth + 6) continue;
      if (map.landmarks.some((l) => Math.hypot(l.x - x, l.z - z) < 50)) continue;
      const y = map.heightMap.sample(x, z);
      treePositions.push({ x, y, z, scale: rng.range(0.9, 1.7), tint: rng.pick([0x3b8c3e, 0x4ca64a, 0x62a840]) });
    }

    // Instanced tree trunks + foliage (2 draw calls total!)
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 2.8, 6);
    trunkGeo.translate(0, 1.4, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6d4c41 });
    const crownGeo = new THREE.ConeGeometry(2.3, 5.2, 7);
    crownGeo.translate(0, 4.8, 0);
    const crownMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treePositions.length);
    trunks.frustumCulled = false;
    crowns.frustumCulled = false;
    crowns.castShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < treePositions.length; i++) {
      const t = treePositions[i];
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      crowns.setMatrixAt(i, dummy.matrix);
      color.setHex(t.tint);
      crowns.setColorAt(i, color);
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    this.group.add(trunks, crowns);

    // Instanced street lamps (2 draw calls!)
    this.addLampInstances(lampPositions);
  }

  /**
   * Polygon-accurate deciduous + conifer tree population for maps with `map.greenZones` (Mikołów),
   * avoiding roads, rail lines, buildings, landmarks, garages, ramps, and sports pitches.
   */
  private buildGreenZoneTreesAndLamps(map: MapDefinition, rng: Rng): void {
    const zones = map.greenZones ?? [];
    const customBuildings = map.customBuildings ?? [];
    const railLines = map.railLines ?? [];
    const sportsPolygons = zones.filter((z) => z.kind === 'sports').map((z) => z.polygon);
    const landmarkPolygons: Array<Array<[number, number]>> = [];
    for (const l of map.landmarks) {
      if (l.footprintParts) {
        for (const p of l.footprintParts) {
          if (p.polygon.length >= 3) landmarkPolygons.push(p.polygon);
        }
      }
      if (l.parkingLots) {
        for (const lot of l.parkingLots) {
          if (lot.polygon.length >= 3) landmarkPolygons.push(lot.polygon);
        }
      }
    }

    const deciduousPalette = [0x3fa047, 0x4fb34d, 0x2f863f, 0x62b84a, 0x397f3d];
    const coniferPalette = [0x245d33, 0x2c6f3c, 0x1e4e2c, 0x357b42];

    const isSpotClearForTree = (x: number, z: number): boolean => {
      // Keep trees strictly inside playable bounds
      const bound = map.worldHalfSize - 70;
      if (Math.abs(x) > bound || Math.abs(z) > bound) return false;

      // Never place trees on sports pitches or landmark buildings/parking lots
      for (let s = 0; s < sportsPolygons.length; s++) {
        if (pointInPolygon(x, z, sportsPolygons[s])) return false;
      }
      for (let lp = 0; lp < landmarkPolygons.length; lp++) {
        if (pointInPolygon(x, z, landmarkPolygons[lp])) return false;
      }

      // Avoid all roads + sidewalks
      const proj = map.graph.projectPoint(x, z, 0, -1, 18);
      if (proj) {
        const curbW = proj.edge.sidewalkWidth ?? 1.5;
        if (proj.distFromCenter < proj.halfWidth + curbW + 2.6) return false;
      }

      // Avoid railway corridors
      for (let r = 0; r < railLines.length; r++) {
        const pts = railLines[r].points;
        for (let p = 0; p < pts.length - 1; p++) {
          if (distToSegmentSq(x, z, pts[p][0], pts[p][1], pts[p + 1][0], pts[p + 1][1]) < 6.0 * 6.0) {
            return false;
          }
        }
      }

      // Avoid landmarks, garages, ramps
      for (let i = 0; i < map.landmarks.length; i++) {
        const l = map.landmarks[i];
        const minR = Math.max(l.footprintW, l.footprintD) * 0.65 + 4.5;
        if ((l.x - x) ** 2 + (l.z - z) ** 2 < minR * minR) return false;
      }
      for (let i = 0; i < map.garages.length; i++) {
        const g = map.garages[i];
        if ((g.x - x) ** 2 + (g.z - z) ** 2 < 16 * 16) return false;
      }
      for (let i = 0; i < map.ramps.length; i++) {
        const r = map.ramps[i];
        if ((r.x - x) ** 2 + (r.z - z) ** 2 < 15 * 15) return false;
      }

      // Avoid custom building footprints (with 2.8m clearance margin)
      for (let i = 0; i < customBuildings.length; i++) {
        const b = customBuildings[i];
        const rad = Math.max(b.w, b.d) * 0.56 + 2.8;
        if (Math.abs(x - b.x) < rad && Math.abs(z - b.z) < rad) {
          return false;
        }
      }

      return true;
    };

    const trees: TreePlacement[] = [];
    const maxZoneTrees = 1220;
    const maxTotalTrees = 1350;

    // 1. Pre-compute weighted demand for every non-sports green zone so all parks & forests receive proportional lush density!
    const zoneSpecs = zones
      .filter((z) => z.kind !== 'sports' && z.treeDensity > 0.01 && z.polygon.length >= 3)
      .map((zone) => {
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const [px, pz] of zone.polygon) {
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (pz < minZ) minZ = pz;
          if (pz > maxZ) maxZ = pz;
        }
        const area = polygonArea(zone.polygon);
        const rawDemand = Math.max(4, Math.min(260, (area / 280) * zone.treeDensity));
        return { zone, minX, maxX, minZ, maxZ, rawDemand };
      });

    const totalDemand = zoneSpecs.reduce((acc, s) => acc + s.rawDemand, 0);
    const budgetScale = totalDemand > maxZoneTrees ? maxZoneTrees / totalDemand : 1;

    for (const spec of zoneSpecs) {
      if (trees.length >= maxZoneTrees) break;
      const { zone, minX, maxX, minZ, maxZ, rawDemand } = spec;
      const target = Math.min(
        Math.max(4, Math.round(rawDemand * budgetScale)),
        maxZoneTrees - trees.length
      );

      const coniferChance =
        zone.kind === 'forest'
          ? 0.55
          : zone.kind === 'cemetery'
            ? 0.5
            : zone.kind === 'park'
              ? 0.18
              : 0.25;
      const scaleMin = zone.kind === 'forest' ? 1.0 : 0.88;
      const scaleMax = zone.kind === 'forest' ? 1.75 : zone.kind === 'park' ? 1.52 : 1.35;

      let placed = 0;
      const maxAttempts = target * 7;
      for (let a = 0; a < maxAttempts && placed < target; a++) {
        const x = rng.range(minX, maxX);
        const z = rng.range(minZ, maxZ);
        if (!pointInPolygon(x, z, zone.polygon)) continue;
        if (!isSpotClearForTree(x, z)) continue;

        const kind: 'conifer' | 'deciduous' = rng.chance(coniferChance) ? 'conifer' : 'deciduous';
        trees.push({
          x,
          y: map.heightMap.sample(x, z),
          z,
          scale: rng.range(scaleMin, scaleMax),
          tint: rng.pick(kind === 'conifer' ? coniferPalette : deciduousPalette),
          kind,
        });
        placed++;
      }
    }

    // 2. Light suburban garden & roadside trees outside historic Rynek / Old Town core
    const townhall = map.landmarks.find((l) => l.style === 'townhall');
    const rynekX = townhall ? townhall.x + 22 : 0;
    const rynekZ = townhall ? townhall.z - 25 : 0;
    const suburbanTarget = Math.min(130, maxTotalTrees - trees.length);
    let suburbanPlaced = 0;
    for (let attempt = 0; attempt < suburbanTarget * 5 && suburbanPlaced < suburbanTarget; attempt++) {
      const x = rng.range(-1050, 1050);
      const z = rng.range(-1050, 1050);
      if (Math.hypot(x - rynekX, z - rynekZ) < 195) continue; // Keep Rynek & Old Town historic square open
      if (!isSpotClearForTree(x, z)) continue;
      const kind: 'conifer' | 'deciduous' = rng.chance(0.32) ? 'conifer' : 'deciduous';
      trees.push({
        x,
        y: map.heightMap.sample(x, z),
        z,
        scale: rng.range(0.85, 1.4),
        tint: rng.pick(kind === 'conifer' ? coniferPalette : deciduousPalette),
        kind,
      });
      suburbanPlaced++;
    }

    // 3. Render all trees in just 3 InstancedMeshes (trunks + deciduous crowns + conifer crowns = 3 draw calls!)
    if (trees.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.28, 0.44, 3.0, 6);
      trunkGeo.translate(0, 1.3, 0); // Slight -0.2m root embed on hills
      const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4b3e });
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
      trunks.frustumCulled = false;

      const deciduousTrees = trees.filter((t) => t.kind === 'deciduous');
      const coniferTrees = trees.filter((t) => t.kind === 'conifer');

      const dummy = new THREE.Object3D();
      const color = new THREE.Color();

      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
      }
      trunks.instanceMatrix.needsUpdate = true;
      this.group.add(trunks);

      if (deciduousTrees.length > 0) {
        const decGeo = new THREE.DodecahedronGeometry(2.45, 0);
        decGeo.scale(1.06, 0.9, 1.06);
        decGeo.translate(0, 4.7, 0);
        const decMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const decMesh = new THREE.InstancedMesh(decGeo, decMat, deciduousTrees.length);
        decMesh.frustumCulled = false;
        decMesh.castShadow = true;
        for (let i = 0; i < deciduousTrees.length; i++) {
          const t = deciduousTrees[i];
          dummy.position.set(t.x, t.y, t.z);
          dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
          dummy.scale.setScalar(t.scale);
          dummy.updateMatrix();
          decMesh.setMatrixAt(i, dummy.matrix);
          color.setHex(t.tint);
          decMesh.setColorAt(i, color);
        }
        decMesh.instanceMatrix.needsUpdate = true;
        if (decMesh.instanceColor) decMesh.instanceColor.needsUpdate = true;
        this.group.add(decMesh);
      }

      if (coniferTrees.length > 0) {
        const conGeo = new THREE.ConeGeometry(2.15, 5.8, 7);
        conGeo.translate(0, 5.0, 0);
        const conMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const conMesh = new THREE.InstancedMesh(conGeo, conMat, coniferTrees.length);
        conMesh.frustumCulled = false;
        conMesh.castShadow = true;
        for (let i = 0; i < coniferTrees.length; i++) {
          const t = coniferTrees[i];
          dummy.position.set(t.x, t.y, t.z);
          dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
          dummy.scale.setScalar(t.scale);
          dummy.updateMatrix();
          conMesh.setMatrixAt(i, dummy.matrix);
          color.setHex(t.tint);
          conMesh.setColorAt(i, color);
        }
        conMesh.instanceMatrix.needsUpdate = true;
        if (conMesh.instanceColor) conMesh.instanceColor.needsUpdate = true;
        this.group.add(conMesh);
      }
    }

    // 4. Street lamps along Mikołów's avenues & streets at exact heightmap elevation
    const lampPositions: Array<{ x: number; y: number; z: number; yaw: number }> = [];
    for (let i = 0; i < map.graph.edges.length; i++) {
      const e = map.graph.edges[i];
      if (e.isShortcut) continue;
      if (e.roadType !== 'avenue' && e.roadType !== 'street') continue;

      const a = map.graph.getNode(e.from)!;
      const b = map.graph.getNode(e.to)!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 28) continue;

      const rx = -dz / len;
      const rz = dx / len;
      const yaw = Math.atan2(dx, dz);
      const curbW = e.sidewalkWidth ?? 1.5;
      const latOffset = e.width * 0.5 + Math.max(0.55, Math.min(curbW, 2.5) * 0.65);

      const count = Math.min(4, Math.max(1, Math.floor((len - 18) / 44)));
      for (let k = 0; k < count; k++) {
        const t = (k + 1) / (count + 1);
        const side = (i + k) % 2 === 0 ? 1 : -1;
        const lx = a.x + dx * t + rx * latOffset * side;
        const lz = a.z + dz * t + rz * latOffset * side;
        if (map.garages.some((g) => (g.x - lx) ** 2 + (g.z - lz) ** 2 < 16 * 16)) continue;
        // Aim lamp arm inward toward the roadway
        const lampYaw = side > 0 ? yaw + Math.PI : yaw;
        lampPositions.push({ x: lx, y: map.heightMap.sample(lx, lz), z: lz, yaw: lampYaw });
      }
    }

    if (lampPositions.length > 0) {
      this.addLampInstances(lampPositions);
    }
  }

  private addLampInstances(lampPositions: Array<{ x: number; y: number; z: number; yaw: number }>): void {
    const poleGeo = new THREE.CylinderGeometry(0.11, 0.15, 6.4, 6);
    poleGeo.translate(0, 3.2, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x455a64 });
    const bulbGeo = new THREE.BoxGeometry(0.65, 0.25, 0.4);
    bulbGeo.translate(-0.35, 6.4, 0);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff5c0 });

    const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPositions.length);
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampPositions.length);
    poles.frustumCulled = false;
    bulbs.frustumCulled = false;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < lampPositions.length; i++) {
      const l = lampPositions[i];
      dummy.position.set(l.x, l.y, l.z);
      dummy.rotation.set(0, l.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      bulbs.setMatrixAt(i, dummy.matrix);
    }
    poles.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    this.group.add(poles, bulbs);
  }

  private buildBreakableProps(map: MapDefinition, physics: PhysicsWorld, rng: Rng): void {
    const hydrantGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.95, 7);
    const hydrantMat = new THREE.MeshLambertMaterial({ color: 0xe53935 });

    const coneGeo = new THREE.ConeGeometry(0.32, 0.85, 6);
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xff6d00 });

    const standGeo = new THREE.BoxGeometry(0.75, 1.15, 0.6);
    const standMat = new THREE.MeshLambertMaterial({ color: 0x1e88e5 });

    // Place ~60 light breakable props along city sidewalks
    let id = 1;
    const spots = rng.shuffle(map.sidewalkSpots).slice(0, 60);
    for (const s of spots) {
      if (s.landmarkId) continue;
      const kinds: BreakableProp['kind'][] = ['hydrant', 'cone', 'stand'];
      const kind = kinds[id % kinds.length];
      const groundY = map.heightMap.sample(s.x, s.z);
      const y = groundY + 0.55;

      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(s.x, y, s.z)
        .setLinearDamping(0.4)
        .setAngularDamping(0.5)
        .setSleeping(true);
      const body = physics.world.createRigidBody(bodyDesc);
      const colDesc = RAPIER.ColliderDesc.cuboid(0.32, 0.48, 0.32)
        .setMass(12)
        .setFriction(0.5)
        .setRestitution(0.35)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setCollisionGroups(
          makeCollisionGroups(CG.PROPS_BREAKABLE, CG.PLAYER | CG.GROUND | CG.STATIC_WORLD | CG.TRAFFIC)
        );
      const collider = physics.world.createCollider(colDesc, body);
      physics.registerTag(collider, { kind: 'prop', id });

      const mesh = new THREE.Mesh(
        kind === 'hydrant' ? hydrantGeo : kind === 'cone' ? coneGeo : standGeo,
        kind === 'hydrant' ? hydrantMat : kind === 'cone' ? coneMat : standMat
      );
      mesh.position.set(s.x, y, s.z);
      mesh.castShadow = true;
      this.group.add(mesh);

      const prop: BreakableProp = {
        id,
        kind,
        homeX: s.x,
        homeY: y,
        homeZ: s.z,
        body,
        collider,
        mesh,
        smashed: false,
        resetTimer: 0,
      };
      this.breakables.push(prop);
      this.breakableById.set(id, prop);
      id++;
    }
  }

  /** Called when player hits a breakable prop. Returns true if first smash (award style). */
  markSmashed(propId: number): boolean {
    const p = this.breakableById.get(propId);
    if (!p || p.smashed) return false;
    p.smashed = true;
    p.resetTimer = 25;
    return true;
  }

  update(dt: number, playerX: number, playerZ: number): void {
    for (let i = 0; i < this.breakables.length; i++) {
      const p = this.breakables[i];
      if (!p.body.isSleeping()) {
        const t = p.body.translation();
        const r = p.body.rotation();
        p.mesh.position.set(t.x, t.y, t.z);
        p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
      if (p.smashed) {
        p.resetTimer -= dt;
        const distSq = (p.homeX - playerX) ** 2 + (p.homeZ - playerZ) ** 2;
        if (p.resetTimer <= 0 && distSq > 80 * 80) {
          p.smashed = false;
          p.body.setTranslation({ x: p.homeX, y: p.homeY, z: p.homeZ }, false);
          p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false);
          p.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
          p.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
          p.body.sleep();
          p.mesh.position.set(p.homeX, p.homeY, p.homeZ);
          p.mesh.quaternion.identity();
        }
      }
    }
  }
}
