import RAPIER from '@dimforge/rapier3d-compat';
import { CG, makeCollisionGroups } from './collisionGroups';

export type ColliderTag =
  | { kind: 'player' }
  | { kind: 'ground' }
  | { kind: 'building' }
  | { kind: 'traffic'; id: number }
  | { kind: 'prop'; id: number }
  | { kind: 'pedestrian'; id: number }
  | { kind: 'zone'; id: string };

export interface CollisionContactEvent {
  colliderA: number;
  colliderB: number;
  tagA?: ColliderTag;
  tagB?: ColliderTag;
  totalForceMagnitude: number;
}

export class PhysicsWorld {
  public world!: RAPIER.World;
  public eventQueue!: RAPIER.EventQueue;
  private staticBody!: RAPIER.RigidBody;
  private colliderTags = new Map<number, ColliderTag>();
  private static initialized = false;

  static async initRapier(): Promise<void> {
    if (PhysicsWorld.initialized) return;
    await RAPIER.init();
    PhysicsWorld.initialized = true;
  }

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.eventQueue = new RAPIER.EventQueue(true);
    this.staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  registerTag(collider: RAPIER.Collider, tag: ColliderTag): void {
    this.colliderTags.set(collider.handle, tag);
  }

  unregisterTag(collider: RAPIER.Collider): void {
    this.colliderTags.delete(collider.handle);
  }

  getTag(handle: number): ColliderTag | undefined {
    return this.colliderTags.get(handle);
  }

  step(dt: number, onContact?: (ev: CollisionContactEvent) => void): void {
    this.world.timestep = dt;
    this.world.step(this.eventQueue);

    if (onContact) {
      this.eventQueue.drainContactForceEvents((ev) => {
        const h1 = ev.collider1();
        const h2 = ev.collider2();
        onContact({
          colliderA: h1,
          colliderB: h2,
          tagA: this.colliderTags.get(h1),
          tagB: this.colliderTags.get(h2),
          totalForceMagnitude: ev.totalForceMagnitude(),
        });
      });
    } else {
      this.eventQueue.drainContactForceEvents(() => {});
    }
    this.eventQueue.drainCollisionEvents(() => {});
  }

  castRay(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    maxToi: number,
    filterGroups: number,
    excludeBody?: RAPIER.RigidBody
  ): { toi: number; normal: { x: number; y: number; z: number }; collider: RAPIER.Collider } | null {
    const ray = new RAPIER.Ray(origin, dir);
    const groups = makeCollisionGroups(0xffff, filterGroups);
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxToi,
      true,
      undefined,
      groups,
      undefined,
      excludeBody
    );
    if (!hit) return null;
    return {
      toi: hit.timeOfImpact,
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      collider: hit.collider,
    };
  }

  createStaticBox(
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    hz: number,
    tag: ColliderTag,
    group: number = CG.STATIC_WORLD,
    rotY = 0
  ): RAPIER.Collider {
    const colDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setCollisionGroups(makeCollisionGroups(group, CG.PLAYER | CG.TRAFFIC | CG.PROPS_BREAKABLE))
      .setFriction(0.5)
      .setRestitution(0.0);
    if (rotY !== 0) {
      colDesc.setRotation({ x: 0, y: Math.sin(rotY * 0.5), z: 0, w: Math.cos(rotY * 0.5) });
    }
    const col = this.world.createCollider(colDesc, this.staticBody);
    this.registerTag(col, tag);
    return col;
  }

  createStaticTrimesh(
    vertices: Float32Array,
    indices: Uint32Array,
    tag: ColliderTag,
    group: number = CG.GROUND
  ): RAPIER.Collider {
    const colDesc = RAPIER.ColliderDesc.trimesh(vertices, indices)
      .setCollisionGroups(makeCollisionGroups(group, CG.PLAYER | CG.TRAFFIC | CG.PROPS_BREAKABLE))
      .setFriction(0.75)
      .setRestitution(0.0);
    const col = this.world.createCollider(colDesc, this.staticBody);
    this.registerTag(col, tag);
    return col;
  }

  dispose(): void {
    this.eventQueue.free();
    this.world.free();
    this.colliderTags.clear();
  }
}

export { RAPIER };
