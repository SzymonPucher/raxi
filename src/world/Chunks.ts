import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface SpatialChunk {
  cx: number;
  cz: number;
  centerX: number;
  centerZ: number;
  group: THREE.Group;
}

/**
 * Spatial chunk merger (§6.3): collects box/geometry primitives bucketed into 200m chunks,
 * merges them per chunk per material, and supports distance culling.
 */
export class ChunkBuilder {
  private readonly chunkSize = 200;
  private buckets = new Map<string, Map<string, THREE.BufferGeometry[]>>();
  private materials = new Map<string, THREE.Material>();

  registerMaterial(key: string, material: THREE.Material): void {
    this.materials.set(key, material);
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
    const c = new THREE.Color(colorHex ?? 0xffffff);
    for (let i = 0; i < posCount; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
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

    for (const [chunkKey, matMap] of this.buckets.entries()) {
      const [cxStr, czStr] = chunkKey.split('_');
      const cx = Number(cxStr);
      const cz = Number(czStr);
      const group = new THREE.Group();

      for (const [matKey, geos] of matMap.entries()) {
        if (geos.length === 0) continue;
        const merged = mergeGeometries(geos, false);
        for (const g of geos) g.dispose();
        if (!merged) continue;
        const mat = this.materials.get(matKey);
        if (!mat) continue;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = matKey === 'buildings' || matKey === 'landmarks';
        mesh.receiveShadow = true;
        group.add(mesh);
      }

      root.add(group);
      chunks.push({
        cx,
        cz,
        centerX: (cx + 0.5) * this.chunkSize,
        centerZ: (cz + 0.5) * this.chunkSize,
        group,
      });
    }

    this.buckets.clear();
    return { root, chunks };
  }
}

export function updateChunkVisibility(
  chunks: SpatialChunk[],
  playerX: number,
  playerZ: number,
  drawDistance: number
): void {
  const maxDistSq = (drawDistance + 180) * (drawDistance + 180);
  for (let i = 0; i < chunks.length; i++) {
    const ch = chunks[i];
    const dx = ch.centerX - playerX;
    const dz = ch.centerZ - playerZ;
    ch.group.visible = dx * dx + dz * dz <= maxDistSq;
  }
}
