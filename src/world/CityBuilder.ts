import * as THREE from 'three';
import { Rng } from '../core/Rng';
import { CG } from '../physics/collisionGroups';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ChunkBuilder, SpatialChunk, updateChunkVisibility } from './Chunks';
import {
  CustomBuildingDef,
  GarageDef,
  LandmarkDef,
  LandmarkFootprintPart,
  MapDefinition,
  RampDef,
  getDistrictAt,
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
 * Procedural European / Silesian facade atlas (warm neutral plaster base so vertex colors
 * tint cleanly into Silesian ochre, terracotta, pastel, PRL concrete, and red brick,
 * with crisp framed vertical sash windows and subtle story cornices).
 */
function createPolishFacadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Warm neutral plaster base
  ctx.fillStyle = '#efeae2';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle plaster micro-variation
  for (let i = 0; i < 420; i++) {
    const x = (i * 67) % 256;
    const y = (i * 113) % 256;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)';
    ctx.fillRect(x, y, 4, 4);
  }

  // Horizontal story stringcourse / cornice lines (4 stories per tile)
  for (let row = 0; row < 4; row++) {
    const y0 = row * 64;
    ctx.fillStyle = 'rgba(255, 252, 245, 0.55)';
    ctx.fillRect(0, y0, 256, 4);
    ctx.fillStyle = 'rgba(40, 35, 30, 0.14)';
    ctx.fillRect(0, y0 + 4, 256, 2);

    // 4 classic European tall rectangular windows per row
    for (let col = 0; col < 4; col++) {
      const wx = col * 64 + 16;
      const wy = y0 + 13;
      const ww = 32;
      const wh = 40;

      // Subtle white plaster window surround
      ctx.fillStyle = 'rgba(255, 253, 248, 0.72)';
      ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);

      // Deep window recess / glass
      const warmLit = (row * 5 + col * 11) % 7 === 0;
      ctx.fillStyle = warmLit ? '#8ab4cf' : '#2d3f4f';
      ctx.fillRect(wx, wy, ww, wh);

      // Sky reflection sheen
      ctx.fillStyle = 'rgba(220, 238, 255, 0.22)';
      ctx.fillRect(wx + 2, wy + 2, ww - 4, 14);

      // Classic white cross mullions
      ctx.fillStyle = '#e7e4de';
      ctx.fillRect(wx + ww * 0.5 - 1.5, wy, 3, wh);
      ctx.fillRect(wx, wy + wh * 0.36, ww, 2.5);

      // Dark protruding sill under window
      ctx.fillStyle = 'rgba(60, 56, 52, 0.45)';
      ctx.fillRect(wx - 4, wy + wh + 2, ww + 8, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Single-draw-call-per-chunk Mikołów material: triangles with `uv.x >= -0.5` sample the tiled
 * Polish/Silesian windowed facade atlas; triangles tagged with `setSolidUVs(geo)` (`uv = (-10, -10)`)
 * skip texture sampling and render pure vertex-colored roofs, plinths, cornices, balconies, and spires.
 * Cuts chunk draw calls (main + shadow passes) in HALF without breaking UV tiling!
 */
function createMikolowBuildingMaterial(mapTex: THREE.CanvasTexture): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    map: mapTex,
    vertexColors: true,
  });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        if (vMapUv.x >= -0.5) {
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          diffuseColor *= sampledDiffuseColor;
        }
      #endif`
    );
  };
  return mat;
}

function setSolidUVs(geo: THREE.BufferGeometry): void {
  const count = geo.attributes.position.count;
  const uvs = new Float32Array(count * 2);
  uvs.fill(-10);
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

/**
 * Deterministic low-poly 2012-era City Builder (§6.2-6.4):
 * - Unified terrain + vector roads + optional railway
 * - Raxi City district grid blocks OR custom Silesian/Polish architecture merged into 200m chunks
 * - Bespoke sculpted Landmarks (16 Raxi City + Mikołów Silesian landmarks)
 * - 4 Raxi Garages with beams & drivable bays
 * - Jump ramps with hazard stripes
 */
export function buildCity(map: MapDefinition, physics: PhysicsWorld): CityBuildResult {
  const root = new THREE.Group();
  const textures = createCityTextures();
  const rng = new Rng(20120420); // Fixed map seed -> identical city every run

  // 1. Single unified Terrain HeightMap with all roads painted directly on it
  const { group: terrainGroup } = buildTerrain(map, physics);
  root.add(terrainGroup);

  // 2. ChunkBuilder for static buildings & landmarks
  //    (Mikołów merges windowed walls + solid roofs/trim/landmarks into 1 material/chunk -> half the draw calls!)
  const chunkBuilder = new ChunkBuilder();
  if (map.id === 'mikolow') {
    chunkBuilder.registerMaterial('buildings', createMikolowBuildingMaterial(createPolishFacadeTexture()));
  } else {
    chunkBuilder.registerMaterial(
      'buildings',
      new THREE.MeshLambertMaterial({
        map: textures.buildingAtlas,
        vertexColors: true,
      })
    );
  }
  chunkBuilder.registerMaterial(
    'landmarks',
    new THREE.MeshLambertMaterial({
      vertexColors: true,
    })
  );

  // 4. Generate deterministic district buildings (Raxi City) OR authentic custom architecture (Mikołów)
  if (!map.disableDefaultGridBuildings) {
    buildDistrictBuildings(map, chunkBuilder, physics, rng);
  }
  if (map.customBuildings && map.customBuildings.length > 0) {
    buildCustomBuildings(map, chunkBuilder, physics);
  }
  if (map.fences && map.fences.length > 0) {
    buildFences(map, chunkBuilder, physics);
  }

  // 5. Build all distinctive Landmarks
  for (const lm of map.landmarks) {
    buildLandmark(lm, map, chunkBuilder, physics);
  }

  // 6. Build Industrial Shipping Containers in Docks (Raxi City only)
  if (!map.disableDefaultGridBuildings) {
    buildDocksContainers(map, chunkBuilder, physics, rng);
  }

  const { root: chunkRoot, chunks } = chunkBuilder.build();
  root.add(chunkRoot);

  // 7. Jump Ramps
  const rampsGroup = buildRamps(map.ramps, map, textures, physics);
  root.add(rampsGroup);

  // 8. 4 Raxi Garages with drivable bays & beams
  const { group: garagesGroup, beams: garageBeams } = buildGarages(map.garages, map, physics);
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
      const mz = (a.z + b.z) * 0.5;
      const my = map.heightMap.sample(mx, mz) + 0.7;
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

function sampleFootprintHeights(
  map: MapDefinition,
  x: number,
  z: number,
  w: number,
  d: number,
  rotY = 0
): { centerY: number; minY: number; maxY: number } {
  const hm = map.heightMap;
  const centerY = hm.sample(x, z);
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const hw = w * 0.5;
  const hd = d * 0.5;
  let minY = centerY;
  let maxY = centerY;

  for (const sx of [-hw, hw]) {
    for (const sz of [-hd, hd]) {
      const wx = x + sx * cos + sz * sin;
      const wz = z - sx * sin + sz * cos;
      const hy = hm.sample(wx, wz);
      if (hy < minY) minY = hy;
      if (hy > maxY) maxY = hy;
    }
  }
  return { centerY, minY, maxY };
}

function tintHex(hex: number, factor: number): number {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, Math.max(0, c.r * factor));
  c.g = Math.min(1, Math.max(0, c.g * factor));
  c.b = Math.min(1, Math.max(0, c.b * factor));
  return c.getHex();
}

/**
 * Creates the two pitched roof slopes of a gabled roof (outward CCW normals).
 * Ridge runs along the longer horizontal dimension (X if w >= d, else Z).
 */
function createGableRoofSlopesGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const alongX = w >= d;
  const len = alongX ? w : d;
  const span = alongX ? d : w;
  const hl = len * 0.5;
  const hs = span * 0.5;

  const verts = new Float32Array([
    // +Z slope (CCW outward: +Y, +Z)
    -hl, 0, hs,
    hl, 0, hs,
    hl, h, 0,
    -hl, 0, hs,
    hl, h, 0,
    -hl, h, 0,
    // -Z slope (CCW outward: +Y, -Z)
    hl, 0, -hs,
    -hl, 0, -hs,
    -hl, h, 0,
    hl, 0, -hs,
    -hl, h, 0,
    hl, h, 0,
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  if (!alongX) {
    geo.rotateY(Math.PI * 0.5);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates the two triangular gable end walls matching `createGableRoofSlopesGeometry`.
 */
function createGableEndsGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const alongX = w >= d;
  const len = alongX ? w : d;
  const span = alongX ? d : w;
  const hl = len * 0.5;
  const hs = span * 0.5;

  const verts = new Float32Array([
    // +X gable triangle (CCW outward: +X)
    hl, 0, hs,
    hl, 0, -hs,
    hl, h, 0,
    // -X gable triangle (CCW outward: -X)
    -hl, 0, -hs,
    -hl, 0, hs,
    -hl, h, 0,
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  if (!alongX) {
    geo.rotateY(Math.PI * 0.5);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds authentic Silesian / Polish custom buildings (`kamienica`, `blok`, `domek`,
 * `brick`, `retail`, `industrial`), merged into 200m spatial chunks with hillside foundations
 * extending to `minCornerY - 1.5m` so zero buildings ever float on rolling hills.
 */
function buildCustomBuildings(
  map: MapDefinition,
  chunks: ChunkBuilder,
  physics: PhysicsWorld
): void {
  const buildings = map.customBuildings ?? [];
  const unifiedChunkMat = map.id === 'mikolow';
  const kamienicaRoofPalette = [0xa8432b, 0x933a27, 0xb85133, 0x7e3727];
  const domekRoofPalette = [0x8f3826, 0x5d3a2c, 0x3e454c, 0xa2462d];

  for (let idx = 0; idx < buildings.length; idx++) {
    const b: CustomBuildingDef = buildings[idx];
    const rotY = b.rotY ?? 0;

    // Exact polygonal footprint path for detailed street-view buildings (e.g. Stolarska & Dąbrowskiego)
    if (b.polygon && b.polygon.length >= 3) {
      const poly = ensurePositiveXZArea(b.polygon);
      let cx = 0;
      let cz = 0;
      let minY = Infinity;
      for (const [px, pz] of poly) {
        cx += px;
        cz += pz;
        const py = map.heightMap.sample(px, pz);
        if (py < minY) minY = py;
      }
      cx /= poly.length;
      cz /= poly.length;
      const centerY = map.heightMap.sample(cx, cz);
      if (centerY < minY) minY = centerY;

      const foundationBottom = minY - 1.5;
      const plinthTop = centerY + 0.4;
      const topY = centerY + b.h;
      const commitPoly = (geo: THREE.BufferGeometry, color: number, mat: 'buildings' | 'landmarks') => {
        if (unifiedChunkMat && mat === 'landmarks') {
          setSolidUVs(geo);
          chunks.addGeometry(cx, cz, 'buildings', geo, color);
        } else {
          chunks.addGeometry(cx, cz, mat, geo, color);
        }
        geo.dispose();
      };

      commitPoly(createPolygonWallsGeometry(poly, foundationBottom, plinthTop, 0.12), 0x5c5750, 'landmarks');
      commitPoly(createPolygonWallsGeometry(poly, plinthTop, topY, 0, 9.5, 10.5), b.color, 'buildings');

      const roofColor = b.roofColor ?? domekRoofPalette[idx % domekRoofPalette.length];
      const rStyle = b.roofStyle ?? (b.style === 'blok' ? 'flat' : 'gable');
      if (rStyle === 'flat') {
        commitPoly(createPolygonWallsGeometry(poly, topY - 0.3, topY + 0.45, 0.18), 0x4f565e, 'landmarks');
        const cap = createPolygonCapGeometry(poly, topY + 0.15);
        if (cap) commitPoly(cap, roofColor, 'landmarks');
      } else {
        // Stepped pitched roof over exact L/T/polygonal footprint + eaves cornice
        commitPoly(createPolygonWallsGeometry(poly, topY - 0.25, topY + 0.22, 0.28), 0xede6d9, 'landmarks');
        const steps = rStyle === 'hipped' ? 3 : 2;
        const roofH = Math.min(3.2, Math.max(1.6, Math.min(b.w, b.d) * 0.24));
        for (let s = 0; s < steps; s++) {
          const y0 = topY + 0.2 + (s / steps) * roofH;
          const y1 = topY + 0.2 + ((s + 1) / steps) * roofH;
          const inset = -0.55 * (s + 1);
          commitPoly(createPolygonWallsGeometry(poly, y0, y1, inset), roofColor, 'landmarks');
        }
        const cap = createPolygonCapGeometry(poly, topY + 0.2 + roofH);
        if (cap) commitPoly(cap, roofColor, 'landmarks');
      }

      const colH = Math.max(2, topY - foundationBottom);
      physics.createStaticBox(
        b.x,
        foundationBottom + colH * 0.5,
        b.z,
        b.w * 0.5,
        colH * 0.5,
        b.d * 0.5,
        { kind: 'building' },
        CG.STATIC_WORLD,
        rotY
      );
      continue;
    }

    const { centerY, minY } = sampleFootprintHeights(map, b.x, b.z, b.w, b.d, rotY);
    const foundationBottom = minY - 1.5;
    const topY = centerY + b.h;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);

    const addPart = (
      geo: THREE.BufferGeometry,
      localX: number,
      worldY: number,
      localZ: number,
      matKey: 'buildings' | 'landmarks',
      color: number
    ) => {
      if (rotY !== 0) geo.rotateY(rotY);
      const wx = b.x + localX * cos + localZ * sin;
      const wz = b.z - localX * sin + localZ * cos;
      geo.translate(wx, worldY, wz);
      if (unifiedChunkMat && matKey === 'landmarks') {
        setSolidUVs(geo);
        chunks.addGeometry(b.x, b.z, 'buildings', geo, color);
      } else {
        chunks.addGeometry(b.x, b.z, matKey, geo, color);
      }
      geo.dispose();
    };

    const addBox = (
      lx: number,
      yCenter: number,
      lz: number,
      w: number,
      h: number,
      d: number,
      color: number,
      matKey: 'buildings' | 'landmarks' = 'landmarks',
      uvTileW = 11,
      uvTileH = 12.5
    ) => {
      if (h <= 0.05) return;
      const geo = new THREE.BoxGeometry(w, h, d);
      if (matKey === 'buildings') {
        scaleUVs(geo, Math.max(0.5, w / uvTileW), Math.max(0.5, h / uvTileH));
      }
      addPart(geo, lx, yCenter, lz, matKey, color);
    };

    // Hillside stone/concrete foundation plinth below centerY down to minY - 1.5m
    const plinthTop = centerY + 0.45;
    const plinthH = Math.max(1.2, plinthTop - foundationBottom);
    const plinthColor =
      b.style === 'brick' || b.style === 'kamienica' ? 0x5c5750 : 0x696c70;
    addBox(0, foundationBottom + plinthH * 0.5, 0, b.w + 0.12, plinthH, b.d + 0.12, plinthColor, 'landmarks');

    if (b.style === 'kamienica') {
      // Historic Silesian Old Town townhouse: darker ground-floor shopfront + colorful windowed upper stories + clay-tile gable roof + chimney!
      const groundH = Math.min(3.3, b.h * 0.32);
      const upperH = Math.max(2.8, b.h - groundH);

      // Ground-floor shopfront band
      addBox(0, centerY + groundH * 0.5, 0, b.w, groundH, b.d, tintHex(b.color, 0.78), 'buildings', 9, 10);
      // Horizontal cornice ledge above ground floor
      addBox(0, centerY + groundH, 0, b.w + 0.3, 0.32, b.d + 0.3, 0xeae3d5, 'landmarks');

      // Windowed upper stories
      addBox(0, centerY + groundH + upperH * 0.5, 0, b.w, upperH, b.d, b.color, 'buildings', 10.5, 12.5);

      // Eaves cornice rim
      addBox(0, topY, 0, b.w + 0.42, 0.34, b.d + 0.42, 0xede6d9, 'landmarks');

      // Pitched terracotta/red clay-tile gabled roof + matching plaster gable ends
      const roofH = Math.min(4.6, Math.max(2.3, Math.min(b.w, b.d) * 0.34));
      const roofColor = b.roofColor ?? kamienicaRoofPalette[idx % kamienicaRoofPalette.length];
      addPart(createGableEndsGeometry(b.w, roofH, b.d), 0, topY + 0.12, 0, 'landmarks', b.color);
      addPart(
        createGableRoofSlopesGeometry(b.w + 0.55, roofH + 0.12, b.d + 0.55),
        0,
        topY + 0.08,
        0,
        'landmarks',
        roofColor
      );

      // Subtle brick chimney near roof ridge
      const chimOffX = (idx % 2 === 0 ? 1 : -1) * Math.min(b.w * 0.22, 2.4);
      addBox(chimOffX, topY + roofH * 0.78, 0, 0.75, 1.9, 0.75, 0x7b3c2f, 'landmarks');
    } else if (b.style === 'blok') {
      // Polish PRL / modernist 4–5 story apartment slab: pastel facade, horizontal balcony bands, flat roof + elevator penthouses!
      addBox(0, centerY + b.h * 0.5, 0, b.w, b.h, b.d, b.color, 'buildings', 12, 11.6);

      // Horizontal balcony loggia strips along the longer facades
      const stories = Math.max(3, Math.round(b.h / 2.9));
      const alongX = b.w >= b.d;
      const balconyColor = tintHex(b.color, 1.12);
      const bandCount = Math.min(stories - 1, 5);
      for (let st = 1; st <= bandCount; st++) {
        const by = centerY + (st / (stories + 0.2)) * b.h;
        if (alongX) {
          addBox(0, by, b.d * 0.5 + 0.3, b.w * 0.84, 0.85, 0.65, balconyColor, 'landmarks');
          addBox(0, by, -b.d * 0.5 - 0.3, b.w * 0.84, 0.85, 0.65, balconyColor, 'landmarks');
        } else {
          addBox(b.w * 0.5 + 0.3, by, 0, 0.65, 0.85, b.d * 0.84, balconyColor, 'landmarks');
          addBox(-b.w * 0.5 - 0.3, by, 0, 0.65, 0.85, b.d * 0.84, balconyColor, 'landmarks');
        }
      }

      // Flat tar-gravel roof parapet + rooftop elevator/vent penthouses
      addBox(0, topY + 0.25, 0, b.w + 0.35, 0.55, b.d + 0.35, 0x4f555c, 'landmarks');
      const pentW = Math.min(5.0, b.w * 0.24);
      const pentD = Math.min(4.2, b.d * 0.35);
      addBox(alongX ? -b.w * 0.22 : 0, topY + 1.45, alongX ? 0 : -b.d * 0.22, pentW, 2.2, pentD, 0x9aa2a8, 'landmarks');
      if (Math.max(b.w, b.d) > 26) {
        addBox(alongX ? b.w * 0.22 : 0, topY + 1.45, alongX ? 0 : b.d * 0.22, pentW, 2.2, pentD, 0x9aa2a8, 'landmarks');
      }
    } else if (b.style === 'domek') {
      // Polish suburban single-family house: plaster body + steep red/brown/charcoal pitched tile roof + chimney
      addBox(0, centerY + b.h * 0.5, 0, b.w, b.h, b.d, b.color, 'buildings', 9, 10.5);

      const roofH = Math.min(4.2, Math.max(2.2, Math.min(b.w, b.d) * 0.36));
      const roofColor = b.roofColor ?? domekRoofPalette[idx % domekRoofPalette.length];
      const aspect = Math.max(b.w, b.d) / Math.max(1, Math.min(b.w, b.d));

      if (aspect < 1.18) {
        // Hipped pyramid tile roof for square suburban houses
        const hip = new THREE.ConeGeometry(Math.hypot(b.w, b.d) * 0.54, roofH, 4);
        hip.rotateY(Math.PI * 0.25);
        addPart(hip, 0, topY + roofH * 0.5, 0, 'landmarks', roofColor);
      } else {
        // Steep pitched gabled roof + plaster gable ends
        addPart(createGableEndsGeometry(b.w, roofH, b.d), 0, topY, 0, 'landmarks', b.color);
        addPart(
          createGableRoofSlopesGeometry(b.w + 0.65, roofH + 0.1, b.d + 0.65),
          0,
          topY - 0.05,
          0,
          'landmarks',
          roofColor
        );
      }

      // Small suburban chimney
      addBox(b.w * 0.18, topY + roofH * 0.72, 0, 0.65, 1.5, 0.65, 0x703b30, 'landmarks');
    } else if (b.style === 'brick') {
      // Classic Silesian red-brick civic/historic building: brick body + sandstone stringcourses + pitched slate/clay roof
      addBox(0, centerY + b.h * 0.5, 0, b.w, b.h, b.d, b.color, 'buildings', 11, 12.5);
      // Sandstone mid-band & eaves cornice
      addBox(0, centerY + b.h * 0.42, 0, b.w + 0.28, 0.35, b.d + 0.28, 0xd8cbb6, 'landmarks');
      addBox(0, topY, 0, b.w + 0.45, 0.42, b.d + 0.45, 0xd8cbb6, 'landmarks');

      const roofH = Math.min(4.8, Math.max(2.4, Math.min(b.w, b.d) * 0.3));
      const roofColor = b.roofColor ?? 0x43484e;
      addPart(createGableEndsGeometry(b.w, roofH, b.d), 0, topY + 0.15, 0, 'landmarks', b.color);
      addPart(
        createGableRoofSlopesGeometry(b.w + 0.55, roofH + 0.12, b.d + 0.55),
        0,
        topY + 0.1,
        0,
        'landmarks',
        roofColor
      );
    } else if (b.style === 'retail') {
      // Wide low-rise shopping center with bold colored fascia parapet band & flat HVAC roof
      addBox(0, centerY + b.h * 0.5, 0, b.w, b.h, b.d, b.color, 'buildings', 15, 12);
      const fasciaColor = b.roofColor ?? 0xd84315;
      addBox(0, topY - 0.55, 0, b.w + 0.45, 1.35, b.d + 0.45, fasciaColor, 'landmarks');
      addBox(0, topY + 0.2, 0, b.w * 0.96, 0.3, b.d * 0.96, 0x5c646b, 'landmarks');
      // Rooftop HVAC unit
      addBox(0, topY + 0.95, 0, Math.min(6, b.w * 0.22), 1.2, Math.min(5, b.d * 0.22), 0x8f99a3, 'landmarks');
    } else {
      // Industrial hall / warehouse: wide corrugated hall + low-slope gabled metal roof + vents
      addBox(0, centerY + b.h * 0.5, 0, b.w, b.h, b.d, b.color, 'buildings', 18, 12);
      const roofH = Math.min(3.0, Math.max(1.1, Math.min(b.w, b.d) * 0.13));
      const roofColor = b.roofColor ?? 0x56606a;
      addPart(createGableEndsGeometry(b.w, roofH, b.d), 0, topY, 0, 'landmarks', tintHex(b.color, 0.92));
      addPart(
        createGableRoofSlopesGeometry(b.w + 0.5, roofH + 0.08, b.d + 0.5),
        0,
        topY - 0.02,
        0,
        'landmarks',
        roofColor
      );
    }

    // Solid oriented static building collider covering foundation to roof eaves
    const colH = Math.max(2, topY - foundationBottom);
    physics.createStaticBox(
      b.x,
      foundationBottom + colH * 0.5,
      b.z,
      b.w * 0.5,
      colH * 0.5,
      b.d * 0.5,
      { kind: 'building' },
      CG.STATIC_WORLD,
      rotY
    );
  }
}

function buildFences(
  map: MapDefinition,
  chunks: ChunkBuilder,
  physics: PhysicsWorld
): void {
  const fences = map.fences ?? [];
  const unifiedChunkMat = map.id === 'mikolow';

  const commit = (cx: number, cz: number, geo: THREE.BufferGeometry, color: number) => {
    if (unifiedChunkMat) {
      setSolidUVs(geo);
      chunks.addGeometry(cx, cz, 'buildings', geo, color);
    } else {
      chunks.addGeometry(cx, cz, 'landmarks', geo, color);
    }
    geo.dispose();
  };

  for (const f of fences) {
    const pts = f.points;
    if (pts.length < 2) continue;

    const h = f.height ?? (f.style === 'hedge' ? 1.35 : f.style === 'concrete_panel' ? 1.65 : 1.3);
    const mainCol =
      f.color ??
      (f.style === 'hedge'
        ? 0x3b662f
        : f.style === 'wood_picket'
          ? 0x8b5a36
          : f.style === 'wire_mesh'
            ? 0x3a5a40
            : f.style === 'concrete_panel'
              ? 0xb5b2aa
              : 0x32363b);
    const postCol =
      f.postColor ??
      (f.style === 'wood_picket'
        ? 0x6b4226
        : f.style === 'concrete_panel'
          ? 0x8e8b84
          : 0x45494f);

    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[i + 1];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 0.8) continue;

      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      const yaw = Math.atan2(dx, dz);
      const y0 = map.heightMap.sample(x0, z0);
      const y1 = map.heightMap.sample(x1, z1);
      const my = (y0 + y1) * 0.5;

      if (f.style === 'hedge') {
        const hedgeGeo = new THREE.BoxGeometry(0.65, h, len);
        hedgeGeo.rotateY(yaw);
        hedgeGeo.translate(mx, my + h * 0.5, mz);
        commit(mx, mz, hedgeGeo, mainCol);
      } else if (f.style === 'concrete_panel') {
        const wallGeo = new THREE.BoxGeometry(0.16, h, len);
        wallGeo.rotateY(yaw);
        wallGeo.translate(mx, my + h * 0.5, mz);
        commit(mx, mz, wallGeo, mainCol);
      } else {
        // Posts every ~2.6m + horizontal rails + vertical pickets/mesh
        const postCount = Math.max(2, Math.round(len / 2.6) + 1);
        for (let p = 0; p < postCount; p++) {
          const t = p / (postCount - 1);
          const px = x0 + dx * t;
          const pz = z0 + dz * t;
          const py = map.heightMap.sample(px, pz);
          const postGeo = new THREE.BoxGeometry(0.14, h + 0.08, 0.14);
          postGeo.rotateY(yaw);
          postGeo.translate(px, py + (h + 0.08) * 0.5, pz);
          commit(px, pz, postGeo, postCol);
        }

        // Top and bottom rails
        for (const ry of [h * 0.25, h * 0.85]) {
          const railGeo = new THREE.BoxGeometry(0.06, 0.08, len);
          railGeo.rotateY(yaw);
          railGeo.translate(mx, my + ry, mz);
          commit(mx, mz, railGeo, mainCol);
        }

        if (f.style === 'metal_palisade' || f.style === 'wood_picket') {
          const picketStep = f.style === 'wood_picket' ? 0.45 : 0.55;
          const picketCount = Math.max(2, Math.floor(len / picketStep));
          for (let k = 1; k < picketCount; k++) {
            const t = k / picketCount;
            const px = x0 + dx * t;
            const pz = z0 + dz * t;
            const py = map.heightMap.sample(px, pz);
            const pGeo = new THREE.BoxGeometry(0.05, h * 0.9, 0.07);
            pGeo.rotateY(yaw);
            pGeo.translate(px, py + h * 0.48, pz);
            commit(px, pz, pGeo, mainCol);
          }
        }
      }

      physics.createStaticBox(
        mx,
        my + h * 0.5,
        mz,
        0.18,
        h * 0.5,
        len * 0.5,
        { kind: 'building' },
        CG.STATIC_WORLD,
        yaw
      );
    }
  }
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

/**
 * Ensures a 2D (x, z) polygon has positive signed area (clockwise when viewed from +Y,
 * matching outward edge normal `(dz, 0, -dx)`).
 */
function ensurePositiveXZArea(poly: Array<[number, number]>): Array<[number, number]> {
  let area2 = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  return area2 >= 0 ? poly.slice() : poly.slice().reverse();
}

/**
 * Builds an extruded vertical wall ring around a 2D (x, z) polygon with outward normals
 * and per-edge scaled UVs.
 */
function createPolygonWallsGeometry(
  poly: Array<[number, number]>,
  yBottom: number,
  yTop: number,
  outset = 0,
  uvTileW = 12,
  uvTileH = 12
): THREE.BufferGeometry {
  const n = poly.length;
  const wallH = Math.max(0.1, yTop - yBottom);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;
    const nx = dz / len;
    const nz = -dx / len;
    const ax = a[0] + nx * outset;
    const az = a[1] + nz * outset;
    const bx = b[0] + nx * outset;
    const bz = b[1] + nz * outset;

    const base = positions.length / 3;
    positions.push(
      ax, yBottom, az,
      bx, yBottom, bz,
      bx, yTop, bz,
      ax, yTop, az
    );
    const uMax = Math.max(0.5, len / uvTileW);
    const vMax = Math.max(0.5, wallH / uvTileH);
    uvs.push(0, 0, uMax, 0, uMax, vMax, 0, vMax);
    indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a flat upward-facing horizontal roof cap for any simple (including concave) 2D (x, z) polygon.
 */
function createPolygonCapGeometry(
  poly: Array<[number, number]>,
  y: number
): THREE.BufferGeometry | null {
  if (poly.length < 3) return null;
  const contour = poly.map(([x, z]) => new THREE.Vector2(x, z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  if (faces.length === 0) return null;

  const positions = new Float32Array(poly.length * 3);
  for (let i = 0; i < poly.length; i++) {
    positions[i * 3] = poly[i][0];
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = poly[i][1];
  }
  const indices: number[] = [];
  for (const [i0, i1, i2] of faces) {
    // Reverse winding so normal points strictly +Y
    indices.push(i0, i2, i1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a landmark from real-world OSM polygonal wing footprint(s), including hillside plinths,
 * tiled Silesian facades, roof/fascia architectural trim, rooftop units, and exact trimesh colliders
 * so surrounding courtyards & parking lots remain 100% open and drivable.
 */
function buildPolygonalLandmark(
  lm: LandmarkDef,
  map: MapDefinition,
  chunks: ChunkBuilder,
  physics: PhysicsWorld
): void {
  const parts: LandmarkFootprintPart[] = lm.footprintParts ?? [];
  const unifiedChunkMat = map.id === 'mikolow';

  const commitGeo = (
    cx: number,
    cz: number,
    geo: THREE.BufferGeometry,
    color: number,
    mat: 'buildings' | 'landmarks'
  ) => {
    if (unifiedChunkMat && mat === 'landmarks') {
      setSolidUVs(geo);
      chunks.addGeometry(cx, cz, 'buildings', geo, color);
    } else {
      chunks.addGeometry(cx, cz, mat, geo, color);
    }
    geo.dispose();
  };

  for (let pIdx = 0; pIdx < parts.length; pIdx++) {
    const part = parts[pIdx];
    if (part.polygon.length < 3) continue;
    const poly = ensurePositiveXZArea(part.polygon);

    let cx = 0;
    let cz = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [px, pz] of poly) {
      cx += px;
      cz += pz;
      const py = map.heightMap.sample(px, pz);
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    cx /= poly.length;
    cz /= poly.length;
    const centerY = map.heightMap.sample(cx, cz);
    if (centerY < minY) minY = centerY;

    const partH = part.height ?? lm.height;
    const wallColor = part.color ?? lm.color;
    const accentColor = part.accentColor ?? lm.accentColor;
    const roofStyle = part.roofStyle ?? (lm.style === 'retail_center' ? 'flat_fascia' : 'flat');

    const foundationBottom = minY - 1.5;
    const plinthTop = centerY + 0.45;
    const topY = centerY + partH;

    // 1. Hillside foundation plinth skirt
    const plinthGeo = createPolygonWallsGeometry(poly, foundationBottom, plinthTop, 0.14);
    commitGeo(cx, cz, plinthGeo, 0x5c5750, 'landmarks');

    // 2. Main textured facade walls
    const wallTop = roofStyle === 'flat_fascia' ? Math.max(plinthTop + 1.5, topY - 1.45) : topY;
    const wallsGeo = createPolygonWallsGeometry(
      poly,
      plinthTop,
      wallTop,
      0,
      roofStyle === 'industrial' ? 18 : 13,
      12
    );
    commitGeo(cx, cz, wallsGeo, wallColor, 'buildings');

    // 3. Roof & parapet architectural treatment
    if (roofStyle === 'flat_fascia') {
      // Bold retail fascia parapet band wrapping the entire real building perimeter
      const fasciaGeo = createPolygonWallsGeometry(poly, wallTop - 0.15, topY + 0.55, 0.28);
      commitGeo(cx, cz, fasciaGeo, accentColor, 'landmarks');
      const roofCap = createPolygonCapGeometry(poly, topY + 0.15);
      if (roofCap) commitGeo(cx, cz, roofCap, 0x565e66, 'landmarks');
      // Subtle rooftop HVAC mechanical housing near centroid
      const hvac = new THREE.BoxGeometry(6.5, 1.7, 4.8);
      hvac.translate(cx, topY + 1.0, cz);
      commitGeo(cx, cz, hvac, 0x8a959e, 'landmarks');
    } else if (roofStyle === 'industrial') {
      const parapetGeo = createPolygonWallsGeometry(poly, topY - 0.4, topY + 0.6, 0.22);
      commitGeo(cx, cz, parapetGeo, accentColor, 'landmarks');
      const roofCap = createPolygonCapGeometry(poly, topY + 0.15);
      if (roofCap) commitGeo(cx, cz, roofCap, 0x616b75, 'landmarks');
      const vent = new THREE.BoxGeometry(8, 1.8, 5);
      vent.translate(cx, topY + 1.0, cz);
      commitGeo(cx, cz, vent, 0x8b959e, 'landmarks');
    } else if (roofStyle === 'gable') {
      // Historic Silesian cornice rim + warm pitched-feel terracotta/slate roof cap
      const corniceGeo = createPolygonWallsGeometry(poly, topY - 0.35, topY + 0.28, 0.32);
      commitGeo(cx, cz, corniceGeo, 0xede6d9, 'landmarks');
      const roofWallGeo = createPolygonWallsGeometry(poly, topY + 0.25, topY + 1.8, -0.35);
      commitGeo(cx, cz, roofWallGeo, accentColor, 'landmarks');
      const roofCap = createPolygonCapGeometry(poly, topY + 1.8);
      if (roofCap) commitGeo(cx, cz, roofCap, accentColor, 'landmarks');
    } else {
      // Modernist flat roof parapet
      const parapetGeo = createPolygonWallsGeometry(poly, topY - 0.35, topY + 0.55, 0.2);
      commitGeo(cx, cz, parapetGeo, 0x4f565e, 'landmarks');
      const roofCap = createPolygonCapGeometry(poly, topY + 0.15);
      if (roofCap) commitGeo(cx, cz, roofCap, 0x626a72, 'landmarks');
      if (lm.style === 'hospital' && pIdx === 0) {
        const crossA = new THREE.BoxGeometry(12, 2.2, 3.4);
        crossA.translate(cx, topY + 1.3, cz);
        commitGeo(cx, cz, crossA, accentColor, 'landmarks');
        const crossB = new THREE.BoxGeometry(3.4, 2.2, 12);
        crossB.translate(cx, topY + 1.3, cz);
        commitGeo(cx, cz, crossB, accentColor, 'landmarks');
      }
    }

    // 4. Exact polygonal static trimesh physics collider (no oversized bounding box blocking parking lots!)
    const colGeo = createPolygonWallsGeometry(poly, foundationBottom, topY + 0.5, 0);
    const colPos = colGeo.attributes.position as THREE.BufferAttribute;
    const colIdx = colGeo.index!;
    physics.createStaticTrimesh(
      new Float32Array(colPos.array as Float32Array),
      new Uint32Array(colIdx.array),
      { kind: 'building' }
    );
    colGeo.dispose();
  }
}

function buildLandmark(
  lm: LandmarkDef,
  map: MapDefinition,
  chunks: ChunkBuilder,
  physics: PhysicsWorld
): void {
  if (lm.footprintParts && lm.footprintParts.length > 0) {
    buildPolygonalLandmark(lm, map, chunks, physics);
    return;
  }
  const { centerY: baseY, minY } = sampleFootprintHeights(map, lm.x, lm.z, lm.footprintW, lm.footprintD, 0);
  const foundationBottom = minY - 1.5;
  const unifiedChunkMat = map.id === 'mikolow';

  const addGeo = (
    geo: THREE.BufferGeometry,
    ox: number,
    oy: number,
    oz: number,
    color: number,
    mat: 'buildings' | 'landmarks' = 'landmarks'
  ) => {
    geo.translate(lm.x + ox, baseY + oy, lm.z + oz);
    if (unifiedChunkMat && mat === 'landmarks') {
      setSolidUVs(geo);
      chunks.addGeometry(lm.x, lm.z, 'buildings', geo, color);
    } else {
      chunks.addGeometry(lm.x, lm.z, mat, geo, color);
    }
    geo.dispose();
  };

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
    addGeo(geo, ox, oy, oz, color, mat);
  };

  // Add hillside foundation plinth whenever ground is sloped (or on Mikołów hills) so zero landmarks ever float!
  const needsPlinth = baseY - minY > 0.15 || map.id === 'mikolow';
  if (needsPlinth) {
    const plinthH = baseY + 0.5 - foundationBottom;
    const plinthY = (foundationBottom + baseY + 0.5) * 0.5 - baseY;
    addBox(0, plinthY, 0, lm.footprintW + 0.4, plinthH, lm.footprintD + 0.4, 0x5c5750, 'landmarks');
  }

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
      addGeo(cyl, 0, 4.5 + s * 9, 0, s % 2 === 0 ? lm.color : lm.accentColor, 'landmarks');
    }
    addBox(0, 48, 0, 5, 5, 5, 0xffee58);
  } else if (lm.style === 'stadium') {
    if (map.id === 'mikolow') {
      // Hala Sportowa MOSiR: modern Polish sports hall sized strictly to footprintW x footprintD with arched vaulted roof!
      const w = lm.footprintW;
      const d = lm.footprintD;
      const wallH = lm.height * 0.68;
      const archH = lm.height * 0.34;
      addBox(0, wallH * 0.5, 0, w, wallH, d, lm.color, 'buildings');
      addBox(0, wallH, 0, w + 0.6, 0.7, d + 0.6, lm.accentColor, 'landmarks');
      // Stepped arched vaulted roof spanning the sports hall
      addBox(0, wallH + archH * 0.35, 0, w * 0.88, archH * 0.65, d * 0.86, lm.accentColor, 'landmarks');
      addBox(0, wallH + archH * 0.8, 0, w * 0.62, archH * 0.45, d * 0.78, tintHex(lm.accentColor, 1.15), 'landmarks');
    } else {
      // Raxi Stadium oval bowl (100% unchanged)
      const ring = new THREE.CylinderGeometry(34, 28, lm.height, 14);
      addGeo(ring, 0, lm.height * 0.5, 0, lm.color, 'landmarks');
      const trim = new THREE.CylinderGeometry(35, 35, 4, 14);
      addGeo(trim, 0, lm.height + 1, 0, lm.accentColor, 'landmarks');
    }
  } else if (lm.style === 'hospital') {
    addBox(0, lm.height * 0.5, 0, lm.footprintW, lm.height, lm.footprintD, lm.color, 'buildings');
    // Giant red cross on top
    addBox(0, lm.height + 2.5, 0, 18, 4, 5, lm.accentColor);
    addBox(0, lm.height + 2.5, 0, 5, 4, 18, lm.accentColor);
  } else if (lm.style === 'basilica') {
    // Bazylika św. Wojciecha: red-brick Neo-Romanesque nave + transept + iconic twin tall bell towers with pointed dark spires!
    // Automatically aligns nave along the longer footprint axis and faces the twin towers toward the curb/Rynek!
    const alongX = lm.footprintW >= lm.footprintD;
    const len = alongX ? lm.footprintW : lm.footprintD;
    const wid = alongX ? lm.footprintD : lm.footprintW;
    const h = lm.height;
    const brick = lm.color;
    const slate = lm.accentColor;
    const sandstone = 0xd9ccb8;

    // Face twin towers toward the street curb (for Mikołów: West toward Rynek!)
    const frontSign = alongX
      ? (lm.curbX < lm.x ? -1 : 1)
      : (lm.curbZ < lm.z ? -1 : 1);

    const addLocalGeo = (
      geo: THREE.BufferGeometry,
      along: number,
      oy: number,
      across: number,
      color: number,
      mat: 'buildings' | 'landmarks' = 'landmarks'
    ) => {
      if (alongX) {
        addGeo(geo, along, oy, across, color, mat);
      } else {
        geo.rotateY(Math.PI * 0.5);
        addGeo(geo, across, oy, along, color, mat);
      }
    };

    const addLocalBox = (
      along: number,
      oy: number,
      across: number,
      sizeAlong: number,
      sizeY: number,
      sizeAcross: number,
      color: number,
      mat: 'buildings' | 'landmarks' = 'landmarks'
    ) => {
      const geo = new THREE.BoxGeometry(sizeAlong, sizeY, sizeAcross);
      if (mat === 'buildings') scaleUVs(geo, sizeAlong / 12, sizeY / 12);
      addLocalGeo(geo, along, oy, across, color, mat);
    };

    const naveLen = len * 0.86;
    const naveWid = wid * 0.56;
    const naveH = h * 0.36;
    const naveRoofH = h * 0.14;

    // Main red-brick nave + steep dark slate pitched roof
    addLocalBox(0, naveH * 0.5, 0, naveLen, naveH, naveWid, brick, 'buildings');
    addLocalGeo(createGableEndsGeometry(naveLen, naveRoofH, naveWid), 0, naveH, 0, brick, 'landmarks');
    addLocalGeo(
      createGableRoofSlopesGeometry(naveLen + 0.8, naveRoofH + 0.15, naveWid + 0.8),
      0,
      naveH - 0.05,
      0,
      slate,
      'landmarks'
    );

    // Crossing transept wing + pitched roof
    const tranAlong = len * 0.28;
    const tranAcross = wid * 0.94;
    const tranH = naveH * 0.94;
    const tranPos = -frontSign * len * 0.06;
    addLocalBox(tranPos, tranH * 0.5, 0, tranAlong, tranH, tranAcross, brick, 'buildings');
    addLocalGeo(createGableEndsGeometry(tranAlong, naveRoofH * 0.9, tranAcross), tranPos, tranH, 0, brick, 'landmarks');
    addLocalGeo(
      createGableRoofSlopesGeometry(tranAlong + 0.7, naveRoofH * 0.92, tranAcross + 0.7),
      tranPos,
      tranH - 0.05,
      0,
      slate,
      'landmarks'
    );

    // Central crossing ridge turret (sygnaturka)
    const turret = new THREE.ConeGeometry(1.7, 9.5, 8);
    addLocalGeo(turret, tranPos, naveH + naveRoofH + 4.5, 0, slate, 'landmarks');

    // Apse choir at altar end
    const apsePos = -frontSign * naveLen * 0.48;
    const apse = new THREE.CylinderGeometry(naveWid * 0.36, naveWid * 0.36, naveH * 0.84, 10);
    addLocalGeo(apse, apsePos, naveH * 0.42, 0, brick, 'landmarks');
    const apseRoof = new THREE.ConeGeometry(naveWid * 0.38, naveRoofH * 0.75, 10);
    addLocalGeo(apseRoof, apsePos, naveH * 0.84 + naveRoofH * 0.37, 0, slate, 'landmarks');

    // Front portal gable & rose window frame between the twin towers
    const frontPos = frontSign * naveLen * 0.38;
    addLocalBox(frontPos + frontSign * 1.4, naveH * 0.52, 0, 2.8, naveH * 1.04, naveWid * 0.44, sandstone, 'landmarks');

    // Twin iconic tall square red-brick bell towers with pointed dark pyramidal spires!
    const towerSize = Math.min(wid * 0.28, 8.2);
    const towerOffsetAcross = wid * 0.3;
    const towerShaftH = h * 0.66;
    const spireH = h * 0.34;

    for (const side of [-1, 1]) {
      const across = side * towerOffsetAcross;
      addLocalBox(frontPos, towerShaftH * 0.5, across, towerSize, towerShaftH, towerSize, brick, 'buildings');
      addLocalBox(frontPos, towerShaftH * 0.65, across, towerSize + 0.65, 0.9, towerSize + 0.65, sandstone, 'landmarks');
      addLocalBox(frontPos, towerShaftH, across, towerSize + 0.85, 1.1, towerSize + 0.85, sandstone, 'landmarks');
      const spire = new THREE.ConeGeometry(towerSize * 0.72, spireH, 4);
      spire.rotateY(Math.PI * 0.25);
      addLocalGeo(spire, frontPos, towerShaftH + spireH * 0.5, across, slate, 'landmarks');
      // Golden cross finial
      addLocalBox(frontPos, towerShaftH + spireH + 1.6, across, 0.35, 3.2, 0.35, 0xf5c842, 'landmarks');
      addLocalBox(frontPos, towerShaftH + spireH + 2.2, across, 0.32, 0.32, 1.7, 0xf5c842, 'landmarks');
    }
  } else if (lm.style === 'church') {
    // Kościół Ewangelicki św. Jana: red-brick hall church with tall single front needle spire!
    const w = lm.footprintW;
    const d = lm.footprintD;
    const h = lm.height;
    const brick = lm.color;
    const slate = lm.accentColor;
    const sandstone = 0xd9ccb8;
    const frontSign = lm.curbZ >= lm.z ? 1 : -1;

    const naveH = h * 0.36;
    const roofH = h * 0.14;
    addBox(0, naveH * 0.5, -frontSign * d * 0.06, w * 0.82, naveH, d * 0.78, brick, 'buildings');
    addGeo(createGableEndsGeometry(w * 0.82, roofH, d * 0.78), 0, naveH, -frontSign * d * 0.06, brick, 'landmarks');
    addGeo(
      createGableRoofSlopesGeometry(w * 0.86, roofH + 0.15, d * 0.82),
      0,
      naveH - 0.05,
      -frontSign * d * 0.06,
      slate,
      'landmarks'
    );

    // Single tall front bell tower + slender needle spire
    const towerSize = Math.min(w * 0.36, 7.6);
    const towerShaftH = h * 0.62;
    const spireH = h * 0.38;
    const tz = frontSign * d * 0.32;
    addBox(0, towerShaftH * 0.5, tz, towerSize, towerShaftH, towerSize, brick, 'buildings');
    addBox(0, towerShaftH * 0.68, tz, towerSize + 0.6, 0.8, towerSize + 0.6, sandstone, 'landmarks');
    addBox(0, towerShaftH, tz, towerSize + 0.75, 1.0, towerSize + 0.75, sandstone, 'landmarks');
    const needle = new THREE.ConeGeometry(towerSize * 0.58, spireH, 8);
    addGeo(needle, 0, towerShaftH + spireH * 0.5, tz, slate, 'landmarks');
    addBox(0, towerShaftH + spireH + 1.4, tz, 0.3, 2.8, 0.3, 0xf5c842, 'landmarks');
  } else if (lm.style === 'townhall') {
    // Ratusz na Rynku: warm Neo-Renaissance Silesian town hall with stepped gable & central clock tower!
    const w = lm.footprintW;
    const d = lm.footprintD;
    const h = lm.height;
    const bodyH = h * 0.54;
    const roofH = h * 0.16;

    // Ground-floor stone arcade plinth
    addBox(0, 2.0, 0, w + 0.3, 4.0, d + 0.3, tintHex(lm.color, 0.82), 'landmarks');
    // Main historic civic body
    addBox(0, bodyH * 0.5, 0, w, bodyH, d, lm.color, 'buildings');
    addBox(0, bodyH, 0, w + 0.6, 0.6, d + 0.6, 0xf0eadc, 'landmarks');

    // Pitched terracotta clay-tile roof
    addGeo(createGableEndsGeometry(w, roofH, d), 0, bodyH + 0.1, 0, lm.color, 'landmarks');
    addGeo(createGableRoofSlopesGeometry(w + 0.7, roofH + 0.12, d + 0.7), 0, bodyH + 0.05, 0, lm.accentColor, 'landmarks');

    // Stepped decorative front gable (szczyt schodkowy) facing the Rynek square
    const frontSign = lm.curbZ < lm.z ? -1 : 1;
    const gableZ = frontSign * (d * 0.5 + 0.25);
    addBox(0, bodyH + 1.4, gableZ, w * 0.42, 2.6, 0.7, lm.color, 'landmarks');
    addBox(0, bodyH + 3.4, gableZ, w * 0.28, 1.8, 0.7, lm.color, 'landmarks');
    addBox(0, bodyH + 4.8, gableZ, w * 0.14, 1.4, 0.7, 0xf0eadc, 'landmarks');

    // Central clock tower + 4 bright clock faces + copper-green lantern cupola
    const towerW = Math.min(w, d) * 0.28;
    const towerTop = h * 0.84;
    const towerBase = bodyH + roofH * 0.35;
    const towerH = Math.max(4, towerTop - towerBase);
    addBox(0, towerBase + towerH * 0.5, 0, towerW, towerH, towerW, lm.color, 'landmarks');
    // Clock dials on all 4 faces
    const dialY = towerTop - towerW * 0.42;
    const dialS = towerW * 0.52;
    addBox(0, dialY, towerW * 0.52, dialS, dialS, 0.18, 0xfaf7ee, 'landmarks');
    addBox(0, dialY, -towerW * 0.52, dialS, dialS, 0.18, 0xfaf7ee, 'landmarks');
    addBox(towerW * 0.52, dialY, 0, 0.18, dialS, dialS, 0xfaf7ee, 'landmarks');
    addBox(-towerW * 0.52, dialY, 0, 0.18, dialS, dialS, 0xfaf7ee, 'landmarks');
    // Verdigris copper lantern & spire
    const cupolaH = Math.max(3, h - towerTop);
    const cupola = new THREE.ConeGeometry(towerW * 0.62, cupolaH, 8);
    addGeo(cupola, 0, towerTop + cupolaH * 0.5, 0, 0x3b6258, 'landmarks');
  } else if (lm.style === 'train_station') {
    // Dworzec PKP Mikołów: classic Silesian red-brick tripartite station + steel platform canopy!
    const w = lm.footprintW;
    const d = lm.footprintD;
    const h = lm.height;
    const brick = lm.color;
    const roofCol = lm.accentColor;
    const sandstone = 0xd8cbb6;

    // Central 2-story station hall
    const mainW = w * 0.48;
    const mainD = d * 0.7;
    const mainH = h * 0.74;
    addBox(0, mainH * 0.5, 0, mainW, mainH, mainD, brick, 'buildings');
    addBox(0, mainH, 0, mainW + 0.5, 0.5, mainD + 0.5, sandstone, 'landmarks');
    const mainRoofH = h * 0.26;
    addGeo(createGableEndsGeometry(mainW, mainRoofH, mainD), 0, mainH + 0.1, 0, brick, 'landmarks');
    addGeo(createGableRoofSlopesGeometry(mainW + 0.6, mainRoofH + 0.12, mainD + 0.6), 0, mainH + 0.05, 0, roofCol, 'landmarks');

    // Flanking lower station wings
    const wingW = w * 0.26;
    const wingD = d * 0.58;
    const wingH = mainH * 0.68;
    for (const side of [-1, 1]) {
      const wx = side * (mainW * 0.5 + wingW * 0.48);
      addBox(wx, wingH * 0.5, 0, wingW, wingH, wingD, brick, 'buildings');
      addGeo(createGableEndsGeometry(wingW, mainRoofH * 0.65, wingD), wx, wingH, 0, brick, 'landmarks');
      addGeo(createGableRoofSlopesGeometry(wingW + 0.5, mainRoofH * 0.68, wingD + 0.5), wx, wingH - 0.05, 0, roofCol, 'landmarks');
    }

    // Raised concrete platform + overhanging steel platform canopy with iron pillars
    const platZ = d * 0.44;
    addBox(0, 0.45, platZ, w * 1.06, 0.9, d * 0.28, 0x9aa0a6, 'landmarks');
    addBox(0, 4.3, platZ, w * 1.04, 0.35, d * 0.26, roofCol, 'landmarks');
    const pillarCount = 5;
    for (let k = 0; k < pillarCount; k++) {
      const px = ((k / (pillarCount - 1)) - 0.5) * (w * 0.9);
      addBox(px, 2.35, platZ, 0.32, 3.8, 0.32, 0x37474f, 'landmarks');
    }
  } else if (lm.style === 'block_estate') {
    // Modernist Polish PRL residential estate complex (staggered multi-wing slab + balcony bands + accent stairwell core)
    const w = lm.footprintW;
    const d = lm.footprintD;
    const h = lm.height;

    // Main apartment wing
    addBox(-w * 0.12, h * 0.5, -d * 0.1, w * 0.72, h, d * 0.46, lm.color, 'buildings');
    // Offset perpendicular/staggered wing
    addBox(w * 0.24, h * 0.42, d * 0.16, w * 0.44, h * 0.84, d * 0.62, tintHex(lm.color, 0.94), 'buildings');
    // Contrasting vertical stairwell / accent tower core
    addBox(w * 0.06, h * 0.54, 0, w * 0.18, h * 1.08, d * 0.26, lm.accentColor, 'landmarks');
    // Horizontal concrete balcony bands
    const stories = Math.max(3, Math.round(h / 3.0));
    for (let s = 1; s < Math.min(stories, 6); s++) {
      const sy = (s / stories) * h;
      addBox(-w * 0.12, sy, d * 0.14, w * 0.64, 0.75, 0.7, 0xe2e6ea, 'landmarks');
    }
    // Flat roof caps
    addBox(-w * 0.12, h + 0.3, -d * 0.1, w * 0.74, 0.6, d * 0.48, 0x4d545c, 'landmarks');
    addBox(w * 0.24, h * 0.84 + 0.3, d * 0.16, w * 0.46, 0.6, d * 0.64, 0x4d545c, 'landmarks');
  } else if (lm.style === 'retail_center') {
    // Modern Polish shopping center (Auchan / Kaufland / CH Mikołów): wide hall + bold accent fascia + glass entrance portico
    const w = lm.footprintW;
    const d = lm.footprintD;
    const h = lm.height;
    addBox(0, h * 0.5, 0, w, h, d, lm.color, 'buildings');
    // Bold bright commercial fascia parapet band
    addBox(0, h - 0.8, 0, w + 0.7, 2.0, d + 0.7, lm.accentColor, 'landmarks');
    // Prominent entrance portico & glazed vestibule
    addBox(0, h * 0.38, d * 0.5 + 1.8, w * 0.36, h * 0.72, 3.6, 0x5c8ab5, 'landmarks');
    addBox(0, h * 0.78, d * 0.5 + 2.2, w * 0.44, 1.1, 4.6, lm.accentColor, 'landmarks');
    // Rooftop HVAC mechanical units
    addBox(-w * 0.22, h + 1.1, 0, 7, 1.8, 5, 0x8a959e, 'landmarks');
    addBox(w * 0.22, h + 1.1, 0, 7, 1.8, 5, 0x8a959e, 'landmarks');
  } else if (map.id === 'mikolow' && (lm.style === 'hall' || lm.style === 'campus')) {
    // Historic Silesian civic / school landmarks (MDK, Starostwo Powiatowe, I LO im. Karola Miarki): pitched tile roof + cornice
    const w = lm.footprintW;
    const d = lm.footprintD;
    const bodyH = lm.height * 0.78;
    const roofH = Math.min(5.2, Math.max(2.6, Math.min(w, d) * 0.22));
    addBox(0, bodyH * 0.5, 0, w, bodyH, d, lm.color, 'buildings');
    addBox(0, bodyH, 0, w + 0.6, 0.55, d + 0.6, 0xede6d9, 'landmarks');
    addGeo(createGableEndsGeometry(w, roofH, d), 0, bodyH + 0.1, 0, lm.color, 'landmarks');
    addGeo(createGableRoofSlopesGeometry(w + 0.8, roofH + 0.15, d + 0.8), 0, bodyH + 0.05, 0, lm.accentColor, 'landmarks');
  } else {
    addBox(0, lm.height * 0.5, 0, lm.footprintW, lm.height, lm.footprintD, lm.color, 'buildings');
    addBox(0, lm.height + 2.5, 0, lm.footprintW * 0.72, 5, lm.footprintD * 0.72, lm.accentColor, 'landmarks');
  }

  const colBottom = needsPlinth ? foundationBottom : baseY;
  const colTop = baseY + lm.height;
  const colH = Math.max(2, colTop - colBottom);
  physics.createStaticBox(
    lm.x,
    colBottom + colH * 0.5,
    lm.z,
    lm.footprintW * 0.5,
    colH * 0.5,
    lm.footprintD * 0.5,
    { kind: 'building' }
  );
}

function buildRamps(
  ramps: RampDef[],
  map: MapDefinition,
  textures: CityTextures,
  physics: PhysicsWorld
): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ map: textures.rampStripes });
  const isHillyMap = map.id === 'mikolow';

  for (const r of ramps) {
    const baseY = map.heightMap.sample(r.x, r.z);
    const hw = r.width * 0.5;
    const hl = r.length * 0.5;
    const h = r.height;
    // Extend only the visual back-bottom skirt slightly into hillsides on Mikołów (front launch lip stays strictly at y=0!)
    const backSkirtY = isHillyMap ? -1.2 : 0;

    // Wedge geometry sloping up from +Z (ground) to -Z (height h)
    const visualVerts = new Float32Array([
      // Bottom 4
      -hw, 0, hl,
      hw, 0, hl,
      hw, backSkirtY, -hl,
      -hw, backSkirtY, -hl,
      // Top back 2
      hw, h, -hl,
      -hw, h, -hl,
    ]);
    const colliderVerts = new Float32Array([
      -hw, 0, hl,
      hw, 0, hl,
      hw, 0, -hl,
      -hw, 0, -hl,
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
    geo.setAttribute('position', new THREE.BufferAttribute(visualVerts, 3));
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
    const worldVerts = new Float32Array(colliderVerts.length);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.yaw);
    const v = new THREE.Vector3();
    for (let i = 0; i < colliderVerts.length; i += 3) {
      v.set(colliderVerts[i], colliderVerts[i + 1], colliderVerts[i + 2]).applyQuaternion(q);
      worldVerts[i] = v.x + r.x;
      worldVerts[i + 1] = v.y + baseY;
      worldVerts[i + 2] = v.z + r.z;
    }
    physics.createStaticTrimesh(worldVerts, indices, { kind: 'ground' }, CG.STATIC_WORLD);
  }

  return group;
}

function buildGarages(
  garages: GarageDef[],
  map: MapDefinition,
  physics: PhysicsWorld
): { group: THREE.Group; beams: THREE.Mesh[] } {
  const group = new THREE.Group();
  const beams: THREE.Mesh[] = [];
  const isHillyMap = map.id === 'mikolow';

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
    const baseY = map.heightMap.sample(g.x, g.z);
    const gGroup = new THREE.Group();
    gGroup.position.set(g.x, baseY, g.z);
    gGroup.rotation.y = g.yaw;

    // Extend visual pillar depth slightly below baseY on hilly terrain so garage walls never float
    const wallExtra = isHillyMap ? 1.5 : 0;
    const wallH = 5.5 + wallExtra;
    const wallCenterY = 2.75 - wallExtra * 0.5;

    // Open-front canopy with 2 side pillars + yellow roof so the player can drive straight into the bay!
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, wallH, 11), wallMat);
    leftWall.position.set(-6.5, wallCenterY, 0);
    gGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, wallH, 11), wallMat);
    rightWall.position.set(6.5, wallCenterY, 0);
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
      physics.createStaticBox(wx, baseY + wallCenterY, wz, 0.6, wallH * 0.5, 5.5, { kind: 'building' }, CG.STATIC_WORLD, g.yaw);
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
