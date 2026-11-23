import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CG, makeCollisionGroups } from '../physics/collisionGroups';
import { PhysicsWorld, RAPIER } from '../physics/PhysicsWorld';
import { RoadEdge } from '../world/RoadGraph';

export type TrafficVehicleKind = 'sedan' | 'hatchback' | 'van' | 'bus' | 'truck' | 'police';

interface VehicleSpec {
  kind: TrafficVehicleKind;
  w: number;
  h: number;
  l: number;
  mass: number;
  colors: number[];
}

const SPECS: VehicleSpec[] = [
  { kind: 'sedan', w: 1.88, h: 1.38, l: 4.35, mass: 1150, colors: [0xc62828, 0x1976d2, 0x2e7d32, 0xe65100, 0x6a1b9a, 0xdce3e8, 0x455a64] },
  { kind: 'hatchback', w: 1.78, h: 1.32, l: 3.75, mass: 950, colors: [0x00acc1, 0xf4511e, 0x7cb342, 0xd81b60, 0xfdd835] },
  { kind: 'van', w: 2.02, h: 1.98, l: 4.95, mass: 1700, colors: [0xeceff1, 0x607d8b, 0x1565c0, 0xbf360c] },
  { kind: 'bus', w: 2.42, h: 2.85, l: 8.6, mass: 4800, colors: [0x1565c0, 0xef6c00, 0x2e7d32] },
  { kind: 'truck', w: 2.38, h: 2.75, l: 7.4, mass: 4200, colors: [0xb71c1c, 0x37474f, 0xf9a825] },
  { kind: 'police', w: 1.9, h: 1.4, l: 4.5, mass: 1350, colors: [0x181c22] },
];

function extrudeProfile(points: Array<[number, number]>, width: number, bevel = 0.06): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();

  const innerW = Math.max(0.1, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerW,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.75,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -innerW * 0.5);
  geo.rotateY(-Math.PI * 0.5);
  geo.computeVertexNormals();
  return geo;
}

function prepNonIndexed(geo: THREE.BufferGeometry, colorHex?: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (colorHex !== undefined) {
    const count = g.attributes.position.count;
    const cols = new Float32Array(count * 3);
    const c = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  return g;
}

interface MergedVehicleTemplate {
  paintGeo: THREE.BufferGeometry; // Tinted by per-car paint material (1 draw call)
  detailsGeo: THREE.BufferGeometry; // Vertex-colored glass, bumpers, wheels, lights, trim (1 draw call)
}

interface TrafficSharedAssets {
  templates: Record<TrafficVehicleKind, MergedVehicleTemplate>;
  detailsMat: THREE.MeshPhongMaterial;
}

let sharedAssets: TrafficSharedAssets | null = null;

function buildTemplate(spec: VehicleSpec): MergedVehicleTemplate {
  const paintParts: THREE.BufferGeometry[] = [];
  const detailParts: THREE.BufferGeometry[] = [];

  const addPaint = (geo: THREE.BufferGeometry, tx = 0, ty = 0, tz = 0, rx = 0) => {
    const g = geo.clone();
    if (rx !== 0) g.rotateX(rx);
    if (tx !== 0 || ty !== 0 || tz !== 0) g.translate(tx, ty, tz);
    paintParts.push(prepNonIndexed(g));
    g.dispose();
  };

  const addDetail = (geo: THREE.BufferGeometry, hex: number, tx = 0, ty = 0, tz = 0, rx = 0) => {
    const g = geo.clone();
    if (rx !== 0) g.rotateX(rx);
    if (tx !== 0 || ty !== 0 || tz !== 0) g.translate(tx, ty, tz);
    detailParts.push(prepNonIndexed(g, hex));
    g.dispose();
  };

  const hw = spec.w * 0.5;
  const hl = spec.l * 0.5;

  if (spec.kind === 'sedan') {
    const body = extrudeProfile(
      [[-2.12, -0.46], [-2.18, -0.18], [-2.08, 0.04], [-0.82, 0.1], [1.15, 0.12], [2.12, 0.06], [2.18, -0.16], [2.1, -0.46]],
      spec.w,
      0.06
    );
    const cab = extrudeProfile([[-0.92, 0.06], [-0.4, 0.62], [0.72, 0.62], [1.22, 0.08]], 1.56, 0.05);
    addPaint(body);
    addDetail(cab, 0x1e3040);
    body.dispose();
    cab.dispose();
    addPaint(new THREE.BoxGeometry(spec.w * 0.8, 0.08, 1.06), 0, 0.64, 0.16);
    addPaint(new THREE.BoxGeometry(spec.w * 0.84, 0.5, 0.13), 0, 0.35, 0.15);
    for (const sx of [-1, 1]) addPaint(new THREE.BoxGeometry(0.18, 0.1, 0.13), sx * (hw + 0.06), 0.18, -0.58);
  } else if (spec.kind === 'hatchback') {
    const body = extrudeProfile(
      [[-1.82, -0.44], [-1.88, -0.16], [-1.76, 0.06], [-0.65, 0.12], [1.76, 0.12], [1.86, -0.14], [1.8, -0.44]],
      spec.w,
      0.06
    );
    const cab = extrudeProfile([[-0.78, 0.08], [-0.25, 0.62], [1.25, 0.6], [1.78, 0.08]], 1.5, 0.05);
    addPaint(body);
    addDetail(cab, 0x1e3040);
    body.dispose();
    cab.dispose();
    addPaint(new THREE.BoxGeometry(spec.w * 0.8, 0.08, 1.42), 0, 0.64, 0.5);
    addPaint(new THREE.BoxGeometry(spec.w * 0.84, 0.5, 0.13), 0, 0.35, 0.15);
    addPaint(new THREE.BoxGeometry(spec.w * 0.78, 0.08, 0.22), 0, 0.66, 1.38);
    for (const sx of [-1, 1]) addPaint(new THREE.BoxGeometry(0.18, 0.1, 0.13), sx * (hw + 0.06), 0.18, -0.58);
  } else if (spec.kind === 'police') {
    const body = extrudeProfile(
      [[-2.2, -0.46], [-2.26, -0.18], [-2.14, 0.05], [-0.86, 0.11], [1.2, 0.13], [2.18, 0.06], [2.25, -0.16], [2.16, -0.46]],
      spec.w,
      0.06
    );
    const cab = extrudeProfile([[-0.95, 0.07], [-0.42, 0.64], [0.76, 0.64], [1.28, 0.09]], 1.58, 0.05);
    addPaint(body);
    addDetail(cab, 0x1e3040);
    body.dispose();
    cab.dispose();
    addDetail(new THREE.BoxGeometry(spec.w * 0.8, 0.08, 1.08), 0xf4f6f8, 0, 0.66, 0.16);
    addDetail(new THREE.BoxGeometry(spec.w * 0.84, 0.5, 0.13), 0xf4f6f8, 0, 0.36, 0.15);
    addDetail(new THREE.BoxGeometry(spec.w + 0.02, 0.52, 1.75), 0xf4f6f8, 0, -0.16, 0.12);
    addDetail(new THREE.BoxGeometry(1.15, 0.38, 0.16), 0x1d2126, 0, -0.18, -hl - 0.12);
    addDetail(new THREE.BoxGeometry(0.42, 0.16, 0.24), 0xff1744, -0.36, 0.76, 0.1);
    addDetail(new THREE.BoxGeometry(0.3, 0.16, 0.24), 0xf4f6f8, 0, 0.76, 0.1);
    addDetail(new THREE.BoxGeometry(0.42, 0.16, 0.24), 0x2979ff, 0.36, 0.76, 0.1);
  } else if (spec.kind === 'van') {
    const body = extrudeProfile(
      [[-2.42, -0.72], [-2.48, -0.25], [-2.32, 0.08], [-1.75, 0.14], [-1.25, 0.88], [2.38, 0.88], [2.46, 0.68], [2.46, -0.72]],
      spec.w,
      0.06
    );
    addPaint(body);
    body.dispose();
    addDetail(new THREE.BoxGeometry(spec.w * 0.88, 0.65, 0.12), 0x1e3040, 0, 0.45, -1.55, 0.48);
    addDetail(new THREE.BoxGeometry(spec.w + 0.03, 0.52, 1.4), 0x1e3040, 0, 0.44, -0.55);
    addDetail(new THREE.BoxGeometry(spec.w * 0.84, 0.09, 2.8), 0x22262b, 0, 0.94, 0.5);
  } else if (spec.kind === 'bus') {
    const body = extrudeProfile(
      [[-4.24, -1.08], [-4.32, -0.4], [-4.12, 1.18], [-3.95, 1.32], [4.2, 1.32], [4.3, 1.14], [4.3, -1.08]],
      spec.w,
      0.07
    );
    addPaint(body);
    body.dispose();
    addDetail(new THREE.BoxGeometry(spec.w + 0.04, 0.82, spec.l * 0.84), 0x1e3040, 0, 0.42, 0.1);
    addDetail(new THREE.BoxGeometry(spec.w * 0.9, 0.95, 0.12), 0x1e3040, 0, 0.44, -hl + 0.1);
    addDetail(new THREE.BoxGeometry(1.5, 0.24, 0.14), 0xffd600, 0, 1.08, -hl + 0.12);
    addDetail(new THREE.BoxGeometry(1.4, 0.22, 1.6), 0xeceff1, 0, 1.42, -0.8);
    addDetail(new THREE.BoxGeometry(1.4, 0.22, 1.6), 0xeceff1, 0, 1.42, 1.9);
    addDetail(new THREE.BoxGeometry(spec.w + 0.04, 0.24, spec.l * 0.94), 0xf4f6f8, 0, -0.25, 0);
  } else if (spec.kind === 'truck') {
    const cab = extrudeProfile(
      [[-3.62, -1.0], [-3.7, -0.42], [-3.55, 0.05], [-2.75, 0.12], [-2.4, 0.98], [-1.25, 0.98], [-1.25, -1.0]],
      2.18,
      0.06
    );
    addPaint(cab);
    cab.dispose();
    addPaint(new THREE.BoxGeometry(spec.w + 0.03, 0.26, 4.7), 0, 0.1, 1.25);
    addDetail(new THREE.BoxGeometry(spec.w, 2.25, 4.75), 0xf0f3f6, 0, 0.22, 1.25);
    addDetail(new THREE.BoxGeometry(1.92, 0.62, 0.12), 0x1e3040, 0, 0.54, -2.55, 0.28);
    addDetail(new THREE.BoxGeometry(1.25, 0.65, 0.12), 0xd9e2ea, 0, -0.28, -hl + 0.02);
  }

  // Bumpers + grille for cars
  if (spec.kind === 'sedan' || spec.kind === 'hatchback' || spec.kind === 'police') {
    addDetail(new THREE.BoxGeometry(spec.w + 0.06, 0.18, 0.16), 0x1d2126, 0, -0.34, -hl - 0.02);
    addDetail(new THREE.BoxGeometry(spec.w + 0.06, 0.18, 0.16), 0x1d2126, 0, -0.34, hl + 0.02);
    addDetail(new THREE.BoxGeometry(0.84, 0.2, 0.06), 0x1d2126, 0, -0.14, -hl - 0.01);
  }

  // Headlights & Taillights
  const lightY = spec.kind === 'bus' || spec.kind === 'truck' ? -0.58 : -0.14;
  for (const sx of [-1, 1]) {
    addDetail(new THREE.BoxGeometry(0.32, 0.16, 0.08), 0xfff8d6, sx * (hw - 0.32), lightY, -hl - 0.01);
    addDetail(new THREE.BoxGeometry(0.32, 0.16, 0.08), 0xe52020, sx * (hw - 0.32), lightY + 0.04, hl + 0.01);
  }

  // 4 sculpted 14-segment wheels with alloy rims
  const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14);
  tireGeo.rotateZ(Math.PI * 0.5);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.27, 10);
  rimGeo.rotateZ(Math.PI * 0.5);
  const wzFront = -spec.l * 0.32;
  const wzRear = spec.l * 0.32;
  const wx = hw - 0.06;
  const wy = -spec.h * 0.5 + 0.26;
  for (const sx of [-1, 1]) {
    for (const wz of [wzFront, wzRear]) {
      addDetail(tireGeo, 0x181a1d, sx * wx, wy, wz);
      addDetail(rimGeo, 0xd4dde5, sx * wx, wy, wz);
    }
  }
  tireGeo.dispose();
  rimGeo.dispose();

  const paintGeo = mergeGeometries(paintParts, false)!;
  const detailsGeo = mergeGeometries(detailParts, false)!;
  for (const g of paintParts) g.dispose();
  for (const g of detailParts) g.dispose();

  return { paintGeo, detailsGeo };
}

function getSharedAssets(): TrafficSharedAssets {
  if (sharedAssets) return sharedAssets;
  const templates = {} as Record<TrafficVehicleKind, MergedVehicleTemplate>;
  for (const spec of SPECS) {
    templates[spec.kind] = buildTemplate(spec);
  }
  sharedAssets = {
    templates,
    detailsMat: new THREE.MeshPhongMaterial({
      vertexColors: true,
      specular: 0x667788,
      shininess: 65,
    }),
  };
  return sharedAssets;
}

export interface TrafficTurnCurve {
  p0x: number;
  p0z: number;
  p1x: number;
  p1z: number;
  p2x: number;
  p2z: number;
  y0: number;
  y2: number;
  arcLength: number;
  distTraveled: number;
  isSharpTurn: boolean;
  nextEdge: RoadEdge;
  nextForward: boolean;
  nextLaneOffset: number;
  nextStartProgress: number;
}

const _tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _tmpQuat = new THREE.Quaternion();

export class TrafficCar {
  public readonly id: number;
  public readonly spec: VehicleSpec;
  public readonly mesh: THREE.Group;
  public body: RAPIER.RigidBody;
  public collider: RAPIER.Collider;

  public active = false;
  public knocked = false;
  public knockedTimer = 0;

  // Lane navigation state
  public edge: RoadEdge | null = null;
  public forward = true;
  public progress = 0;
  public laneOffset = 3.2;
  public swerveOffset = 0;
  public swerveTimer = 0;
  public speed = 0;
  public stuckTimer = 0;
  public nearMissCooldown = 0;
  public turn: TrafficTurnCurve | null = null;
  public roundaboutEntryEdgeId: string | null = null;
  public roundaboutSteps = 0;

  public x = 0;
  public y = -200;
  public z = 0;
  public yaw = 0;
  public dirX = 0;
  public dirZ = -1;

  constructor(id: number, specIndex: number, physics: PhysicsWorld) {
    this.id = id;
    this.spec = SPECS[specIndex % SPECS.length];
    this.mesh = this.buildMesh(this.spec, id);
    this.mesh.visible = false;

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -200, 0);
    this.body = physics.world.createRigidBody(bodyDesc);
    const colDesc = RAPIER.ColliderDesc.cuboid(
      this.spec.w * 0.5,
      this.spec.h * 0.5,
      this.spec.l * 0.5
    )
      .setMass(this.spec.mass)
      .setFriction(0.5)
      .setRestitution(0.02)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setCollisionGroups(
        makeCollisionGroups(CG.TRAFFIC, CG.PLAYER | CG.GROUND | CG.STATIC_WORLD | CG.TRAFFIC | CG.PROPS_BREAKABLE)
      );
    this.collider = physics.world.createCollider(colDesc, this.body);
    physics.registerTag(this.collider, { kind: 'traffic', id });
  }

  private buildMesh(spec: VehicleSpec, seed: number): THREE.Group {
    const group = new THREE.Group();
    const assets = getSharedAssets();
    const tmpl = assets.templates[spec.kind];
    const color = spec.colors[seed % spec.colors.length];
    const paintMat = new THREE.MeshPhongMaterial({
      color,
      specular: 0x555555,
      shininess: 55,
    });

    // Only 2 draw calls per visible traffic car!
    const paintMesh = new THREE.Mesh(tmpl.paintGeo, paintMat);
    paintMesh.castShadow = true;
    const detailsMesh = new THREE.Mesh(tmpl.detailsGeo, assets.detailsMat);
    group.add(paintMesh, detailsMesh);

    return group;
  }

  spawnOnEdge(
    edge: RoadEdge,
    forward: boolean,
    progress: number,
    laneOffset: number,
    x: number,
    y: number,
    z: number,
    yaw: number
  ): void {
    this.active = true;
    this.knocked = false;
    this.knockedTimer = 0;
    this.edge = edge;
    this.forward = forward;
    this.progress = progress;
    this.laneOffset = laneOffset;
    this.swerveOffset = 0;
    this.swerveTimer = 0;
    this.speed = edge.speedLimit * 0.75;
    this.stuckTimer = 0;
    this.nearMissCooldown = 0;
    this.turn = null;
    this.roundaboutEntryEdgeId = null;
    this.roundaboutSteps = 0;

    this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.setKinematicPose(x, y, z, yaw);
    this.mesh.visible = true;
  }

  setKinematicPose(x: number, y: number, z: number, yaw: number, pitch = 0): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = yaw;
    this.dirX = -Math.sin(yaw);
    this.dirZ = -Math.cos(yaw);
    _tmpEuler.set(pitch, yaw, 0, 'YXZ');
    _tmpQuat.setFromEuler(_tmpEuler);
    this.body.setNextKinematicTranslation({ x, y, z });
    this.body.setNextKinematicRotation({ x: _tmpQuat.x, y: _tmpQuat.y, z: _tmpQuat.z, w: _tmpQuat.w });
    this.mesh.position.set(x, y, z);
    this.mesh.quaternion.copy(_tmpQuat);
  }

  /**
   * Switches a kinematic traffic car to dynamic physics right before imminent player impact
   * so Rapier solves a finite-mass dynamic collision instead of an infinite-mass kinematic catapult.
   */
  wakeDynamicForCollision(): void {
    if (!this.active || this.knocked) return;
    this.knocked = true;
    this.knockedTimer = 0;
    this.turn = null;
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.body.setLinearDamping(0.35);
    this.body.setAngularDamping(0.45);
    this.body.setLinvel({ x: this.dirX * this.speed, y: 0, z: this.dirZ * this.speed }, true);
  }

  /** Switch to dynamic physics ("knocked" state §7.1) and apply dramatic launch velocity. */
  knock(impX: number, impY: number, impZ: number): void {
    if (!this.active) return;
    if (!this.knocked) {
      this.knocked = true;
      this.knockedTimer = 0;
      this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      this.body.setLinearDamping(0.35);
      this.body.setAngularDamping(0.45);
    }
    const massScale = Math.min(1.2, 1300 / this.spec.mass);
    this.body.setLinvel(
      {
        x: impX * massScale,
        y: Math.max(2.5, impY * massScale),
        z: impZ * massScale,
      },
      true
    );
    this.body.setAngvel(
      {
        x: (Math.random() - 0.5) * 6,
        y: (Math.random() - 0.5) * 8,
        z: (Math.random() - 0.5) * 6,
      },
      true
    );
  }

  despawn(): void {
    this.active = false;
    this.knocked = false;
    this.edge = null;
    this.turn = null;
    this.roundaboutEntryEdgeId = null;
    this.roundaboutSteps = 0;
    this.mesh.visible = false;
    this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.body.setTranslation({ x: 0, y: -200, z: 0 }, false);
    this.body.setNextKinematicTranslation({ x: 0, y: -200, z: 0 });
  }
}
