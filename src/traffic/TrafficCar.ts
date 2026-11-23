import * as THREE from 'three';
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
  { kind: 'sedan', w: 1.85, h: 1.35, l: 4.3, mass: 1150, colors: [0xe53935, 0x1e88e5, 0x43a047, 0xfb8c00, 0x8e24aa, 0xeeeeee, 0x455a64] },
  { kind: 'hatchback', w: 1.75, h: 1.3, l: 3.7, mass: 950, colors: [0x26c6da, 0xff7043, 0x9ccc65, 0xec407a, 0xffee58] },
  { kind: 'van', w: 2.0, h: 1.95, l: 4.9, mass: 1700, colors: [0xf5f5f5, 0x78909c, 0x1565c0, 0xd84315] },
  { kind: 'bus', w: 2.4, h: 2.8, l: 8.6, mass: 4800, colors: [0x1976d2, 0xef6c00, 0x2e7d32] },
  { kind: 'truck', w: 2.35, h: 2.7, l: 7.4, mass: 4200, colors: [0xc62828, 0x546e7a, 0xf9a825] },
  { kind: 'police', w: 1.9, h: 1.4, l: 4.5, mass: 1350, colors: [0x1a237e] },
];

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
  public forward = true; // true = from->to, false = to->from
  public progress = 0; // meters along current edge
  public laneOffset = 3.2;
  public swerveOffset = 0;
  public swerveTimer = 0;
  public speed = 0;
  public stuckTimer = 0;
  public nearMissCooldown = 0;

  public x = 0;
  public y = -200;
  public z = 0;
  public yaw = 0;

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
      .setRestitution(0.2)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setCollisionGroups(
        makeCollisionGroups(CG.TRAFFIC, CG.PLAYER | CG.GROUND | CG.STATIC_WORLD | CG.TRAFFIC | CG.PROPS_BREAKABLE)
      );
    this.collider = physics.world.createCollider(colDesc, this.body);
    physics.registerTag(this.collider, { kind: 'traffic', id });
  }

  private buildMesh(spec: VehicleSpec, seed: number): THREE.Group {
    const group = new THREE.Group();
    const color = spec.colors[seed % spec.colors.length];
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x263238 });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

    const lowerH = spec.kind === 'bus' || spec.kind === 'truck' ? spec.h * 0.88 : spec.h * 0.52;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(spec.w, lowerH, spec.l), bodyMat);
    lower.position.y = -spec.h * 0.5 + lowerH * 0.5 + 0.18;
    lower.castShadow = true;
    group.add(lower);

    if (spec.kind === 'sedan' || spec.kind === 'hatchback' || spec.kind === 'police') {
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w * 0.84, spec.h * 0.42, spec.l * 0.5),
        glassMat
      );
      cab.position.set(0, 0.28, 0.1);
      group.add(cab);

      if (spec.kind === 'police') {
        const barR = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.18, 0.25),
          new THREE.MeshBasicMaterial({ color: 0xff1744 })
        );
        barR.position.set(-0.26, 0.65, 0);
        const barB = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.18, 0.25),
          new THREE.MeshBasicMaterial({ color: 0x2979ff })
        );
        barB.position.set(0.26, 0.65, 0);
        group.add(barR, barB);
      }
    } else if (spec.kind === 'van' || spec.kind === 'bus') {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w + 0.03, spec.h * 0.28, spec.l * 0.78),
        glassMat
      );
      win.position.set(0, spec.h * 0.18, -spec.l * 0.04);
      group.add(win);
    } else if (spec.kind === 'truck') {
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w * 0.92, spec.h * 0.75, spec.l * 0.3),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      cab.position.set(0, -0.1, -spec.l * 0.34);
      group.add(cab);
    }

    // 4 simple wheels
    const wGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.24, 8);
    wGeo.rotateZ(Math.PI * 0.5);
    const wz = spec.l * 0.33;
    const wx = spec.w * 0.46;
    const wy = -spec.h * 0.5 + 0.25;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const wm = new THREE.Mesh(wGeo, wheelMat);
        wm.position.set(sx * wx, wy, sz * wz);
        group.add(wm);
      }
    }

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

    this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.setKinematicPose(x, y, z, yaw);
    this.mesh.visible = true;
  }

  setKinematicPose(x: number, y: number, z: number, yaw: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = yaw;
    const half = yaw * 0.5;
    this.body.setNextKinematicTranslation({ x, y, z });
    this.body.setNextKinematicRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) });
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(0, yaw, 0);
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
    this.mesh.visible = false;
    this.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.body.setTranslation({ x: 0, y: -200, z: 0 }, false);
    this.body.setNextKinematicTranslation({ x: 0, y: -200, z: 0 });
  }
}
