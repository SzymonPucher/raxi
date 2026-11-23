import * as THREE from 'three';
import { ArcadeVehicle } from './ArcadeVehicle';

function createTaxiStripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f9c718';
  ctx.fillRect(0, 0, 128, 32);
  for (let x = 0; x < 16; x++) {
    ctx.fillStyle = x % 2 === 0 ? '#111111' : '#ffffff';
    ctx.fillRect(x * 8, 8, 8, 8);
    ctx.fillStyle = x % 2 === 1 ? '#111111' : '#ffffff';
    ctx.fillRect(x * 8, 16, 8, 8);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(3, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTaxiSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff5b8';
  ctx.fillRect(0, 0, 128, 48);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 44);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RAXI', 64, 25);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class VehicleVisual {
  public readonly root = new THREE.Group();
  private readonly bodyTiltGroup = new THREE.Group();
  private readonly wheelPivots: THREE.Group[] = [];
  private readonly wheelMeshes: THREE.Mesh[] = [];
  private readonly brakeLightMat: THREE.MeshBasicMaterial;
  private readonly leftBlinkerMat: THREE.MeshBasicMaterial;
  private readonly rightBlinkerMat: THREE.MeshBasicMaterial;
  private readonly bodyMat: THREE.MeshLambertMaterial;
  private readonly cabinMat: THREE.MeshLambertMaterial;
  private readonly flameLeft: THREE.Mesh;
  private readonly flameRight: THREE.Mesh;
  private blinkerPhase = 0;

  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();

  constructor(private readonly vehicle: ArcadeVehicle) {
    const cfg = vehicle.vehicleStats.config;
    this.root.add(this.bodyTiltGroup);

    const stripeTex = createTaxiStripeTexture();
    const signTex = createTaxiSignTexture();

    this.bodyMat = new THREE.MeshLambertMaterial({ color: 0xffc400 });
    const stripeMat = new THREE.MeshLambertMaterial({ map: stripeTex });
    this.cabinMat = new THREE.MeshLambertMaterial({ color: 0x263238 });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const chromeMat = new THREE.MeshLambertMaterial({ color: 0xd9e1e8 });
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff8cc });
    this.brakeLightMat = new THREE.MeshBasicMaterial({ color: 0x660000 });
    this.leftBlinkerMat = new THREE.MeshBasicMaterial({ color: 0x553300 });
    this.rightBlinkerMat = new THREE.MeshBasicMaterial({ color: 0x553300 });

    // Lower chassis body
    const lowerGeo = new THREE.BoxGeometry(cfg.chassisWidth, 0.68, cfg.chassisLength);
    const lowerMesh = new THREE.Mesh(lowerGeo, this.bodyMat);
    lowerMesh.position.set(0, 0.14, 0);
    lowerMesh.castShadow = true;
    lowerMesh.receiveShadow = true;
    this.bodyTiltGroup.add(lowerMesh);

    // Checkered side strips
    const sideStripGeo = new THREE.BoxGeometry(cfg.chassisWidth + 0.02, 0.22, cfg.chassisLength - 0.5);
    const sideStrip = new THREE.Mesh(sideStripGeo, stripeMat);
    sideStrip.position.set(0, 0.14, 0);
    this.bodyTiltGroup.add(sideStrip);

    // Cabin / greenhouse
    const cabinGeo = new THREE.BoxGeometry(cfg.chassisWidth * 0.86, 0.56, cfg.chassisLength * 0.48);
    const cabinMesh = new THREE.Mesh(cabinGeo, this.cabinMat);
    cabinMesh.position.set(0, 0.72, 0.14);
    cabinMesh.castShadow = true;
    this.bodyTiltGroup.add(cabinMesh);

    // Roof cap (yellow)
    const roofGeo = new THREE.BoxGeometry(cfg.chassisWidth * 0.88, 0.09, cfg.chassisLength * 0.46);
    const roofMesh = new THREE.Mesh(roofGeo, this.bodyMat);
    roofMesh.position.set(0, 1.02, 0.14);
    roofMesh.castShadow = true;
    this.bodyTiltGroup.add(roofMesh);

    // Glowing roof RAXI sign
    const signGeo = new THREE.BoxGeometry(0.76, 0.24, 0.28);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(0, 1.18, 0.08);
    this.bodyTiltGroup.add(signMesh);

    // Front & rear bumpers
    const bumperGeo = new THREE.BoxGeometry(cfg.chassisWidth + 0.08, 0.2, 0.2);
    const frontBumper = new THREE.Mesh(bumperGeo, chromeMat);
    frontBumper.position.set(0, -0.06, -cfg.chassisLength * 0.5 - 0.04);
    this.bodyTiltGroup.add(frontBumper);

    const rearBumper = new THREE.Mesh(bumperGeo, chromeMat);
    rearBumper.position.set(0, -0.06, cfg.chassisLength * 0.5 + 0.04);
    this.bodyTiltGroup.add(rearBumper);

    // Front grill
    const grill = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.26, 0.06), trimMat);
    grill.position.set(0, 0.16, -cfg.chassisLength * 0.5 - 0.01);
    this.bodyTiltGroup.add(grill);

    // Headlights
    const hlGeo = new THREE.BoxGeometry(0.34, 0.18, 0.08);
    for (const side of [-1, 1]) {
      const hl = new THREE.Mesh(hlGeo, headlightMat);
      hl.position.set(side * 0.64, 0.2, -cfg.chassisLength * 0.5 - 0.01);
      this.bodyTiltGroup.add(hl);
    }

    // Brake lights
    const blGeo = new THREE.BoxGeometry(0.42, 0.18, 0.08);
    for (const side of [-1, 1]) {
      const bl = new THREE.Mesh(blGeo, this.brakeLightMat);
      bl.position.set(side * 0.62, 0.22, cfg.chassisLength * 0.5 + 0.01);
      this.bodyTiltGroup.add(bl);
    }

    // Blinkers (front & rear corners)
    const blkGeo = new THREE.BoxGeometry(0.18, 0.14, 0.12);
    for (const zSign of [-1, 1]) {
      const leftB = new THREE.Mesh(blkGeo, this.leftBlinkerMat);
      leftB.position.set(-0.88, 0.14, zSign * (cfg.chassisLength * 0.5 - 0.02));
      this.bodyTiltGroup.add(leftB);

      const rightB = new THREE.Mesh(blkGeo, this.rightBlinkerMat);
      rightB.position.set(0.88, 0.14, zSign * (cfg.chassisLength * 0.5 - 0.02));
      this.bodyTiltGroup.add(rightB);
    }

    // Nitro boost exhaust flames
    const flameGeo = new THREE.ConeGeometry(0.16, 1.1, 6);
    flameGeo.rotateX(Math.PI * 0.5);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x33ddff, transparent: true, opacity: 0.9 });
    this.flameLeft = new THREE.Mesh(flameGeo, flameMat);
    this.flameLeft.position.set(-0.46, -0.04, cfg.chassisLength * 0.5 + 0.6);
    this.flameLeft.visible = false;
    this.bodyTiltGroup.add(this.flameLeft);

    this.flameRight = new THREE.Mesh(flameGeo, flameMat);
    this.flameRight.position.set(0.46, -0.04, cfg.chassisLength * 0.5 + 0.6);
    this.flameRight.visible = false;
    this.bodyTiltGroup.add(this.flameRight);

    // 4 wheels
    const tireGeo = new THREE.CylinderGeometry(cfg.wheelRadius, cfg.wheelRadius, cfg.wheelWidth, 12);
    tireGeo.rotateZ(Math.PI * 0.5);
    const tireMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
    const hubGeo = new THREE.CylinderGeometry(cfg.wheelRadius * 0.56, cfg.wheelRadius * 0.56, cfg.wheelWidth + 0.02, 8);
    hubGeo.rotateZ(Math.PI * 0.5);

    for (const w of vehicle.wheels) {
      const pivot = new THREE.Group();
      pivot.position.copy(w.localMount);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      const hub = new THREE.Mesh(hubGeo, chromeMat);
      tire.add(hub);
      pivot.add(tire);
      this.root.add(pivot);
      this.wheelPivots.push(pivot);
      this.wheelMeshes.push(tire);
    }
  }

  update(alpha: number, dt: number): void {
    this.vehicle.getInterpolatedTransform(alpha, this.tmpPos, this.tmpQuat);
    this.root.position.copy(this.tmpPos);
    this.root.quaternion.copy(this.tmpQuat);

    // Exaggerated body roll & pitch (§5.4)
    this.bodyTiltGroup.rotation.z = this.vehicle.visualRoll;
    this.bodyTiltGroup.rotation.x = this.vehicle.visualPitch;

    // Wheels position (suspension travel), steering, and spin
    const rest = this.vehicle.vehicleStats.config.suspensionRestLength;
    for (let i = 0; i < this.vehicle.wheels.length; i++) {
      const w = this.vehicle.wheels[i];
      const pivot = this.wheelPivots[i];
      const wheelMesh = this.wheelMeshes[i];

      const travelY = w.grounded ? -(rest - w.compression) : -rest;
      pivot.position.set(w.localMount.x, w.localMount.y + travelY, w.localMount.z);
      pivot.rotation.y = w.steerAngle;
      wheelMesh.rotation.x = -w.spinAngle;
    }

    // Brake lights
    this.brakeLightMat.color.setHex(this.vehicle.isBraking ? 0xff1e1e : 0x660000);

    // Blinkers
    this.blinkerPhase += dt * 7.0;
    const blinkOn = Math.sin(this.blinkerPhase * Math.PI) > 0;
    this.leftBlinkerMat.color.setHex(
      this.vehicle.blinker === 'left' && blinkOn ? 0xffaa00 : 0x553300
    );
    this.rightBlinkerMat.color.setHex(
      this.vehicle.blinker === 'right' && blinkOn ? 0xffaa00 : 0x553300
    );

    // Ghost Cab transparency
    const ghostOpacity = this.vehicle.isGhost ? 0.42 : 1.0;
    this.bodyMat.transparent = this.vehicle.isGhost;
    this.bodyMat.opacity = ghostOpacity;
    this.cabinMat.transparent = this.vehicle.isGhost;
    this.cabinMat.opacity = ghostOpacity;

    // Nitro flames
    const showFlame = this.vehicle.isBoosting;
    this.flameLeft.visible = showFlame;
    this.flameRight.visible = showFlame;
    if (showFlame) {
      const flicker = 0.8 + Math.random() * 0.45;
      this.flameLeft.scale.set(1, 1, flicker);
      this.flameRight.scale.set(1, 1, flicker);
    }
  }
}
