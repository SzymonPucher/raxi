import * as THREE from 'three';

/**
 * Big Crazy-Taxi-style 3D floating navigation arrow above the car (§8.4).
 * Points along the A* route toward the next waypoint (or nearest passenger / garage).
 */
export class NavArrow3D {
  public readonly root = new THREE.Group();
  private readonly arrowMesh: THREE.Group;
  private readonly mat: THREE.MeshLambertMaterial;
  private currentYaw = 0;

  constructor() {
    this.arrowMesh = new THREE.Group();
    this.mat = new THREE.MeshLambertMaterial({ color: 0x00e676, emissive: 0x004d25 });

    // Shaft
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 1.35), this.mat);
    shaft.position.set(0, 0, 0.45);
    // Arrowhead pointing along -Z
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.68, 1.25, 4), this.mat);
    head.rotation.x = -Math.PI * 0.5;
    head.rotation.z = Math.PI * 0.25;
    head.position.set(0, 0, -0.75);

    this.arrowMesh.add(shaft, head);
    this.root.add(this.arrowMesh);
  }

  update(params: {
    carPos: THREE.Vector3;
    targetX: number;
    targetZ: number;
    colorHex: number;
    visible: boolean;
    timeSec: number;
    dt: number;
  }): void {
    this.root.visible = params.visible;
    if (!params.visible) return;

    this.mat.color.setHex(params.colorHex);
    this.mat.emissive.setHex(params.colorHex).multiplyScalar(0.32);

    this.root.position.set(
      params.carPos.x,
      params.carPos.y + 3.05 + Math.sin(params.timeSec * 5.0) * 0.14,
      params.carPos.z
    );

    const dx = params.targetX - params.carPos.x;
    const dz = params.targetZ - params.carPos.z;
    if (dx * dx + dz * dz > 0.25) {
      const targetYaw = Math.atan2(-dx, -dz);
      let diff = targetYaw - this.currentYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.currentYaw += diff * Math.min(1, params.dt * 12);
    }
    this.arrowMesh.rotation.y = this.currentYaw;
  }
}
