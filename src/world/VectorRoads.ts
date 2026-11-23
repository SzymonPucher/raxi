import * as THREE from 'three';
import { MapDefinition } from './mapData';

/**
 * Creates a MeshLambertMaterial upgraded via onBeforeCompile with an analytic,
 * resolution-independent GLSL vector shader for asphalt grain, sidewalks/curbs,
 * double-yellow centerlines, dashed white lane dividers, solid edge lines, and zebra crosswalks.
 * Inherits full Three.js sun shadows, directional/hemisphere lighting, and distance fog.
 */
function createVectorRoadMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aRoadData;
        attribute vec3 aRoadFlags;
        varying vec4 vRoadData;
        varying vec3 vRoadFlags;
        varying vec2 vWorldXZ;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRoadData = aRoadData;
        vRoadFlags = aRoadFlags;
        vWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec4 vRoadData;
        varying vec3 vRoadFlags;
        varying vec2 vWorldXZ;

        float roadHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        // Analytic anti-aliased band centered at center with half-width halfW
        float aaBand(float coord, float center, float halfW) {
          float fw = max(fwidth(coord), 0.004);
          float d = abs(coord - center);
          return 1.0 - smoothstep(halfW - fw, halfW + fw, d);
        }

        // Analytic anti-aliased interval [lo, hi]
        float aaRange(float coord, float lo, float hi) {
          float fw = max(fwidth(coord), 0.004);
          return smoothstep(lo - fw, lo + fw, coord) * (1.0 - smoothstep(hi - fw, hi + fw, coord));
        }`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          // vRoadData: x = signed lateral meters from centerline, y = distFromStart, z = distFromEnd, w = asphaltWidth
          // vRoadFlags: x = lanesPerDir (1 or 2), y = startHasLight, z = endHasLight
          float lat = vRoadData.x;
          float absLat = abs(lat);
          float distStart = vRoadData.y;
          float distEnd = vRoadData.z;
          float roadW = vRoadData.w;
          float halfW = roadW * 0.5;
          float dEnd = min(distStart, distEnd);
          float nearLight = (distStart < distEnd) ? vRoadFlags.y : vRoadFlags.z;
          float lanes = vRoadFlags.x;

          // Trim outer sidewalk curbs cleanly at intersections so cross-streets stay open asphalt
          float curbTrim = (roadW > 14.0) ? 9.2 : 8.2;
          if (absLat > halfW && dEnd < curbTrim) {
            discard;
          }

          // Subtle multi-scale procedural asphalt grain
          float g1 = roadHash(floor(vWorldXZ * 3.5));
          float g2 = roadHash(floor(vWorldXZ * 0.9));
          float grain = (g1 * 0.6 + g2 * 0.4 - 0.5) * 0.045;

          // Base dark asphalt
          vec3 asphaltCol = vec3(0.195, 0.212, 0.232) + grain;
          // Slight tire-wear darkening in lane centers
          float wear = aaBand(absLat, halfW * 0.5, halfW * 0.22);
          asphaltCol -= wear * 0.014;

          vec3 col = asphaltCol;

          // Sidewalk / curb border outside asphalt (|lat| > halfW)
          float fwLat = max(fwidth(absLat), 0.005);
          float isSidewalk = smoothstep(halfW - fwLat, halfW + fwLat, absLat);
          if (isSidewalk > 0.001) {
            vec3 sidewalkCol = vec3(0.62, 0.64, 0.67) + grain * 0.7;
            // Concrete expansion joints every 4 meters
            float joint = aaBand(fract(distStart / 4.0), 0.5, 0.018);
            sidewalkCol -= joint * 0.08;
            // Crisp dark curb shadow bevel right at asphalt edge
            float curbLine = aaBand(absLat, halfW + 0.14, 0.14);
            sidewalkCol = mix(sidewalkCol, vec3(0.42, 0.44, 0.47), curbLine);
            col = mix(col, sidewalkCol, isSidewalk);
          }

          // Vector road markings inside asphalt
          if (absLat < halfW) {
            float markTrim = nearLight > 0.5 ? 11.4 : 8.8;
            float inLaneZone = smoothstep(markTrim - 0.15, markTrim + 0.15, dEnd);

            // 1. Solid white outer edge lines
            float outerLine = aaBand(absLat, halfW - 0.38, 0.085) * inLaneZone;
            col = mix(col, vec3(0.90, 0.92, 0.94), outerLine);

            // 2. Crisp double yellow centerline
            float yellowLeft = aaBand(lat, -0.15, 0.065);
            float yellowRight = aaBand(lat, 0.15, 0.065);
            float doubleYellow = max(yellowLeft, yellowRight) * inLaneZone;
            col = mix(col, vec3(0.96, 0.77, 0.10), doubleYellow);

            // 3. Dashed white lane dividers (for 2-lane-per-direction avenues & highways)
            if (lanes > 1.5) {
              float dashPeriod = 8.0;
              float dashPhase = fract(distStart / dashPeriod);
              float dashMask = aaRange(dashPhase, 0.15, 0.58);
              float laneLine = aaBand(absLat, halfW * 0.5, 0.075) * dashMask * inLaneZone;
              col = mix(col, vec3(0.91, 0.93, 0.95), laneLine);
            }

            // 4. Zebra crosswalk + stop bar at signalized intersections
            if (nearLight > 0.5) {
              float inCrosswalk = aaRange(dEnd, 8.2, 10.7);
              if (inCrosswalk > 0.001) {
                float stripePhase = fract((lat + halfW) / 1.15);
                float zebra = aaRange(stripePhase, 0.18, 0.72) * aaRange(absLat, 0.0, halfW - 0.55);
                col = mix(col, vec3(0.92, 0.94, 0.96), zebra * inCrosswalk * 0.92);
              }
              // Solid white stop line before crosswalk (right-hand side only)
              float stopBar = aaRange(dEnd, 11.0, 11.45) * aaRange(absLat, 0.25, halfW - 0.45);
              col = mix(col, vec3(0.92, 0.94, 0.96), stopBar * 0.9);
            }
          }

          diffuseColor.rgb = col;
        }`
      );
  };

  return mat;
}

function createShortcutPathMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aPathLat;
        varying vec2 vPathLat;
        varying vec2 vWorldXZ;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPathLat = aPathLat;
        vWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vPathLat;
        varying vec2 vWorldXZ;
        float pHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float grain = (pHash(floor(vWorldXZ * 2.5)) - 0.5) * 0.08;
          vec3 gravel = vec3(0.64, 0.56, 0.43) + grain;
          float edgeFade = smoothstep(vPathLat.y - 0.45, vPathLat.y, abs(vPathLat.x));
          gravel = mix(gravel, vec3(0.46, 0.42, 0.34), edgeFade * 0.45);
          diffuseColor.rgb = gravel;
        }`
      );
  };

  return mat;
}

/**
 * Builds purely visual, infinite-resolution vector road ribbons & intersection hubs
 * subdivided finely so every vertex sits flush on `map.heightMap.sample(x, z)`.
 * Adds ZERO physics colliders — the single Terrain HeightMap collider remains the sole ground surface.
 */
export function buildVectorRoads(map: MapDefinition): THREE.Group {
  const group = new THREE.Group();
  const hm = map.heightMap;
  const visualLift = 0.035;

  // --- 1. Main Vector Roads (1 merged BufferGeometry = 1 draw call!) ---
  const positions: number[] = [];
  const roadData: number[] = [];
  const roadFlags: number[] = [];
  const indices: number[] = [];

  // Cross-section lateral fractions across [-(halfW + curb), +(halfW + curb)]:
  // 5 samples across width so roads conform smoothly even to sideways hill camber!
  for (const e of map.graph.edges) {
    if (e.isShortcut) continue;
    const a = map.graph.getNode(e.from)!;
    const b = map.graph.getNode(e.to)!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;

    const dirX = dx / len;
    const dirZ = dz / len;
    const rx = -dirZ;
    const rz = dirX;

    const halfW = e.width * 0.5;
    const curbW = e.roadType === 'country' ? 0.65 : 1.55;
    const totalHalf = halfW + curbW;
    // Flat city core & ring highway need only 1 segment x 2 columns (2 tris per road!);
    // hilly outskirts subdivide smoothly every 10m x 3 columns to hug slopes
    const isFlatCore =
      Math.abs(a.x) <= 650 &&
      Math.abs(a.z) <= 650 &&
      Math.abs(b.x) <= 650 &&
      Math.abs(b.z) <= 650;
    const latOffsets = isFlatCore ? [-totalHalf, totalHalf] : [-totalHalf, 0, totalHalf];
    const cols = latOffsets.length;
    const steps = isFlatCore ? 1 : Math.max(2, Math.ceil(len / 10.0));
    const baseVertex = positions.length / 3;
    const startLight = a.hasTrafficLight ? 1 : 0;
    const endLight = b.hasTrafficLight ? 1 : 0;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const distStart = t * len;
      const distEnd = (1 - t) * len;
      const cx = a.x + dx * t;
      const cz = a.z + dz * t;

      for (let c = 0; c < cols; c++) {
        const lat = latOffsets[c];
        const vx = cx + rx * lat;
        const vz = cz + rz * lat;
        const vy = hm.sample(vx, vz) + visualLift;

        positions.push(vx, vy, vz);
        roadData.push(lat, distStart, distEnd, e.width);
        roadFlags.push(e.lanesPerDir, startLight, endLight);
      }
    }

    // Build CCW upward-facing triangles (+Y normal)
    // Right-hand side is +rx,+rz (col+1), forward is +dirX,+dirZ (row+1).
    // (row,col) -> (row,col+1) -> (row+1,col+1) has (right) x (fwd) = +Y!
    for (let s = 0; s < steps; s++) {
      for (let c = 0; c < cols - 1; c++) {
        const i00 = baseVertex + s * cols + c;
        const i01 = baseVertex + s * cols + (c + 1);
        const i10 = baseVertex + (s + 1) * cols + c;
        const i11 = baseVertex + (s + 1) * cols + (c + 1);
        indices.push(i00, i01, i11, i00, i11, i10);
      }
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setAttribute('aRoadData', new THREE.Float32BufferAttribute(roadData, 4));
  roadGeo.setAttribute('aRoadFlags', new THREE.Float32BufferAttribute(roadFlags, 3));
  roadGeo.setIndex(indices);
  roadGeo.computeVertexNormals();

  const roadMesh = new THREE.Mesh(roadGeo, createVectorRoadMaterial());
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // --- 2. Conforming Intersection Asphalt Pads (1 draw call!) ---
  const hubPos: number[] = [];
  const hubIdx: number[] = [];
  const hubSegs = 12;

  for (const node of map.graph.nodes.values()) {
    const adj = map.graph.adjacency.get(node.id) ?? [];
    let maxHalfW = 0;
    for (const a of adj) {
      if (!a.edge.isShortcut) {
        maxHalfW = Math.max(maxHalfW, a.edge.width * 0.5);
      }
    }
    if (maxHalfW <= 0) continue;

    const rad = maxHalfW + 0.3;
    const centerIdx = hubPos.length / 3;
    hubPos.push(node.x, hm.sample(node.x, node.z) + visualLift - 0.008, node.z);

    for (let k = 0; k < hubSegs; k++) {
      const ang = (k / hubSegs) * Math.PI * 2;
      const vx = node.x + Math.cos(ang) * rad;
      const vz = node.z + Math.sin(ang) * rad;
      hubPos.push(vx, hm.sample(vx, vz) + visualLift - 0.008, vz);
    }

    for (let k = 0; k < hubSegs; k++) {
      const next = (k + 1) % hubSegs;
      // CCW upward (+Y): center -> next -> cur
      hubIdx.push(centerIdx, centerIdx + 1 + next, centerIdx + 1 + k);
    }
  }

  if (hubPos.length > 0) {
    const hubGeo = new THREE.BufferGeometry();
    hubGeo.setAttribute('position', new THREE.Float32BufferAttribute(hubPos, 3));
    hubGeo.setIndex(hubIdx);
    hubGeo.computeVertexNormals();
    const hubMat = new THREE.MeshLambertMaterial({
      color: 0x33373d,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const hubMesh = new THREE.Mesh(hubGeo, hubMat);
    hubMesh.receiveShadow = true;
    group.add(hubMesh);
  }

  // --- 3. Conforming Gravel Shortcut Paths (1 draw call!) ---
  const pathPos: number[] = [];
  const pathLat: number[] = [];
  const pathIdx: number[] = [];

  for (const e of map.graph.edges) {
    if (!e.isShortcut) continue;
    const a = map.graph.getNode(e.from)!;
    const b = map.graph.getNode(e.to)!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;

    const rx = -dz / len;
    const rz = dx / len;
    const halfW = e.width * 0.5;
    const steps = Math.max(2, Math.ceil(len / 6.0));
    const baseV = pathPos.length / 3;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = a.x + dx * t;
      const cz = a.z + dz * t;
      for (const lat of [-halfW, 0, halfW]) {
        const vx = cx + rx * lat;
        const vz = cz + rz * lat;
        pathPos.push(vx, hm.sample(vx, vz) + visualLift - 0.012, vz);
        pathLat.push(lat, halfW);
      }
    }
    for (let s = 0; s < steps; s++) {
      for (let c = 0; c < 2; c++) {
        const i00 = baseV + s * 3 + c;
        const i01 = baseV + s * 3 + (c + 1);
        const i10 = baseV + (s + 1) * 3 + c;
        const i11 = baseV + (s + 1) * 3 + (c + 1);
        pathIdx.push(i00, i01, i11, i00, i11, i10);
      }
    }
  }

  if (pathPos.length > 0) {
    const pathGeo = new THREE.BufferGeometry();
    pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(pathPos, 3));
    pathGeo.setAttribute('aPathLat', new THREE.Float32BufferAttribute(pathLat, 2));
    pathGeo.setIndex(pathIdx);
    pathGeo.computeVertexNormals();
    const pathMesh = new THREE.Mesh(pathGeo, createShortcutPathMaterial());
    pathMesh.receiveShadow = true;
    group.add(pathMesh);
  }

  return group;
}
