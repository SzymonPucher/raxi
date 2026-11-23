import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface SpatialChunk {
  cx: number;
  cz: number;
  centerX: number;
  centerZ: number;
  group: THREE.Group;
  shadowCasters: THREE.Mesh[];
  fencesMesh: THREE.Mesh | null;
  fencePicketsMesh: THREE.Mesh | null;
}

interface DirectBuffer {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
}

/**
 * Spatial chunk merger (§6.3): collects box/geometry primitives bucketed into 200m chunks,
 * merges them per chunk per material, and supports distance & shadow culling.
 */
export class ChunkBuilder {
  private readonly chunkSize = 200;
  private buckets = new Map<string, Map<string, THREE.BufferGeometry[]>>();
  private directBuckets = new Map<string, Map<string, DirectBuffer>>();
  private materials = new Map<string, THREE.Material>();
  private readonly tmpColor = new THREE.Color();

  registerMaterial(key: string, material: THREE.Material): void {
    this.materials.set(key, material);
  }

  private getDirectBuffer(chunkKey: string, materialKey: string): DirectBuffer {
    let matMap = this.directBuckets.get(chunkKey);
    if (!matMap) {
      matMap = new Map();
      this.directBuckets.set(chunkKey, matMap);
    }
    let buf = matMap.get(materialKey);
    if (!buf) {
      buf = { positions: [], normals: [], uvs: [], colors: [] };
      matMap.set(materialKey, buf);
    }
    return buf;
  }

  /**
   * Appends a Y-rotated, world-translated solid-colored box directly into the chunk's vertex buffers
   * without allocating a THREE.BufferGeometry or intermediate TypedArrays.
   * Optionally omits the underground bottom (-Y) face or buried (+Z/-Z) end caps.
   */
  addOrientedBox(
    worldX: number,
    worldZ: number,
    materialKey: string,
    cx: number,
    cy: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    yaw: number,
    colorHex: number,
    uvValue = 0,
    omitBottom = false,
    omitEnds = false
  ): void {
    const cellX = Math.floor(worldX / this.chunkSize);
    const cellZ = Math.floor(worldZ / this.chunkSize);
    const chunkKey = `${cellX}_${cellZ}`;
    const buf = this.getDirectBuffer(chunkKey, materialKey);
    const { positions, normals, uvs, colors } = buf;

    const hw = w * 0.5;
    const hh = h * 0.5;
    const hd = d * 0.5;
    const cos = yaw === 0 ? 1 : Math.cos(yaw);
    const sin = yaw === 0 ? 0 : Math.sin(yaw);

    this.tmpColor.setHex(colorHex);
    const cr = this.tmpColor.r;
    const cg = this.tmpColor.g;
    const cb = this.tmpColor.b;

    const pushQuad = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      x3: number,
      y3: number,
      z3: number,
      nx: number,
      ny: number,
      nz: number
    ) => {
      const wx0 = cx + x0 * cos + z0 * sin;
      const wz0 = cz - x0 * sin + z0 * cos;
      const wx1 = cx + x1 * cos + z1 * sin;
      const wz1 = cz - x1 * sin + z1 * cos;
      const wx2 = cx + x2 * cos + z2 * sin;
      const wz2 = cz - x2 * sin + z2 * cos;
      const wx3 = cx + x3 * cos + z3 * sin;
      const wz3 = cz - x3 * sin + z3 * cos;

      const wy0 = cy + y0;
      const wy1 = cy + y1;
      const wy2 = cy + y2;
      const wy3 = cy + y3;

      const wnx = nx * cos + nz * sin;
      const wny = ny;
      const wnz = -nx * sin + nz * cos;

      // Tri 1: 0, 1, 2; Tri 2: 0, 2, 3
      positions.push(
        wx0, wy0, wz0,
        wx1, wy1, wz1,
        wx2, wy2, wz2,
        wx0, wy0, wz0,
        wx2, wy2, wz2,
        wx3, wy3, wz3
      );
      for (let k = 0; k < 6; k++) {
        normals.push(wnx, wny, wnz);
        uvs.push(uvValue, uvValue);
        colors.push(cr, cg, cb);
      }
    };

    // +X face
    pushQuad(hw, -hh, hd, hw, -hh, -hd, hw, hh, -hd, hw, hh, hd, 1, 0, 0);
    // -X face
    pushQuad(-hw, -hh, -hd, -hw, -hh, hd, -hw, hh, hd, -hw, hh, -hd, -1, 0, 0);
    // +Y top face
    pushQuad(-hw, hh, hd, hw, hh, hd, hw, hh, -hd, -hw, hh, -hd, 0, 1, 0);
    // -Y bottom face
    if (!omitBottom) {
      pushQuad(-hw, -hh, -hd, hw, -hh, -hd, hw, -hh, hd, -hw, -hh, hd, 0, -1, 0);
    }
    if (!omitEnds) {
      // +Z front face
      pushQuad(-hw, -hh, hd, hw, -hh, hd, hw, hh, hd, -hw, hh, hd, 0, 0, 1);
      // -Z back face
      pushQuad(hw, -hh, -hd, -hw, -hh, -hd, -hw, hh, -hd, hw, hh, -hd, 0, 0, -1);
    }
  }

  addGeometry(
    worldX: number,
    worldZ: number,
    materialKey: string,
    geometry: THREE.BufferGeometry,
    colorHex?: number
  ): void {
    const cx = Math.floor(worldX / this.chunkSize);
    const cz = Math.floor(worldZ / this.chunkSize);
    const chunkKey = `${cx}_${cz}`;

    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (!nonIndexed.attributes.uv) {
      const count = nonIndexed.attributes.position.count;
      nonIndexed.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }

    const posCount = nonIndexed.attributes.position.count;
    const colors = new Float32Array(posCount * 3);
    this.tmpColor.setHex(colorHex ?? 0xffffff);
    const cr = this.tmpColor.r;
    const cg = this.tmpColor.g;
    const cb = this.tmpColor.b;
    for (let i = 0; i < posCount; i++) {
      colors[i * 3] = cr;
      colors[i * 3 + 1] = cg;
      colors[i * 3 + 2] = cb;
    }
    nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    let matMap = this.buckets.get(chunkKey);
    if (!matMap) {
      matMap = new Map();
      this.buckets.set(chunkKey, matMap);
    }
    let list = matMap.get(materialKey);
    if (!list) {
      list = [];
      matMap.set(materialKey, list);
    }
    list.push(nonIndexed);
  }

  build(): { root: THREE.Group; chunks: SpatialChunk[] } {
    const root = new THREE.Group();
    const chunks: SpatialChunk[] = [];

    const allChunkKeys = new Set<string>([
      ...this.buckets.keys(),
      ...this.directBuckets.keys(),
    ]);

    for (const chunkKey of allChunkKeys) {
      const [cxStr, czStr] = chunkKey.split('_');
      const cx = Number(cxStr);
      const cz = Number(czStr);
      const group = new THREE.Group();
      const shadowCasters: THREE.Mesh[] = [];
      let fencesMesh: THREE.Mesh | null = null;
      let fencePicketsMesh: THREE.Mesh | null = null;

      const matMap = this.buckets.get(chunkKey);
      const directMap = this.directBuckets.get(chunkKey);
      const matKeys = new Set<string>([
        ...(matMap ? matMap.keys() : []),
        ...(directMap ? directMap.keys() : []),
      ]);

      for (const matKey of matKeys) {
        const geos = matMap?.get(matKey) ?? [];
        const directBuf = directMap?.get(matKey);
        if (directBuf && directBuf.positions.length > 0) {
          const dGeo = new THREE.BufferGeometry();
          dGeo.setAttribute('position', new THREE.Float32BufferAttribute(directBuf.positions, 3));
          dGeo.setAttribute('normal', new THREE.Float32BufferAttribute(directBuf.normals, 3));
          dGeo.setAttribute('uv', new THREE.Float32BufferAttribute(directBuf.uvs, 2));
          dGeo.setAttribute('color', new THREE.Float32BufferAttribute(directBuf.colors, 3));
          geos.push(dGeo);
        }

        if (geos.length === 0) continue;
        let merged: THREE.BufferGeometry | null;
        if (geos.length === 1) {
          merged = geos[0];
        } else {
          merged = mergeGeometries(geos, false);
          for (const g of geos) g.dispose();
        }
        if (!merged) continue;
        const mat = this.materials.get(matKey);
        if (!mat) continue;

        const mesh = new THREE.Mesh(merged, mat);
        const isBuildingOrLandmark = matKey === 'buildings' || matKey === 'landmarks';
        mesh.castShadow = isBuildingOrLandmark;
        mesh.receiveShadow = true;
        if (isBuildingOrLandmark) {
          shadowCasters.push(mesh);
        } else if (matKey === 'fences') {
          fencesMesh = mesh;
        } else if (matKey === 'fencePickets') {
          fencePicketsMesh = mesh;
        }
        group.add(mesh);
      }

      root.add(group);
      chunks.push({
        cx,
        cz,
        centerX: (cx + 0.5) * this.chunkSize,
        centerZ: (cz + 0.5) * this.chunkSize,
        group,
        shadowCasters,
        fencesMesh,
        fencePicketsMesh,
      });
    }

    this.buckets.clear();
    this.directBuckets.clear();
    return { root, chunks };
  }
}

export function updateChunkVisibility(
  chunks: SpatialChunk[],
  playerX: number,
  playerZ: number,
  drawDistance: number,
  shadowRange = 150
): void {
  const maxDistSq = (drawDistance + 180) * (drawDistance + 180);
  const fenceDist = Math.min(drawDistance, 380) + 150;
  const fenceDistSq = fenceDist * fenceDist;
  const picketDist = Math.min(drawDistance, 210) + 140;
  const picketDistSq = picketDist * picketDist;
  const shadowDist = shadowRange > 0 ? shadowRange + 170 : 0;
  const shadowDistSq = shadowDist * shadowDist;

  for (let i = 0; i < chunks.length; i++) {
    const ch = chunks[i];
    const dx = ch.centerX - playerX;
    const dz = ch.centerZ - playerZ;
    const d2 = dx * dx + dz * dz;
    const vis = d2 <= maxDistSq;
    ch.group.visible = vis;
    if (!vis) continue;

    const castShadow = shadowRange > 0 && d2 <= shadowDistSq;
    for (let s = 0; s < ch.shadowCasters.length; s++) {
      ch.shadowCasters[s].castShadow = castShadow;
    }
    if (ch.fencesMesh) {
      ch.fencesMesh.visible = d2 <= fenceDistSq;
    }
    if (ch.fencePicketsMesh) {
      ch.fencePicketsMesh.visible = d2 <= picketDistSq;
    }
  }
}
