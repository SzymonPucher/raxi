import GUI from 'lil-gui';
import * as THREE from 'three';
import { BALANCE } from '../core/config/balance';
import { ALL_PASSENGER_TYPE_IDS, PassengerTypeId } from '../gameplay/Passenger';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ALL_POWERS } from '../powers/PowerRegistry';
import { VehicleConfig } from '../core/config/vehicle';
import { MapDefinition } from '../world/mapData';

export interface DebugActions {
  addTime(s: number): void;
  addCash(n: number): void;
  setCondition(pct: number): void;
  toggleBreak(): void;
  givePower(powerId: string): void;
  spawnPassenger(type: PassengerTypeId): void;
  teleportTo(x: number, y: number, z: number): void;
  setTier(tier: number): void;
  openDraft(): void;
  startShiftWithSeed(seed: number): void;
}

/**
 * ?debug tuning & cheat panel (§14):
 * - Performance stats (FPS, draw calls, triangles)
 * - Live balance readout (§9.7)
 * - Live vehicle parameter sliders
 * - Rapier wireframe & RoadGraph 3D overlay toggles
 * - Full cheat suite (give power, spawn passenger, teleport, +time, +cash, seed)
 */
export class DebugPanel {
  public readonly enabled: boolean;
  private gui: GUI | null = null;
  private physicsLines: THREE.LineSegments | null = null;
  private roadGraphLines: THREE.LineSegments | null = null;

  private readonly metrics = {
    fps: 60,
    drawCalls: 0,
    triangles: 0,
    netTimePerFare: 0,
    avgFareCycle: 0,
    showPhysics: false,
    showRoadGraph: false,
    powerToGive: ALL_POWERS[0].id,
    passengerToSpawn: 'grandma' as PassengerTypeId,
    landmarkTarget: 'raxi_tower',
    tierValue: 0,
    fixedSeed: '2026',
  };

  constructor(
    scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    map: MapDefinition,
    vehicleConfig: VehicleConfig,
    actions: DebugActions
  ) {
    this.enabled =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
    if (!this.enabled) return;

    // Physics wireframe debug mesh
    const physGeo = new THREE.BufferGeometry();
    const physMat = new THREE.LineBasicMaterial({ vertexColors: true });
    this.physicsLines = new THREE.LineSegments(physGeo, physMat);
    this.physicsLines.visible = false;
    this.physicsLines.frustumCulled = false;
    scene.add(this.physicsLines);

    // RoadGraph overlay mesh
    const roadVerts: number[] = [];
    for (const e of map.graph.edges) {
      const a = map.graph.getNode(e.from)!;
      const b = map.graph.getNode(e.to)!;
      roadVerts.push(a.x, a.y + 1.2, a.z, b.x, b.y + 1.2, b.z);
    }
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3));
    this.roadGraphLines = new THREE.LineSegments(
      rGeo,
      new THREE.LineBasicMaterial({ color: 0x00ffaa })
    );
    this.roadGraphLines.visible = false;
    scene.add(this.roadGraphLines);

    const gui = new GUI({ title: 'RAXI DEBUG (?debug)' });
    gui.domElement.style.zIndex = '50';
    this.gui = gui;

    const perfF = gui.addFolder('Performance & Balance');
    perfF.add(this.metrics, 'fps').listen().disable();
    perfF.add(this.metrics, 'drawCalls').listen().disable();
    perfF.add(this.metrics, 'triangles').listen().disable();
    perfF.add(this.metrics, 'netTimePerFare').name('Net s / fare').listen().disable();
    perfF.add(this.metrics, 'avgFareCycle').name('Avg cycle (s)').listen().disable();
    perfF.add(this.metrics, 'showPhysics').name('Rapier Debug Draw').onChange((v: boolean) => {
      if (this.physicsLines) this.physicsLines.visible = v;
    });
    perfF.add(this.metrics, 'showRoadGraph').name('Road Graph Overlay').onChange((v: boolean) => {
      if (this.roadGraphLines) this.roadGraphLines.visible = v;
    });

    const vehF = gui.addFolder('Vehicle Tuning');
    vehF.add(vehicleConfig, 'engineForce', 6000, 30000, 500);
    vehF.add(vehicleConfig, 'topSpeed', 25, 80, 1);
    vehF.add(vehicleConfig, 'baseGrip', 0.3, 0.98, 0.02);
    vehF.add(vehicleConfig, 'handbrakeRearGrip', 0.1, 0.7, 0.02);
    vehF.add(vehicleConfig, 'suspensionStiffness', 15000, 60000, 1000);
    vehF.add(vehicleConfig, 'suspensionDamping', 1500, 10000, 200);
    vehF.add(vehicleConfig, 'driftYawAssist', 0.5, 5.0, 0.1);
    vehF.close();

    const balF = gui.addFolder('Balance');
    balF.add(BALANCE, 'shiftStartTime', 20, 240, 5);
    balF.add(BALANCE, 'deliveryBonusPerMeter', 0.005, 0.06, 0.005);
    balF.close();

    const cheatF = gui.addFolder('Cheats');
    cheatF.add({ fn: () => actions.addTime(30) }, 'fn').name('+30s Time');
    cheatF.add({ fn: () => actions.addCash(500) }, 'fn').name('+$500 Cash');
    cheatF.add({ fn: () => actions.setCondition(20) }, 'fn').name('Damage Car (20%)');
    cheatF.add({ fn: () => actions.setCondition(100) }, 'fn').name('Repair Car (100%)');
    cheatF.add({ fn: () => actions.toggleBreak() }, 'fn').name('Toggle Break Mode');
    cheatF.add({ fn: () => actions.openDraft() }, 'fn').name('Open Draft Now');

    const powerChoices = ALL_POWERS.map((p) => p.id);
    cheatF.add(this.metrics, 'powerToGive', powerChoices).name('Power ID');
    cheatF.add({ fn: () => actions.givePower(this.metrics.powerToGive) }, 'fn').name('Give Power');

    cheatF.add(this.metrics, 'passengerToSpawn', ALL_PASSENGER_TYPE_IDS).name('Passenger');
    cheatF
      .add({ fn: () => actions.spawnPassenger(this.metrics.passengerToSpawn) }, 'fn')
      .name('Spawn Passenger');

    const teleportTargets: Record<string, { x: number; z: number }> = {};
    for (const l of map.landmarks) teleportTargets[l.name] = { x: l.curbX, z: l.curbZ };
    for (const g of map.garages) teleportTargets[`[Garage] ${g.name}`] = { x: g.x, z: g.z };
    const tpNames = Object.keys(teleportTargets);
    this.metrics.landmarkTarget = tpNames[0];
    cheatF.add(this.metrics, 'landmarkTarget', tpNames).name('Teleport To');
    cheatF
      .add(
        {
          fn: () => {
            const pt = teleportTargets[this.metrics.landmarkTarget];
            if (pt) actions.teleportTo(pt.x, map.heightMap.sample(pt.x, pt.z) + 1.5, pt.z);
          },
        },
        'fn'
      )
      .name('Teleport');

    cheatF.add(this.metrics, 'tierValue', 0, 10, 1).name('Tier');
    cheatF.add({ fn: () => actions.setTier(this.metrics.tierValue) }, 'fn').name('Apply Tier');

    cheatF.add(this.metrics, 'fixedSeed').name('Seed');
    cheatF
      .add(
        {
          fn: () => {
            const n = Number(this.metrics.fixedSeed) || 1234;
            actions.startShiftWithSeed(n);
          },
        },
        'fn'
      )
      .name('Start Seeded Shift');
  }

  update(
    fps: number,
    renderer: THREE.WebGLRenderer,
    balance: { netTimePerFare: number; avgFareCycle: number }
  ): void {
    if (!this.enabled) return;
    this.metrics.fps = fps;
    this.metrics.drawCalls = renderer.info.render.calls;
    this.metrics.triangles = renderer.info.render.triangles;
    this.metrics.netTimePerFare = balance.netTimePerFare;
    this.metrics.avgFareCycle = balance.avgFareCycle;

    if (this.physicsLines && this.physicsLines.visible) {
      const buffers = this.physics.world.debugRender();
      this.physicsLines.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(buffers.vertices, 3)
      );
      this.physicsLines.geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 4));
    }
  }

  dispose(): void {
    this.gui?.destroy();
  }
}
