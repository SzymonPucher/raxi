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
    this.group.add(trunks, crowns);

    // Instanced street lamps (2 draw calls!)
    const poleGeo = new THREE.CylinderGeometry(0.11, 0.15, 6.4, 6);
    poleGeo.translate(0, 3.2, 0);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x455a64 });
    const bulbGeo = new THREE.BoxGeometry(0.65, 0.25, 0.4);
    bulbGeo.translate(-0.35, 6.4, 0);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff5c0 });

    const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPositions.length);
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampPositions.length);
    for (let i = 0; i < lampPositions.length; i++) {
      const l = lampPositions[i];
      dummy.position.set(l.x, l.y, l.z);
      dummy.rotation.set(0, l.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      bulbs.setMatrixAt(i, dummy.matrix);
    }
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
      const y = s.y + 0.55;

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
