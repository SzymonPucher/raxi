import * as THREE from 'three';
import { MapDefinition } from './mapData';

/**
 * Creates a MeshLambertMaterial upgraded via onBeforeCompile with an analytic,
 * resolution-independent GLSL vector shader for asphalt grain, variable-width sidewalks/curbs,
 * road centerlines, dashed white lane dividers, solid edge lines, and zebra crosswalks.
 * Preserves Raxi City rendering 100% identically when styleCode == 0, and enables authentic
 * Polish/Silesian road & sidewalk styling when styleCode >= 1.
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
        attribute vec4 aRoadStyle;
        varying vec4 vRoadData;
        varying vec3 vRoadFlags;
        varying vec4 vRoadStyle;
        varying vec2 vWorldXZ;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRoadData = aRoadData;
        vRoadFlags = aRoadFlags;
        vRoadStyle = aRoadStyle;
        vWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec4 vRoadData;
        varying vec3 vRoadFlags;
        varying vec4 vRoadStyle;
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
          // vRoadStyle: x = curbWidth, y = startCurbTrim, z = endCurbTrim, w = styleCode (0=Raxi, 1=Polish urban, 2=Historic Rynek, 3=Polish highway/country)
          float lat = vRoadData.x;
          float absLat = abs(lat);
          float distStart = vRoadData.y;
          float distEnd = vRoadData.z;
          float roadW = vRoadData.w;
          float halfW = roadW * 0.5;
          float dEnd = min(distStart, distEnd);
          float nearLight = (distStart < distEnd) ? vRoadFlags.y : vRoadFlags.z;
          float lanes = vRoadFlags.x;
          float curbW = vRoadStyle.x;
          float curbTrim = (distStart < distEnd) ? vRoadStyle.y : vRoadStyle.z;
          float styleCode = vRoadStyle.w;

          // Trim outer sidewalk curbs cleanly at intersections so cross-streets stay open asphalt
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
            if (styleCode < 0.5) {
              // Classic Raxi City sidewalk (100% unchanged)
              vec3 sidewalkCol = vec3(0.62, 0.64, 0.67) + grain * 0.7;
              float joint = aaBand(fract(distStart / 4.0), 0.5, 0.018);
              sidewalkCol -= joint * 0.08;
              float curbLine = aaBand(absLat, halfW + 0.14, 0.14);
              sidewalkCol = mix(sidewalkCol, vec3(0.42, 0.44, 0.47), curbLine);
              col = mix(col, sidewalkCol, isSidewalk);
            } else if (styleCode > 2.5 && curbW <= 1.05) {
              // Highway / country compacted gravel & tarmac shoulder
              vec3 shoulderCol = vec3(0.32, 0.33, 0.34) + grain * 1.15;
              float edgeBevel = aaBand(absLat, halfW + 0.08, 0.08);
              shoulderCol = mix(shoulderCol, vec3(0.24, 0.25, 0.27), edgeBevel);
              col = mix(col, shoulderCol, isSidewalk);
            } else if (styleCode > 1.5 && styleCode < 2.5) {
              // Historic Silesian Rynek / Old Town warm granite cobble promenade sidewalk
              vec3 cobbleCol = vec3(0.69, 0.65, 0.58) + grain * 0.85;
              float jointLong = aaBand(fract(distStart / 1.8), 0.5, 0.025);
              float jointLat = aaBand(fract((absLat - halfW) / 0.9), 0.5, 0.028);
              cobbleCol -= max(jointLong, jointLat) * 0.065;
              // Crisp Silesian granite curbstone bevel
              float curbStone = aaBand(absLat, halfW + 0.16, 0.16);
              cobbleCol = mix(cobbleCol, vec3(0.49, 0.47, 0.43), curbStone);
              col = mix(col, cobbleCol, isSidewalk);
            } else {
              // Standard Polish urban/residential sidewalk (paving slabs + sharp concrete curb)
              vec3 sidewalkCol = vec3(0.65, 0.66, 0.68) + grain * 0.65;
              float jointLong = aaBand(fract(distStart / 2.2), 0.5, 0.02);
              float jointLat = aaBand(fract((absLat - halfW) / 1.1), 0.5, 0.022);
              sidewalkCol -= max(jointLong, jointLat * 0.6) * 0.07;
              // Crisp dark curb shadow bevel right at asphalt edge
              float curbLine = aaBand(absLat, halfW + 0.15, 0.15);
              sidewalkCol = mix(sidewalkCol, vec3(0.41, 0.43, 0.46), curbLine);
              // Subtle outer sidewalk border trim
              float outerTrim = aaBand(absLat, halfW + curbW - 0.08, 0.08);
              sidewalkCol = mix(sidewalkCol, vec3(0.50, 0.52, 0.54), outerTrim * 0.55);
              col = mix(col, sidewalkCol, isSidewalk);
            }
          }

          // Vector road markings inside asphalt
          if (absLat < halfW) {
            if (styleCode < 0.5) {
              // Classic Raxi City road markings (100% unchanged)
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
                float stopBar = aaRange(dEnd, 11.0, 11.45) * aaRange(absLat, 0.25, halfW - 0.45);
                col = mix(col, vec3(0.92, 0.94, 0.96), stopBar * 0.9);
              }
            } else {
              // Authentic Polish / European road markings (white lines, adaptive intersection trim)
              float edgeLen = distStart + distEnd;
              float cwStart = curbTrim + 0.2;
              float cwEnd = curbTrim + 2.5;
              float baseTrim = nearLight > 0.5 ? (cwEnd + 0.9) : (curbTrim + 0.7);
              float markTrim = min(baseTrim, edgeLen * 0.38);
              float inLaneZone = smoothstep(markTrim - 0.15, markTrim + 0.15, dEnd);

              // 1. Solid white outer edge lines (on roads >= 7.5m wide)
              if (roadW >= 7.5) {
                float outerLine = aaBand(absLat, halfW - 0.32, 0.075) * inLaneZone;
                col = mix(col, vec3(0.91, 0.93, 0.95), outerLine * 0.9);
              }

              // 2. Polish white centerline (double solid white on 2-lane avenues/highways, dashed white on standard 2-way streets >= 7m)
              if (lanes > 1.5) {
                float wLeft = aaBand(lat, -0.13, 0.06);
                float wRight = aaBand(lat, 0.13, 0.06);
                float doubleWhite = max(wLeft, wRight) * inLaneZone;
                col = mix(col, vec3(0.93, 0.95, 0.97), doubleWhite);

                // Dashed white lane dividers
                float dashPhase = fract(distStart / 8.0);
                float dashMask = aaRange(dashPhase, 0.15, 0.55);
                float laneLine = aaBand(absLat, halfW * 0.5, 0.07) * dashMask * inLaneZone;
                col = mix(col, vec3(0.91, 0.93, 0.95), laneLine * 0.92);
              } else if (roadW >= 7.0) {
                float dashPhase = fract(distStart / 6.0);
                float dashMask = aaRange(dashPhase, 0.18, 0.58);
                float centerDash = aaBand(lat, 0.0, 0.065) * dashMask * inLaneZone;
                col = mix(col, vec3(0.91, 0.93, 0.95), centerDash * 0.92);
              }

              // 3. Polish zebra crosswalk (pasy) + stop bar at signalized intersections
              if (nearLight > 0.5 && edgeLen > curbTrim * 2.0 + 7.5) {
                float inCrosswalk = aaRange(dEnd, cwStart, cwEnd);
                if (inCrosswalk > 0.001) {
                  float stripePhase = fract((lat + halfW) / 1.0);
                  float zebra = aaRange(stripePhase, 0.22, 0.72) * aaRange(absLat, 0.0, halfW - 0.45);
                  col = mix(col, vec3(0.94, 0.95, 0.97), zebra * inCrosswalk * 0.93);
                }
                float stopBar = aaRange(dEnd, cwEnd + 0.35, cwEnd + 0.78) * aaRange(absLat, 0.22, halfW - 0.4);
                col = mix(col, vec3(0.94, 0.95, 0.97), stopBar * 0.9);
              }
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
 * Analytic GLSL railway track shader: crushed granite ballast bed, rhythmic timber/concrete
 * sleepers every 0.72m, and gleaming twin 1.44m standard-gauge steel rails (1 merged draw call!).
 */
function createRailLineMaterial(): THREE.MeshLambertMaterial {
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
        attribute vec2 aRailUV;
        varying vec2 vRailUV;
        varying vec2 vWorldXZ;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRailUV = aRailUV;
        vWorldXZ = (modelMatrix * vec4(position, 1.0)).xz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vRailUV;
        varying vec2 vWorldXZ;

        float rHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float rBand(float coord, float center, float halfW) {
          float fw = max(fwidth(coord), 0.004);
          return 1.0 - smoothstep(halfW - fw, halfW + fw, abs(coord - center));
        }`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float lat = vRailUV.x;
          float absLat = abs(lat);
          float distAlong = vRailUV.y;

          // Crushed granite/basalt railway ballast with multi-scale gravel grain
          float g1 = rHash(floor(vWorldXZ * 6.0));
          float g2 = rHash(floor(vWorldXZ * 1.8));
          float gravelNoise = (g1 * 0.65 + g2 * 0.35 - 0.5) * 0.12;
          vec3 col = vec3(0.41, 0.39, 0.36) + gravelNoise;

          // Darker embankment slope along ballast outer edges
          float edgeShade = smoothstep(1.65, 2.55, absLat);
          col = mix(col, vec3(0.28, 0.27, 0.24) + gravelNoise * 0.6, edgeShade * 0.65);

          // Rhythmic dark wooden/concrete sleepers every 0.72m across |lat| < 1.25m
          float sleeperPhase = fract(distAlong / 0.72);
          float sleeperMask = rBand(sleeperPhase, 0.5, 0.18) * (1.0 - smoothstep(1.18, 1.26, absLat));
          col = mix(col, vec3(0.24, 0.20, 0.17), sleeperMask * 0.92);

          // Twin standard-gauge steel rails at lat = ±0.72m (1.44m European gauge)
          float railWeb = rBand(absLat, 0.72, 0.085);
          col = mix(col, vec3(0.32, 0.22, 0.16), railWeb);
          float railTop = rBand(absLat, 0.72, 0.042);
          col = mix(col, vec3(0.76, 0.80, 0.84), railTop);

          diffuseColor.rgb = col;
        }`
      );
  };

  return mat;
}

/**
 * Builds purely visual, infinite-resolution vector road ribbons, intersection hubs,
 * shortcut paths, and optional railway tracks subdivided so every vertex sits flush on
 * `map.heightMap.sample(x, z)`.
 * Adds ZERO physics colliders — the single Terrain HeightMap collider remains the sole ground surface.
 */
export function buildVectorRoads(map: MapDefinition): THREE.Group {
  const group = new THREE.Group();
  const hm = map.heightMap;
  const isMikolow = map.id === 'mikolow';
  const visualLift = isMikolow ? 0.055 : 0.035;
  const townhall = isMikolow ? map.landmarks.find((l) => l.style === 'townhall') : undefined;
  const rynekX = townhall ? townhall.x + 22 : 0;
  const rynekZ = townhall ? townhall.z - 25 : 0;

  // Precompute max intersecting road half-width at each node for accurate sidewalk trimming on Mikołów
  const nodeMaxHalfW = new Map<string, number>();
  for (const node of map.graph.nodes.values()) {
    const adj = map.graph.adjacency.get(node.id) ?? [];
    let maxHalfW = 0;
    for (const a of adj) {
      if (!a.edge.isShortcut) {
        maxHalfW = Math.max(maxHalfW, a.edge.width * 0.5);
      }
    }
    nodeMaxHalfW.set(node.id, maxHalfW);
  }

  // --- 1. Main Vector Roads (1 merged BufferGeometry = 1 draw call!) ---
  const positions: number[] = [];
  const roadData: number[] = [];
  const roadFlags: number[] = [];
  const roadStyle: number[] = [];
  const indices: number[] = [];

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
    const curbW =
      e.sidewalkWidth !== undefined
        ? Math.max(0, e.sidewalkWidth)
        : e.roadType === 'country'
          ? 0.65
          : 1.55;
    const totalHalf = halfW + curbW;

    // Detect whether this road sits on flat ground or rolling hills:
    // Raxi City's core (±650) is flat and stays ultra-light (1 segment x 2 cols);
    // Mikołów and any sloped segment subdivide cleanly every ~8m so roads hug every hill!
    let isFlat = false;
    if (!isMikolow) {
      isFlat =
        Math.abs(a.x) <= 650 &&
        Math.abs(a.z) <= 650 &&
        Math.abs(b.x) <= 650 &&
        Math.abs(b.z) <= 650;
    } else {
      let minH = Infinity;
      let maxH = -Infinity;
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        const cx = a.x + dx * t;
        const cz = a.z + dz * t;
        const hC = hm.sample(cx, cz);
        const hL = hm.sample(cx - rx * totalHalf, cz - rz * totalHalf);
        const hR = hm.sample(cx + rx * totalHalf, cz + rz * totalHalf);
        minH = Math.min(minH, hC, hL, hR);
        maxH = Math.max(maxH, hC, hL, hR);
      }
      isFlat = maxH - minH < 0.08;
    }

    const latOffsets = isFlat
      ? [-totalHalf, totalHalf]
      : curbW >= 2.0
        ? [-totalHalf, -halfW, 0, halfW, totalHalf]
        : [-totalHalf, 0, totalHalf];
    const cols = latOffsets.length;
    const stepLen = isMikolow ? 8.0 : 10.0;
    const steps = isFlat ? 1 : Math.max(2, Math.ceil(len / stepLen));
    const baseVertex = positions.length / 3;
    const startLight = a.hasTrafficLight ? 1 : 0;
    const endLight = b.hasTrafficLight ? 1 : 0;

    // Sidewalk trim distances & visual style code
    let startTrim: number;
    let endTrim: number;
    let styleCode: number;
    if (!isMikolow) {
      const raxiTrim = e.width > 14.0 ? 9.2 : 8.2;
      startTrim = raxiTrim;
      endTrim = raxiTrim;
      styleCode = 0.0;
    } else {
      const maxA = nodeMaxHalfW.get(e.from) ?? halfW;
      const maxB = nodeMaxHalfW.get(e.to) ?? halfW;
      startTrim = Math.min(len * 0.35, Math.max(3.5, maxA + 0.55));
      endTrim = Math.min(len * 0.35, Math.max(3.5, maxB + 0.55));

      const midX = (a.x + b.x) * 0.5;
      const midZ = (a.z + b.z) * 0.5;
      const nearRynek =
        Math.hypot(midX - rynekX, midZ - rynekZ) < 165 ||
        Boolean(e.name && e.name.toLowerCase().includes('rynek'));
      if (e.roadType === 'highway' || e.roadType === 'country') {
        styleCode = 3.0;
      } else if (nearRynek || curbW >= 3.0) {
        styleCode = 2.0;
      } else {
        styleCode = 1.0;
      }
    }

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
        roadStyle.push(curbW, startTrim, endTrim, styleCode);
      }
    }

    // Build CCW upward-facing triangles (+Y normal)
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
  roadGeo.setAttribute('aRoadStyle', new THREE.Float32BufferAttribute(roadStyle, 4));
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
    const maxHalfW = nodeMaxHalfW.get(node.id) ?? 0;
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

  // --- 4. Conforming Railway Ballast + Twin Steel Rail Strips (1 merged draw call, purely visual!) ---
  if (map.railLines && map.railLines.length > 0) {
    const railPos: number[] = [];
    const railUV: number[] = [];
    const railIdx: number[] = [];
    const halfBallast = 2.6;
    const railLift = visualLift - 0.01;

    for (const line of map.railLines) {
      const pts = line.points;
      if (pts.length < 2) continue;
      let distAcc = 0;

      for (let p = 0; p < pts.length - 1; p++) {
        const [x0, z0] = pts[p];
        const [x1, z1] = pts[p + 1];
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.hypot(dx, dz);
        if (len < 0.5) continue;

        const rx = -dz / len;
        const rz = dx / len;
        const steps = Math.max(2, Math.ceil(len / 7.5));
        const baseV = railPos.length / 3;

        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const cx = x0 + dx * t;
          const cz = z0 + dz * t;
          const distAlong = distAcc + t * len;

          for (const lat of [-halfBallast, 0, halfBallast]) {
            const vx = cx + rx * lat;
            const vz = cz + rz * lat;
            railPos.push(vx, hm.sample(vx, vz) + railLift, vz);
            railUV.push(lat, distAlong);
          }
        }

        for (let s = 0; s < steps; s++) {
          for (let c = 0; c < 2; c++) {
            const i00 = baseV + s * 3 + c;
            const i01 = baseV + s * 3 + (c + 1);
            const i10 = baseV + (s + 1) * 3 + c;
            const i11 = baseV + (s + 1) * 3 + (c + 1);
            railIdx.push(i00, i01, i11, i00, i11, i10);
          }
        }

        distAcc += len;
      }
    }

    if (railPos.length > 0) {
      const railGeo = new THREE.BufferGeometry();
      railGeo.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3));
      railGeo.setAttribute('aRailUV', new THREE.Float32BufferAttribute(railUV, 2));
      railGeo.setIndex(railIdx);
      railGeo.computeVertexNormals();
      const railMesh = new THREE.Mesh(railGeo, createRailLineMaterial());
      railMesh.receiveShadow = true;
      group.add(railMesh);
    }
  }

  return group;
}
