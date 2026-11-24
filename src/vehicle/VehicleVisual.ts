import * as THREE from 'three';
import { ArcadeVehicle } from './ArcadeVehicle';

function createTaxiStripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f9c718';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 4, 128, 2);
  ctx.fillRect(0, 26, 128, 2);
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
  canvas.width = 160;
  canvas.height = 56;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff5b8';
  ctx.fillRect(0, 0, 160, 56);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, 154, 50);
  ctx.fillStyle = '#111';
  ctx.font = '900 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TAXI', 80, 29);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPlateTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(0, 0, 128, 48);
  ctx.fillStyle = '#1565c0';
  ctx.fillRect(0, 0, 128, 11);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 124, 44);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 30);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Extrudes a 2D side silhouette (Z forward-to-back as X, height as Y) across vehicle width.
 */
function extrudeSideProfile(points: Array<[number, number]>, width: number, bevel = 0.07): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();

  const innerW = Math.max(0.1, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerW,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 4,
  });
  // Extrusion is along +Z; rotateY(-PI/2) maps shape +X -> +Z (front/rear) and extrusion depth -> -X..+X
  geo.translate(0, 0, -innerW * 0.5);
  geo.rotateY(-Math.PI * 0.5);
  geo.computeVertexNormals();
  return geo;
}

/**
 * GTA San Andreas / IV-inspired sculpted "Yellow Classic" taxi visual (§5.4).
 */
export class VehicleVisual {
  public readonly root = new THREE.Group();
  private readonly bodyTiltGroup = new THREE.Group();
  private readonly wheelPivots: THREE.Group[] = [];
  private readonly wheelMeshes: THREE.Group[] = [];
  private readonly brakeLightMat: THREE.MeshBasicMaterial;
  private readonly leftBlinkerMat: THREE.MeshBasicMaterial;
  private readonly rightBlinkerMat: THREE.MeshBasicMaterial;
  private readonly bodyMat: THREE.MeshPhongMaterial;
  private readonly glassMat: THREE.MeshPhongMaterial;
  private readonly flameLeft: THREE.Mesh;
  private readonly flameRight: THREE.Mesh;
  private readonly flameMat: THREE.MeshBasicMaterial;
  private blinkerPhase = 0;

  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();

  constructor(private readonly vehicle: ArcadeVehicle) {
    const cfg = vehicle.vehicleStats.config;
    const hw = cfg.chassisWidth * 0.5;
    const hl = cfg.chassisLength * 0.5;
    this.root.add(this.bodyTiltGroup);

    const stripeTex = createTaxiStripeTexture();
    const signTex = createTaxiSignTexture();
    const plateTex = createPlateTexture('RAXI-01');

    this.bodyMat = new THREE.MeshPhongMaterial({
      color: 0xffc400,
      specular: 0x665522,
      shininess: 60,
    });
    const bodyDarkMat = new THREE.MeshPhongMaterial({
      color: 0xdca400,
      specular: 0x443311,
      shininess: 35,
    });
    const stripeMat = new THREE.MeshPhongMaterial({
      map: stripeTex,
      specular: 0x333333,
      shininess: 30,
    });
    this.glassMat = new THREE.MeshPhongMaterial({
      color: 0x1b2b38,
      specular: 0x99ccff,
      shininess: 110,
    });
    const trimMat = new THREE.MeshPhongMaterial({ color: 0x1e2228, specular: 0x222222, shininess: 20 });
    const chromeMat = new THREE.MeshPhongMaterial({ color: 0xdde5ec, specular: 0xffffff, shininess: 120 });
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff8d2 });
    const reverseMat = new THREE.MeshBasicMaterial({ color: 0xe8f0f8 });
    this.brakeLightMat = new THREE.MeshBasicMaterial({ color: 0x770000 });
    this.leftBlinkerMat = new THREE.MeshBasicMaterial({ color: 0x553300 });
    this.rightBlinkerMat = new THREE.MeshBasicMaterial({ color: 0x553300 });
    const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });

    // 1. Sculpted lower body silhouette (sloped nose, flat hood, beltline, rear deck)
    const lowerGeo = extrudeSideProfile(
      [
        [-hl + 0.08, -0.14], // front lower chin
        [-hl, 0.14], // front nose
        [-hl + 0.12, 0.36], // front hood lip
        [-0.78, 0.44], // base of windshield
        [1.15, 0.46], // rear decklid start
        [hl - 0.08, 0.4], // trunk lip
        [hl, 0.18], // rear tail
        [hl - 0.08, -0.14], // rear lower valance
      ],
      cfg.chassisWidth,
      0.07
    );
    const lowerMesh = new THREE.Mesh(lowerGeo, this.bodyMat);
    lowerMesh.castShadow = true;
    lowerMesh.receiveShadow = true;
    this.bodyTiltGroup.add(lowerMesh);

    // 2. Sculpted cabin greenhouse (sloped windshield + roof + sloped rear glass)
    const cabinGeo = extrudeSideProfile(
      [
        [-0.92, 0.38], // windshield base
        [-0.42, 0.96], // windshield top
        [0.74, 0.96], // roof rear
        [1.26, 0.4], // rear glass base
      ],
      cfg.chassisWidth * 0.84,
      0.05
    );
    const cabinMesh = new THREE.Mesh(cabinGeo, this.glassMat);
    cabinMesh.castShadow = true;
    this.bodyTiltGroup.add(cabinMesh);

    // Roof panel + pillars framing the glass
    const roofGeo = extrudeSideProfile(
      [
        [-0.44, 0.93],
        [-0.36, 1.03],
        [0.68, 1.03],
        [0.78, 0.93],
      ],
      cfg.chassisWidth * 0.82,
      0.04
    );
    const roofMesh = new THREE.Mesh(roofGeo, this.bodyMat);
    roofMesh.castShadow = true;
    this.bodyTiltGroup.add(roofMesh);

    // A-pillars, B-pillars, C-pillars
    const bPillarGeo = new THREE.BoxGeometry(cfg.chassisWidth * 0.855, 0.54, 0.14);
    const bPillar = new THREE.Mesh(bPillarGeo, this.bodyMat);
    bPillar.position.set(0, 0.67, 0.16);
    this.bodyTiltGroup.add(bPillar);

    // Hood center power bulge & fender arches
    const hoodBulge = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.07, 1.15), bodyDarkMat);
    hoodBulge.position.set(0, 0.44, -1.48);
    this.bodyTiltGroup.add(hoodBulge);

    // Wheel arch flares (4 fenders)
    const archGeo = new THREE.BoxGeometry(0.11, 0.24, 0.96);
    for (const sx of [-1, 1]) {
      for (const sz of [-cfg.wheelBaseHalfZ, cfg.wheelBaseHalfZ]) {
        const arch = new THREE.Mesh(archGeo, trimMat);
        arch.position.set(sx * (hw - 0.02), 0.04, sz);
        this.bodyTiltGroup.add(arch);
      }
    }

    // Checkered taxi side stripes & chrome door handles & side mirrors
    const sideStripGeo = new THREE.BoxGeometry(cfg.chassisWidth + 0.025, 0.18, cfg.chassisLength - 0.65);
    const sideStrip = new THREE.Mesh(sideStripGeo, stripeMat);
    sideStrip.position.set(0, 0.17, 0.02);
    this.bodyTiltGroup.add(sideStrip);

    const mirrorGeo = new THREE.BoxGeometry(0.22, 0.12, 0.15);
    const handleGeo = new THREE.BoxGeometry(0.05, 0.05, 0.18);
    for (const sx of [-1, 1]) {
      const mirror = new THREE.Mesh(mirrorGeo, this.bodyMat);
      mirror.position.set(sx * (hw + 0.08), 0.5, -0.58);
      this.bodyTiltGroup.add(mirror);

      const h1 = new THREE.Mesh(handleGeo, chromeMat);
      h1.position.set(sx * (hw + 0.01), 0.34, -0.1);
      const h2 = new THREE.Mesh(handleGeo, chromeMat);
      h2.position.set(sx * (hw + 0.01), 0.34, 0.62);
      this.bodyTiltGroup.add(h1, h2);
    }

    // 3. Glowing beveled roof TAXI light sign
    const signBase = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.07, 0.34), trimMat);
    signBase.position.set(0, 1.06, 0.12);
    const signMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.24, 0.28),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    signMesh.position.set(0, 1.2, 0.12);
    this.bodyTiltGroup.add(signBase, signMesh);

    // 4. Sculpted Chrome/Trim Bumpers + License Plates + Exhausts
    const bumperGeo = new THREE.BoxGeometry(cfg.chassisWidth + 0.1, 0.2, 0.22);
    const frontBumper = new THREE.Mesh(bumperGeo, chromeMat);
    frontBumper.position.set(0, -0.04, -hl - 0.03);
    const frontRubber = new THREE.Mesh(new THREE.BoxGeometry(cfg.chassisWidth + 0.12, 0.08, 0.24), trimMat);
    frontRubber.position.set(0, -0.04, -hl - 0.04);

    const rearBumper = new THREE.Mesh(bumperGeo, chromeMat);
    rearBumper.position.set(0, -0.04, hl + 0.03);
    const rearRubber = new THREE.Mesh(new THREE.BoxGeometry(cfg.chassisWidth + 0.12, 0.08, 0.24), trimMat);
    rearRubber.position.set(0, -0.04, hl + 0.04);
    this.bodyTiltGroup.add(frontBumper, frontRubber, rearBumper, rearRubber);

    const plateGeo = new THREE.PlaneGeometry(0.42, 0.16);
    const frontPlate = new THREE.Mesh(plateGeo, plateMat);
    frontPlate.position.set(0, -0.03, -hl - 0.165);
    frontPlate.rotation.y = Math.PI;
    const rearPlate = new THREE.Mesh(plateGeo, plateMat);
    rearPlate.position.set(0, 0.18, hl + 0.02);
    this.bodyTiltGroup.add(frontPlate, rearPlate);

    // Dual chrome exhaust pipes
    const pipeGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.26, 8);
    pipeGeo.rotateX(Math.PI * 0.5);
    for (const sx of [-0.52, 0.52]) {
      const pipe = new THREE.Mesh(pipeGeo, chromeMat);
      pipe.position.set(sx, -0.14, hl + 0.08);
      this.bodyTiltGroup.add(pipe);
    }

    // Front recessed grille + headlights + fog lamps
    const grilleFrame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.26, 0.08), chromeMat);
    grilleFrame.position.set(0, 0.18, -hl - 0.01);
    const grilleInner = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.19, 0.09), trimMat);
    grilleInner.position.set(0, 0.18, -hl - 0.02);
    this.bodyTiltGroup.add(grilleFrame, grilleInner);

    const hlGeo = new THREE.BoxGeometry(0.36, 0.18, 0.08);
    const fogGeo = new THREE.BoxGeometry(0.22, 0.09, 0.08);
    for (const side of [-1, 1]) {
      const hl = new THREE.Mesh(hlGeo, headlightMat);
      hl.position.set(side * 0.68, 0.2, -hl - 0.01);
      const fog = new THREE.Mesh(fogGeo, headlightMat);
      fog.position.set(side * 0.55, -0.11, -hl - 0.06);
      this.bodyTiltGroup.add(hl, fog);
    }

    // Rear tail-light clusters (red brake + white reverse + amber corner blinkers)
    const blGeo = new THREE.BoxGeometry(0.44, 0.18, 0.08);
    const revGeo = new THREE.BoxGeometry(0.14, 0.14, 0.085);
    const blkGeo = new THREE.BoxGeometry(0.18, 0.15, 0.12);
    for (const side of [-1, 1]) {
      const bl = new THREE.Mesh(blGeo, this.brakeLightMat);
      bl.position.set(side * 0.62, 0.22, hl + 0.01);
      const rev = new THREE.Mesh(revGeo, reverseMat);
      rev.position.set(side * 0.34, 0.22, hl + 0.015);
      this.bodyTiltGroup.add(bl, rev);
    }
    for (const zSign of [-1, 1]) {
      const leftB = new THREE.Mesh(blkGeo, this.leftBlinkerMat);
      leftB.position.set(-hw + 0.02, 0.2, zSign * (hl - 0.04));
      const rightB = new THREE.Mesh(blkGeo, this.rightBlinkerMat);
      rightB.position.set(hw - 0.02, 0.2, zSign * (hl - 0.04));
      this.bodyTiltGroup.add(leftB, rightB);
    }

    // Nitro boost & drift-exit exhaust flames
    const flameGeo = new THREE.ConeGeometry(0.15, 1.15, 8);
    flameGeo.rotateX(Math.PI * 0.5);
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0x33ddff, transparent: true, opacity: 0.85 });
    this.flameLeft = new THREE.Mesh(flameGeo, this.flameMat);
    this.flameLeft.position.set(-0.52, -0.12, hl + 0.65);
    this.flameLeft.visible = false;
    this.flameRight = new THREE.Mesh(flameGeo, this.flameMat);
    this.flameRight.position.set(0.52, -0.12, hl + 0.65);
    this.flameRight.visible = false;
    this.bodyTiltGroup.add(this.flameLeft, this.flameRight);

    // 5. 16-segment sculpted wheels with recessed alloy rims & 5 spokes
    const tireGeo = new THREE.CylinderGeometry(cfg.wheelRadius, cfg.wheelRadius, cfg.wheelWidth, 16);
    tireGeo.rotateZ(Math.PI * 0.5);
    const tireMat = new THREE.MeshPhongMaterial({ color: 0x191b1e, specular: 0x222222, shininess: 15 });
    const rimGeo = new THREE.CylinderGeometry(cfg.wheelRadius * 0.62, cfg.wheelRadius * 0.62, cfg.wheelWidth + 0.02, 14);
    rimGeo.rotateZ(Math.PI * 0.5);
    const hubCapGeo = new THREE.CylinderGeometry(cfg.wheelRadius * 0.24, cfg.wheelRadius * 0.24, cfg.wheelWidth + 0.04, 10);
    hubCapGeo.rotateZ(Math.PI * 0.5);
    const spokeGeo = new THREE.BoxGeometry(cfg.wheelWidth + 0.03, cfg.wheelRadius * 1.05, 0.065);

    for (const w of vehicle.wheels) {
      const pivot = new THREE.Group();
      pivot.position.copy(w.localMount);
      const wheelGroup = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, chromeMat);
      const cap = new THREE.Mesh(hubCapGeo, trimMat);
      wheelGroup.add(tire, rim, cap);
      // 3 crossed spokes -> 6-spoke star alloy wheel
      for (let s = 0; s < 3; s++) {
        const spoke = new THREE.Mesh(spokeGeo, trimMat);
        spoke.rotation.x = (s * Math.PI) / 3;
        wheelGroup.add(spoke);
      }
      pivot.add(wheelGroup);
      this.root.add(pivot);
      this.wheelPivots.push(pivot);
      this.wheelMeshes.push(wheelGroup);
    }
  }

  update(alpha: number, dt: number): void {
    this.vehicle.getInterpolatedTransform(alpha, this.tmpPos, this.tmpQuat);
    this.root.position.copy(this.tmpPos);
    this.root.quaternion.copy(this.tmpQuat);

    this.bodyTiltGroup.rotation.z = this.vehicle.visualRoll;
    this.bodyTiltGroup.rotation.x = this.vehicle.visualPitch;
    // Subtle low-slung planted stance squat while in Drift Mode
    this.bodyTiltGroup.position.y = -this.vehicle.driftBlend * 0.055;

    const rest = this.vehicle.vehicleStats.config.suspensionRestLength;
    for (let i = 0; i < this.vehicle.wheels.length; i++) {
      const w = this.vehicle.wheels[i];
      const pivot = this.wheelPivots[i];
      const wheelMesh = this.wheelMeshes[i];

      const travelY = w.grounded ? -(rest - w.compression) : -rest;
      pivot.position.set(w.localMount.x, w.localMount.y + travelY, w.localMount.z);
      pivot.rotation.y = w.isFront ? this.vehicle.visualWheelSteerAngle : 0;
      wheelMesh.rotation.x = -w.spinAngle;
    }

    this.brakeLightMat.color.setHex(this.vehicle.isBraking ? 0xff1e1e : 0x770000);

    this.blinkerPhase += dt * 7.0;
    const blinkOn = Math.sin(this.blinkerPhase * Math.PI) > 0;
    this.leftBlinkerMat.color.setHex(
      this.vehicle.blinker === 'left' && blinkOn ? 0xffaa00 : 0x553300
    );
    this.rightBlinkerMat.color.setHex(
      this.vehicle.blinker === 'right' && blinkOn ? 0xffaa00 : 0x553300
    );

    const ghostOpacity = this.vehicle.isGhost ? 0.42 : 1.0;
    this.bodyMat.transparent = this.vehicle.isGhost;
    this.bodyMat.opacity = ghostOpacity;
    this.glassMat.transparent = this.vehicle.isGhost;
    this.glassMat.opacity = ghostOpacity;

    const showNitro = this.vehicle.isBoosting;
    const showExitSurge = !showNitro && this.vehicle.driftExitBoostTimer > 0 && !this.vehicle.isDriftMode;
    const showFlame = showNitro || showExitSurge;
    this.flameLeft.visible = showFlame;
    this.flameRight.visible = showFlame;
    if (showFlame) {
      this.flameMat.color.setHex(showNitro ? 0x33ddff : 0xffaa22);
      const scaleMult = showNitro ? 1.0 : 0.65;
      const flicker = (0.8 + Math.random() * 0.45) * scaleMult;
      this.flameLeft.scale.set(scaleMult, scaleMult, flicker);
      this.flameRight.scale.set(scaleMult, scaleMult, flicker);
    }
  }
}
