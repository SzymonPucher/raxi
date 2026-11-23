import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/Rng';
import { CG } from '../physics/collisionGroups';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ChunkBuilder, SpatialChunk, updateChunkVisibility } from './Chunks';
import {
  GarageDef,
  LandmarkDef,
  MapDefinition,
  RampDef,
  getDistrictAt,
  getTerrainHeight,
} from './mapData';
import { PropsManager } from './Props';
import { buildTerrain } from './Terrain';
import { CityTextures, createCityTextures } from './textures/ProceduralTextures';

export interface CityBuildResult {
  root: THREE.Group;
  chunks: SpatialChunk[];
  props: PropsManager;
  textures: CityTextures;
  garageBeams: THREE.Mesh[];
  roadWorksBarricades: THREE.Group;
  updateVisibility(playerX: number, playerZ: number, drawDistance: number): void;
  setRoadWorksVisible(edgeIds: string[]): void;
}

const DISTRICT_PALETTES: Record<string, number[]> = {
  downtown: [0x5c7c9c, 0x6f8fa8, 0x8ba3b5, 0x4b6584, 0x95afc0, 0x778ca3],
  residential: [0xf3c6a5, 0xe8b4b8, 0xc8e6c9, 0xffe082, 0xd7ccc8, 0xb3e5fc],
  docks: [0xb86b43, 0x9e5b40, 0xd9822b, 0x7f6a5c, 0xc0573e, 0x8c7b75],
  park: [0x8bc34a],
  outskirts: [0xc2a378, 0xa8926e, 0xb8865b, 0xd4b483],
};

/**
 * Deterministic low-poly 2012-era City Builder (§6.2-6.4):
 * - Roads, bridges, overpass, sidewalks + drivable trimesh colliders
 * - Buildings per block per district merged into 200m chunks
 * - 16 named distinctive Landmarks
 * - 4 Raxi Garages with beams & drivable bays
 * - Jump ramps with hazard stripes
 */
export function buildCity(map: MapDefinition, physics: PhysicsWorld): CityBuildResult {
  const root = new THREE.Group();
  const textures = createCityTextures();
  const rng = new Rng(20120420); // Fixed map seed -> identical city every run

  // 1. Terrain & Ocean/River
  const { group: terrainGroup } = buildTerrain(map, physics);
  root.add(terrainGroup);

  // 2. Roads + Intersections + Overpass + Bridge physics colliders
  const roadGroup = buildRoads(map, textures, physics);
  root.add(roadGroup);

  // 3. ChunkBuilder for static buildings & landmarks
  const chunkBuilder = new ChunkBuilder();
  chunkBuilder.registerMaterial(
    'buildings',
    new THREE.MeshLambertMaterial({
      map: textures.buildingAtlas,
      vertexColors: true,
    })
  );
  chunkBuilder.registerMaterial(
    'landmarks',
    new THREE.MeshLambertMaterial({
      vertexColors: true,
    })
  );

  // 4. Generate deterministic district buildings inside city core blocks
  buildDistrictBuildings(map, chunkBuilder, physics, rng);

  // 5. Build all 16 distinctive Landmarks
  for (const lm of map.landmarks) {
    buildLandmark(lm, chunkBuilder, physics);
  }

  // 6. Build Industrial Shipping Containers in Docks
  buildDocksContainers(map, chunkBuilder, physics, rng);

  const { root: chunkRoot, chunks } = chunkBuilder.build();
  root.add(chunkRoot);

  // 7. Jump Ramps
  const rampsGroup = buildRamps(map.ramps, textures, physics);
  root.add(rampsGroup);

  // 8. 4 Raxi Garages with drivable bays & beams
  const { group: garagesGroup, beams: garageBeams } = buildGarages(map.garages, physics);
  root.add(garagesGroup);

  // 9. Props (instanced trees, lamps + dynamic breakables)
  const props = new PropsManager(map, physics);
  root.add(props.group);

  // 10. Road Works barricades container (populated during Road Works difficulty event)
  const roadWorksBarricades = new THREE.Group();
  root.add(roadWorksBarricades);

  const setRoadWorksVisible = (edgeIds: string[]) => {
    while (roadWorksBarricades.children.length > 0) {
      const child = roadWorksBarricades.children[0];
      roadWorksBarricades.remove(child);
    }
    const barGeo = new THREE.BoxGeometry(10, 1.4, 0.8);
    const barMat = new THREE.MeshLambertMaterial({ map: textures.rampStripes });
    for (const id of edgeIds) {
      const edge = map.graph.edgeMap.get(id);
      if (!edge) continue;
      const a = map.graph.getNode(edge.from)!;
      const b = map.graph.getNode(edge.to)!;
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5 + 0.7;
      const mz = (a.z + b.z) * 0.5;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const mesh = new THREE.Mesh(barGeo, barMat);
      mesh.position.set(mx, my, mz);
      mesh.rotation.y = yaw;
      roadWorksBarricades.add(mesh);
    }
  };

  return {
    root,
    chunks,
    props,
    textures,
    garageBeams,
    roadWorksBarricades,
    updateVisibility(playerX: number, playerZ: number, drawDistance: number) {
      updateChunkVisibility(chunks, playerX, playerZ, drawDistance);
    },
    setRoadWorksVisible,
  };
}

function buildRoads(
  map: MapDefinition,
  textures: CityTextures,
  physics: PhysicsWorld
): THREE.Group {
  const group = new THREE.Group();

  const mat2 = new THREE.MeshLambertMaterial({
    map: textures.asphalt2Lane,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mat4 = new THREE.MeshLambertMaterial({
    map: textures.asphalt4Lane,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const matShortcut = new THREE.MeshLambertMaterial({
    map: textures.shortcutPath,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const matPatch = new THREE.MeshLambertMaterial({
    color: 0x383d42,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  // Bucket road strip geometries by material for merged low-draw-call rendering!
  const geos2: THREE.BufferGeometry[] = [];
  const geos4: THREE.BufferGeometry[] = [];
  const geosShort: THREE.BufferGeometry[] = [];

  // Collect vertices & indices for elevated roads/bridges/overpasses trimesh collider
  const roadVerts: number[] = [];
  const roadIndices: number[] = [];

  const pushQuadCollider = (
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3
  ) => {
    const base = roadVerts.length / 3;
    roadVerts.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
    roadIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (const e of map.graph.edges) {
    const a = map.graph.getNode(e.from)!;
    const b = map.graph.getNode(e.to)!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const horizLen = Math.hypot(dx, dz);
    if (horizLen < 0.5) continue;

    const fullLen = Math.hypot(dx, dy, dz);
    const rx = (-dz / horizLen) * (e.width * 0.5);
    const rz = (dx / horizLen) * (e.width * 0.5);

    const yOff = e.isShortcut ? 0.08 : 0.12;
    const p0 = new THREE.Vector3(a.x - rx, a.y + yOff, a.z - rz);
    const p1 = new THREE.Vector3(a.x + rx, a.y + yOff, a.z + rz);
    const p2 = new THREE.Vector3(b.x + rx, b.y + yOff, b.z + rz);
    const p3 = new THREE.Vector3(b.x - rx, b.y + yOff, b.z - rz);

    // CCW winding facing +Y (upward): (p0, p1, p2) and (p0, p2, p3)
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array([
      p0.x, p0.y, p0.z,
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z,
      p3.x, p3.y, p3.z,
    ]);
    const repeatT = Math.max(1, fullLen / 18);
    const uvs = new Float32Array([0, 0, 1, 0, 1, repeatT, 0, repeatT]);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();

    if (e.isShortcut) geosShort.push(geo);
    else if (e.lanesPerDir >= 2) geos4.push(geo);
    else geos2.push(geo);

    // Add crisp physics road surface for ALL road strips (only ~440 tris total) so wheels ride flush with asphalt!
    pushQuadCollider(p0, p1, p2, p3);
  }

  const addMergedRoad = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (geos.length === 0) return;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  addMergedRoad(geos2, mat2);
  addMergedRoad(geos4, mat4);
  addMergedRoad(geosShort, matShortcut);

  // Intersection square patches so road crossings look seamless
  const patchGeo = new THREE.PlaneGeometry(16.8, 16.8);
  patchGeo.rotateX(-Math.PI * 0.5);
  const patchNodes = Array.from(map.graph.nodes.values()).filter((n) => n.y < 0.2);
  const patches = new THREE.InstancedMesh(patchGeo, matPatch, patchNodes.length);
  patches.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < patchNodes.length; i++) {
    const n = patchNodes[i];
    dummy.position.set(n.x, n.y + 0.13, n.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    patches.setMatrixAt(i, dummy.matrix);
  }
  group.add(patches);

  if (roadVerts.length > 0) {
    physics.createStaticTrimesh(
      new Float32Array(roadVerts),
      new Uint32Array(roadIndices),
      { kind: 'ground' },
      CG.GROUND
    );
  }

  return group;
}

function buildDistrictBuildings(
  map: MapDefinition,
  chunks: ChunkBuilder,
  physics: PhysicsWorld,
  rng: Rng
): void {
  const blockCenters = [-450, -350, -250, -150, -50, 50, 150, 250, 350, 450];

  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      // Skip Central Park
      if (
        bx >= map.parkBounds.minX &&
        bx <= map.parkBounds.maxX &&
        bz >= map.parkBounds.minZ &&
        bz <= map.parkBounds.maxZ
      ) {
        continue;
      }
      // Skip blocks containing a landmark
      if (map.landmarks.some((l) => Math.abs(l.x - bx) < 48 && Math.abs(l.z - bz) < 48)) continue;
      // Skip blocks containing a garage or ramp
      if (map.garages.some((g) => Math.hypot(g.x - bx, g.z - bz) < 46)) continue;
      if (map.ramps.some((r) => Math.hypot(r.x - bx, r.z - bz) < 35)) continue;

      const district = getDistrictAt(bx, bz);
      const palette = DISTRICT_PALETTES[district] ?? DISTRICT_PALETTES.downtown;

      if (district === 'downtown') {
        // 2-4 tall towers per block (40-130m)
        const offsets = [
          [-18, -18],
          [18, -18],
          [-18, 18],
          [18, 18],
        ];
        for (const [ox, oz] of offsets) {
          if (rng.chance(0.14)) continue; // occasional open plaza
          const px = bx + ox;
          const pz = bz + oz;
          const w = rng.range(22, 31);
          const d = rng.range(22, 31);
          const h = rng.range(36, 118);
          const color = rng.pick(palette);

          const geo = new THREE.BoxGeometry(w, h, d);
          scaleUVs(geo, w / 14, h / 14);
          geo.translate(px, h * 0.5, pz);
          chunks.addGeometry(px, pz, 'buildings', geo, color);
          geo.dispose();

          // Rooftop AC/penthouse clutter
          const cap = new THREE.BoxGeometry(w * 0.45, rng.range(2.5, 6), d * 0.45);
          cap.translate(px, h + 2, pz);
          chunks.addGeometry(px, pz, 'landmarks', cap, 0x455a64);
          cap.dispose();

          physics.createStaticBox(px, h * 0.5, pz, w * 0.5, h * 0.5, d * 0.5, { kind: 'building' });
        }
      } else if (district === 'residential') {
        // 4 small 2-3 story pastel houses with pitched roofs
        const offsets = [
          [-20, -20],
          [20, -20],
          [-20, 20],
          [20, 20],
        ];
        for (const [ox, oz] of offsets) {
          const px = bx + ox + rng.range(-3, 3);
          const pz = bz + oz + rng.range(-3, 3);
          const w = rng.range(14, 20);
          const d = rng.range(14, 19);
          const h = rng.range(7, 13);
          const color = rng.pick(palette);

          const geo = new THREE.BoxGeometry(w, h, d);
          scaleUVs(geo, w / 12, h / 9);
          geo.translate(px, h * 0.5, pz);
          chunks.addGeometry(px, pz, 'buildings', geo, color);
          geo.dispose();

          const roof = new THREE.ConeGeometry(Math.max(w, d) * 0.72, 4.2, 4);
          roof.rotateY(Math.PI * 0.25);
          roof.translate(px, h + 2.1, pz);
          chunks.addGeometry(px, pz, 'landmarks', roof, rng.pick([0x8d4e3c, 0x5d4037, 0x455a64]));
          roof.dispose();

          physics.createStaticBox(px, h * 0.5, pz, w * 0.5, h * 0.5, d * 0.5, { kind: 'building' });
        }
      } else if (district === 'docks') {
        // Warehouses & open drift lots
        if (rng.chance(0.32)) continue; // Leave open lots for drifting!
        const w = rng.range(38, 62);
        const d = rng.range(24, 38);
        const h = rng.range(11, 19);
        const color = rng.pick(palette);

        const geo = new THREE.BoxGeometry(w, h, d);
        scaleUVs(geo, w / 18, h / 10);
        geo.translate(bx, h * 0.5, bz);
        chunks.addGeometry(bx, bz, 'buildings', geo, color);
        geo.dispose();

        physics.createStaticBox(bx, h * 0.5, bz, w * 0.5, h * 0.5, d * 0.5, { kind: 'building' });
      }
    }
  }
}

function buildDocksContainers(
  map: MapDefinition,
  chunks: ChunkBuilder,
  physics: PhysicsWorld,
  rng: Rng
): void {
  const containerColors = [0xd84315, 0x1565c0, 0x2e7d32, 0xf9a825, 0x6a1b9a];
  const spots = [
    [250, 50],
    [350, 150],
    [450, 50],
    [450, 350],
    [250, 350],
  ];
  for (const [cx, cz] of spots) {
    if (map.landmarks.some((l) => Math.hypot(l.x - cx, l.z - cz) < 42)) continue;
    for (let k = 0; k < 3; k++) {
      const px = cx + (k - 1) * 10;
      const pz = cz + rng.range(-12, 12);
      const geo = new THREE.BoxGeometry(3.2, 3.2, 9.5);
      geo.translate(px, 1.6, pz);
      chunks.addGeometry(px, pz, 'landmarks', geo, rng.pick(containerColors));
      geo.dispose();
      physics.createStaticBox(px, 1.6, pz, 1.6, 1.6, 4.75, { kind: 'building' });
    }
  }
}

function buildLandmark(lm: LandmarkDef, chunks: ChunkBuilder, physics: PhysicsWorld): void {
  const baseY = Math.max(0, getTerrainHeight(lm.x, lm.z));
  const addBox = (
    ox: number,
    oy: number,
    oz: number,
    w: number,
    h: number,
    d: number,
    color: number,
    mat: 'buildings' | 'landmarks' = 'landmarks'
  ) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (mat === 'buildings') scaleUVs(geo, w / 14, h / 14);
    geo.translate(lm.x + ox, baseY + oy, lm.z + oz);
    chunks.addGeometry(lm.x, lm.z, mat, geo, color);
    geo.dispose();
  };

  if (lm.style === 'tower') {
    // Raxi Tower: stepped skyscraper + yellow glowing crown + spire!
    addBox(0, lm.height * 0.35, 0, lm.footprintW, lm.height * 0.7, lm.footprintD, lm.color, 'buildings');
    addBox(0, lm.height * 0.82, 0, lm.footprintW * 0.68, lm.height * 0.28, lm.footprintD * 0.68, lm.color, 'buildings');
    addBox(0, lm.height * 0.98, 0, lm.footprintW * 0.5, 6, lm.footprintD * 0.5, lm.accentColor, 'landmarks');
    addBox(0, lm.height + 14, 0, 3, 28, 3, 0xffffff, 'landmarks');
  } else if (lm.style === 'lighthouse') {
    // Red & white striped lighthouse cylinder
    for (let s = 0; s < 5; s++) {
      const cyl = new THREE.CylinderGeometry(7 - s * 0.9, 8 - s * 0.9, 9, 10);
      cyl.translate(lm.x, baseY + 4.5 + s * 9, lm.z);
      chunks.addGeometry(lm.x, lm.z, 'landmarks', cyl, s % 2 === 0 ? lm.color : lm.accentColor);
      cyl.dispose();
    }
    addBox(0, 48, 0, 5, 5, 5, 0xffee58);
  } else if (lm.style === 'stadium') {
    // Oval bowl
    const ring = new THREE.CylinderGeometry(34, 28, lm.height, 14);
    ring.translate(lm.x, baseY + lm.height * 0.5, lm.z);
    chunks.addGeometry(lm.x, lm.z, 'landmarks', ring, lm.color);
    ring.dispose();
    const trim = new THREE.CylinderGeometry(35, 35, 4, 14);
    trim.translate(lm.x, baseY + lm.height + 1, lm.z);
    chunks.addGeometry(lm.x, lm.z, 'landmarks', trim, lm.accentColor);
    trim.dispose();
  } else if (lm.style === 'hospital') {
    addBox(0, lm.height * 0.5, 0, lm.footprintW, lm.height, lm.footprintD, lm.color, 'buildings');
    // Giant red cross on top
    addBox(0, lm.height + 2.5, 0, 18, 4, 5, lm.accentColor);
    addBox(0, lm.height + 2.5, 0, 5, 4, 18, lm.accentColor);
  } else {
    addBox(0, lm.height * 0.5, 0, lm.footprintW, lm.height, lm.footprintD, lm.color, 'buildings');
    addBox(0, lm.height + 2.5, 0, lm.footprintW * 0.72, 5, lm.footprintD * 0.72, lm.accentColor, 'landmarks');
  }

  physics.createStaticBox(
    lm.x,
    baseY + lm.height * 0.5,
    lm.z,
    lm.footprintW * 0.5,
    lm.height * 0.5,
    lm.footprintD * 0.5,
    { kind: 'building' }
  );
}

function buildRamps(
  ramps: RampDef[],
  textures: CityTextures,
  physics: PhysicsWorld
): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ map: textures.rampStripes });

  for (const r of ramps) {
    const baseY = Math.max(0, getTerrainHeight(r.x, r.z));
    const hw = r.width * 0.5;
    const hl = r.length * 0.5;
    const h = r.height;

    // Wedge geometry sloping up from +Z (ground) to -Z (height h)
    const verts = new Float32Array([
      // Bottom 4
      -hw, 0, hl,
      hw, 0, hl,
      hw, 0, -hl,
      -hw, 0, -hl,
      // Top back 2
      hw, h, -hl,
      -hw, h, -hl,
    ]);
    const indices = new Uint32Array([
      // Slope surface
      0, 1, 4, 0, 4, 5,
      // Back vertical face
      2, 3, 5, 2, 5, 4,
      // Left side
      3, 0, 5,
      // Right side
      1, 2, 4,
      // Bottom
      0, 3, 2, 0, 2, 1,
    ]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1]);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(r.x, baseY, r.z);
    mesh.rotation.y = r.yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Transform wedge vertices into world space for crisp Rapier trimesh ramp collider
    const worldVerts = new Float32Array(verts.length);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.yaw);
    const v = new THREE.Vector3();
    for (let i = 0; i < verts.length; i += 3) {
      v.set(verts[i], verts[i + 1], verts[i + 2]).applyQuaternion(q);
      worldVerts[i] = v.x + r.x;
      worldVerts[i + 1] = v.y + baseY;
      worldVerts[i + 2] = v.z + r.z;
    }
    physics.createStaticTrimesh(worldVerts, indices, { kind: 'ground' }, CG.GROUND);
  }

  return group;
}

function buildGarages(
  garages: GarageDef[],
  physics: PhysicsWorld
): { group: THREE.Group; beams: THREE.Mesh[] } {
  const group = new THREE.Group();
  const beams: THREE.Mesh[] = [];

  const wallMat = new THREE.MeshLambertMaterial({ color: 0x37474f });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xffc400 });
  const padMat = new THREE.MeshBasicMaterial({ color: 0x00e676, transparent: true, opacity: 0.45 });
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  for (const g of garages) {
    const baseY = Math.max(0, getTerrainHeight(g.x, g.z));
    const gGroup = new THREE.Group();
    gGroup.position.set(g.x, baseY, g.z);
    gGroup.rotation.y = g.yaw;

    // Open-front canopy with 2 side pillars + yellow roof so the player can drive straight into the bay!
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.5, 11), wallMat);
    leftWall.position.set(-6.5, 2.75, 0);
    gGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.5, 11), wallMat);
    rightWall.position.set(6.5, 2.75, 0);
    gGroup.add(rightWall);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(15, 1.3, 12.5), roofMat);
    roof.position.set(0, 6.1, 0);
    gGroup.add(roof);

    // Glowing floor pad
    const pad = new THREE.Mesh(new THREE.RingGeometry(4.2, 5.8, 24), padMat);
    pad.rotation.x = -Math.PI * 0.5;
    pad.position.y = 0.14;
    gGroup.add(pad);

    // Tall garage beam visible from across the city (§8.5)
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.8, 120, 12, 1, true), beamMat);
    beam.position.y = 60;
    gGroup.add(beam);
    beams.push(beam);

    group.add(gGroup);

    // Side wall colliders (bay center stays open & drivable!)
    const cos = Math.cos(g.yaw);
    const sin = Math.sin(g.yaw);
    for (const sx of [-6.5, 6.5]) {
      const wx = g.x + sx * cos;
      const wz = g.z - sx * sin;
      physics.createStaticBox(wx, baseY + 2.75, wz, 0.6, 2.75, 5.5, { kind: 'building' }, CG.STATIC_WORLD, g.yaw);
    }
  }

  return { group, beams };
}

function scaleUVs(geo: THREE.BufferGeometry, su: number, sv: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
}
