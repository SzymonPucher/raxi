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

  // Precompute per-node arms, classifications, and per-edge trim distances
  interface NodeArm {
    edge: (typeof map.graph.edges)[number];
    ux: number;
    uz: number;
    angle: number;
    halfW: number;
    curbW: number;
    totalHalf: number;
    edgeLen: number;
    trim: number;
  }

  const nodeArms = new Map<string, NodeArm[]>();
  const edgeTrims = new Map<string, { startTrim: number; endTrim: number }>();

  for (const e of map.graph.edges) {
    edgeTrims.set(e.id, { startTrim: 0, endTrim: 0 });
  }

  for (const node of map.graph.nodes.values()) {
    const adj = map.graph.adjacency.get(node.id) ?? [];
    const seenEdges = new Set<string>();
    const arms: NodeArm[] = [];

    // Collect all incident non-shortcut, non-roundabout edges (both directions)
    for (const e of map.graph.edges) {
      if (e.isShortcut || e.isRoundabout) continue;
      if (e.from !== node.id && e.to !== node.id) continue;
      if (seenEdges.has(e.id)) continue;
      seenEdges.add(e.id);

      const otherId = e.from === node.id ? e.to : e.from;
      const other = map.graph.getNode(otherId);
      if (!other) continue;
      const dx = other.x - node.x;
      const dz = other.z - node.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.5) continue;

      const ux = dx / len;
      const uz = dz / len;
      const halfW = e.width * 0.5;
      const curbW =
        e.sidewalkWidth !== undefined
          ? Math.max(0, e.sidewalkWidth)
          : e.roadType === 'country'
            ? 0.65
            : 1.55;
      arms.push({
        edge: e,
        ux,
        uz,
        angle: Math.atan2(uz, ux),
        halfW,
        curbW,
        totalHalf: halfW + curbW,
        edgeLen: len,
        trim: 0,
      });
    }

    // Keep unused adj reference silent if needed
    void adj;

    arms.sort((a, b) => a.angle - b.angle);
    nodeArms.set(node.id, arms);

    if (arms.length >= 3) {
      const maxHalfW = Math.max(...arms.map((a) => a.halfW));
      const fillet = isMikolow ? 3.0 : 3.6;

      for (let i = 0; i < arms.length; i++) {
        const cur = arms[i];
        const prev = arms[(i - 1 + arms.length) % arms.length];
        const next = arms[(i + 1) % arms.length];

        let d = maxHalfW + 1.2;
        for (const nb of [prev, next]) {
          let dTheta = Math.abs(nb.angle - cur.angle);
          if (dTheta > Math.PI) dTheta = Math.PI * 2 - dTheta;
          if (dTheta > 0.25 && dTheta < Math.PI - 0.15) {
            const sinT = Math.sin(dTheta);
            const cosT = Math.cos(dTheta);
            const cornerDist = (nb.halfW + cur.halfW * cosT) / sinT;
            d = Math.max(d, cornerDist + fillet * 0.45);
          }
        }

        const trim = Math.min(cur.edgeLen * 0.36, Math.max(maxHalfW + 1.1, Math.min(maxHalfW * 2.35, d)));
        cur.trim = trim;
        const et = edgeTrims.get(cur.edge.id)!;
        if (cur.edge.from === node.id) et.startTrim = trim;
        else et.endTrim = trim;
      }
    }
  }

  // Group roundabout edges by roundaboutId and precompute roundabout outer trim for approach arms
  const roundabouts = new Map<string, Array<(typeof map.graph.edges)[number]>>();
  for (const e of map.graph.edges) {
    if (e.isRoundabout && e.roundaboutId) {
      let list = roundabouts.get(e.roundaboutId);
      if (!list) {
        list = [];
        roundabouts.set(e.roundaboutId, list);
      }
      list.push(e);
    }
  }

  const roundaboutNodeIds = new Set<string>();
  for (const rbEdges of roundabouts.values()) {
    const rbNodeSet = new Set<string>();
    let sumW = 0;
    for (const e of rbEdges) {
      rbNodeSet.add(e.from);
      rbNodeSet.add(e.to);
      sumW += e.width;
    }
    const avgRingW = sumW / Math.max(1, rbEdges.length);
    const halfRing = avgRingW * 0.5;
    for (const nid of rbNodeSet) {
      roundaboutNodeIds.add(nid);
      const arms = nodeArms.get(nid) ?? [];
      for (const arm of arms) {
        const trim = Math.min(arm.edgeLen * 0.36, halfRing + 0.6);
        arm.trim = trim;
        const et = edgeTrims.get(arm.edge.id)!;
        if (arm.edge.from === nid) et.startTrim = trim;
        else et.endTrim = trim;
      }
    }
  }

  // --- 1. Main Vector Roads (1 merged BufferGeometry = 1 draw call!) ---
  const positions: number[] = [];
  const roadData: number[] = [];
  const roadFlags: number[] = [];
  const roadStyle: number[] = [];
  const indices: number[] = [];

  for (const e of map.graph.edges) {
    if (e.isShortcut || e.isRoundabout) continue;
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

    const et = edgeTrims.get(e.id)!;
    const startTrim = Math.min(len * 0.42, et.startTrim);
    const endTrim = Math.min(len * 0.42, et.endTrim);
    const trimmedLen = len - startTrim - endTrim;
    if (trimmedLen < 0.5) continue;

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
        const t = (startTrim + trimmedLen * (k / 4)) / len;
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
    const steps = isFlat ? 1 : Math.max(2, Math.ceil(trimmedLen / stepLen));
    const baseVertex = positions.length / 3;
    const startLight = a.hasTrafficLight ? 1 : 0;
    const endLight = b.hasTrafficLight ? 1 : 0;

    let styleCode: number;
    if (!isMikolow) {
      styleCode = 0.0;
    } else {
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

    // Curb trim in shader: for trimmed intersections, geometry already starts/ends at startTrim/endTrim;
    // pass startTrim/endTrim so crosswalks and lane markings align cleanly with the intersection mouth.
    const shaderStartTrim = !isMikolow ? (e.width > 14.0 ? 9.2 : 8.2) : startTrim;
    const shaderEndTrim = !isMikolow ? (e.width > 14.0 ? 9.2 : 8.2) : endTrim;

    for (let s = 0; s <= steps; s++) {
      const distStart = startTrim + trimmedLen * (s / steps);
      const distEnd = len - distStart;
      const t = distStart / len;
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
        roadStyle.push(curbW, shaderStartTrim, shaderEndTrim, styleCode);
      }
    }

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

  // --- 1b. Predefined Roundabout Asphalt Rings (added to roadMesh for unified vector markings!) ---
  const islandPos: number[] = [];
  const islandCol: number[] = [];
  const islandIdx: number[] = [];

  for (const rbEdges of roundabouts.values()) {
    const rbNodeSet = new Set<string>();
    let sumW = 0;
    for (const e of rbEdges) {
      rbNodeSet.add(e.from);
      rbNodeSet.add(e.to);
      sumW += e.width;
    }
    const center = rbEdges[0].roundaboutCenter;
    const rbNodes = Array.from(rbNodeSet)
      .map((id) => map.graph.getNode(id)!)
      .filter(Boolean);
    if (rbNodes.length < 3) continue;

    const cx = center ? center.x : rbNodes.reduce((s, n) => s + n.x, 0) / rbNodes.length;
    const cz = center ? center.z : rbNodes.reduce((s, n) => s + n.z, 0) / rbNodes.length;

    const nodePolar = rbNodes
      .map((n) => ({
        ang: Math.atan2(n.z - cz, n.x - cx),
        rad: Math.hypot(n.x - cx, n.z - cz),
      }))
      .sort((a, b) => a.ang - b.ang);

    const sampleRadiusAtAngle = (ang: number): number => {
      if (nodePolar.length === 0) return center?.radius ?? 12;
      let a = ang;
      while (a < nodePolar[0].ang) a += Math.PI * 2;
      while (a >= nodePolar[0].ang + Math.PI * 2) a -= Math.PI * 2;
      for (let i = 0; i < nodePolar.length; i++) {
        const p0 = nodePolar[i];
        const p1 = nodePolar[(i + 1) % nodePolar.length];
        const a0 = p0.ang;
        const a1 = i + 1 < nodePolar.length ? p1.ang : p1.ang + Math.PI * 2;
        if (a >= a0 && a <= a1) {
          const t = (a - a0) / Math.max(0.0001, a1 - a0);
          return p0.rad + (p1.rad - p0.rad) * t;
        }
      }
      return nodePolar[0].rad;
    };

    const ringW = Math.max(7.0, sumW / rbEdges.length);
    const halfRing = ringW * 0.5;
    const segs = 48;
    const baseV = positions.length / 3;
    const avgR = nodePolar.reduce((s, p) => s + p.rad, 0) / nodePolar.length;
    const totalCirc = Math.PI * 2 * avgR;

    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const ang = -Math.PI + u * Math.PI * 2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const rMid = sampleRadiusAtAngle(ang);
      const distAlong = u * totalCirc;

      for (const lat of [-halfRing, 0, halfRing]) {
        const r = Math.max(1.2, rMid + lat);
        const vx = cx + cosA * r;
        const vz = cz + sinA * r;
        const vy = hm.sample(vx, vz) + visualLift;
        positions.push(vx, vy, vz);
        roadData.push(lat, distAlong, totalCirc - distAlong, ringW);
        roadFlags.push(1, 0, 0);
        roadStyle.push(0, 0, 0, isMikolow ? 1.0 : 0.0);
      }
    }

    for (let s = 0; s < segs; s++) {
      for (let c = 0; c < 2; c++) {
        const i00 = baseV + s * 3 + c;
        const i01 = baseV + s * 3 + (c + 1);
        const i10 = baseV + (s + 1) * 3 + c;
        const i11 = baseV + (s + 1) * 3 + (c + 1);
        indices.push(i00, i11, i01, i00, i10, i11);
      }
    }

    // Central island: outer granite curb + brick/cobble apron + lush green lawn center
    const islandCenterIdx = islandPos.length / 3;
    islandPos.push(cx, hm.sample(cx, cz) + visualLift + 0.09, cz);
    islandCol.push(0.28, 0.49, 0.23);

    const ringStartIdx = islandPos.length / 3;
    for (let s = 0; s < segs; s++) {
      const ang = -Math.PI + (s / segs) * Math.PI * 2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const rIn = Math.max(1.5, sampleRadiusAtAngle(ang) - halfRing);
      const rApron = Math.max(0.9, rIn - Math.min(1.5, rIn * 0.28));
      const rGrass = Math.max(0.5, rApron - 0.35);

      // 0: grass edge
      const gx = cx + cosA * rGrass;
      const gz = cz + sinA * rGrass;
      islandPos.push(gx, hm.sample(gx, gz) + visualLift + 0.08, gz);
      islandCol.push(0.32, 0.54, 0.26);

      // 1: curb inner / apron inner
      const ax = cx + cosA * rApron;
      const az = cz + sinA * rApron;
      islandPos.push(ax, hm.sample(ax, az) + visualLift + 0.05, az);
      islandCol.push(0.52, 0.48, 0.44);

      // 2: apron outer (meets asphalt inner edge)
      const ox = cx + cosA * rIn;
      const oz = cz + sinA * rIn;
      islandPos.push(ox, hm.sample(ox, oz) + visualLift + 0.02, oz);
      islandCol.push(0.38, 0.39, 0.41);
    }

    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs;
      const c0 = ringStartIdx + s * 3;
      const n0 = ringStartIdx + next * 3;
      // Grass fan (+Y normal)
      islandIdx.push(islandCenterIdx, n0, c0);
      // Apron ring (+Y normal)
      islandIdx.push(c0, n0, n0 + 1, c0, n0 + 1, c0 + 1);
      islandIdx.push(c0 + 1, n0 + 1, n0 + 2, c0 + 1, n0 + 2, c0 + 2);
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

  if (islandPos.length > 0) {
    const islandGeo = new THREE.BufferGeometry();
    islandGeo.setAttribute('position', new THREE.Float32BufferAttribute(islandPos, 3));
    islandGeo.setAttribute('color', new THREE.Float32BufferAttribute(islandCol, 3));
    islandGeo.setIndex(islandIdx);
    islandGeo.computeVertexNormals();
    const islandMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const islandMesh = new THREE.Mesh(islandGeo, islandMat);
    islandMesh.receiveShadow = true;
    group.add(islandMesh);
  }

  // --- 2. Predefined Intersection Elements (Asphalt Junctions, Curb Fillets, Bend Wedges, Cul-de-sacs) ---
  const hubPos: number[] = [];
  const hubIdx: number[] = [];
  const filletPos: number[] = [];
  const filletIdx: number[] = [];

  for (const node of map.graph.nodes.values()) {
    if (roundaboutNodeIds.has(node.id)) continue;
    const arms = nodeArms.get(node.id) ?? [];
    if (arms.length === 0) continue;

    if (arms.length === 1) {
      // Predefined Dead-End / Cul-de-sac Cap
      const arm = arms[0];
      const hw = arm.halfW;
      const tw = arm.totalHalf;
      const segs = 10;
      const cIdx = hubPos.length / 3;
      hubPos.push(node.x, hm.sample(node.x, node.z) + visualLift - 0.002, node.z);
      const startAng = arm.angle + Math.PI * 0.5;
      for (let k = 0; k <= segs; k++) {
        const ang = startAng + (k / segs) * Math.PI;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const vx = node.x + cosA * hw;
        const vz = node.z + sinA * hw;
        hubPos.push(vx, hm.sample(vx, vz) + visualLift - 0.002, vz);
      }
      for (let k = 0; k < segs; k++) {
        hubIdx.push(cIdx, cIdx + 1 + k + 1, cIdx + 1 + k);
      }

      if (tw > hw + 0.1) {
        const fBase = filletPos.length / 3;
        for (let k = 0; k <= segs; k++) {
          const ang = startAng + (k / segs) * Math.PI;
          const cosA = Math.cos(ang);
          const sinA = Math.sin(ang);
          const ix = node.x + cosA * hw;
          const iz = node.z + sinA * hw;
          const ox = node.x + cosA * tw;
          const oz = node.z + sinA * tw;
          filletPos.push(ix, hm.sample(ix, iz) + visualLift - 0.003, iz);
          filletPos.push(ox, hm.sample(ox, oz) + visualLift - 0.003, oz);
        }
        for (let k = 0; k < segs; k++) {
          const i0 = fBase + k * 2;
          const i1 = fBase + (k + 1) * 2;
          filletIdx.push(i0, i1, i1 + 1, i0, i1 + 1, i0 + 1);
        }
      }
    } else if (arms.length === 2) {
      // Predefined Smooth Bend Joint (fills outer wedge without breaking sidewalks!)
      const maxHW = Math.max(arms[0].halfW, arms[1].halfW);
      const maxTW = Math.max(arms[0].totalHalf, arms[1].totalHalf);
      const rad = maxHW + 0.15;
      const segs = 12;
      const cIdx = hubPos.length / 3;
      hubPos.push(node.x, hm.sample(node.x, node.z) + visualLift - 0.004, node.z);
      for (let k = 0; k < segs; k++) {
        const ang = (k / segs) * Math.PI * 2;
        const vx = node.x + Math.cos(ang) * rad;
        const vz = node.z + Math.sin(ang) * rad;
        hubPos.push(vx, hm.sample(vx, vz) + visualLift - 0.004, vz);
      }
      for (let k = 0; k < segs; k++) {
        const next = (k + 1) % segs;
        hubIdx.push(cIdx, cIdx + 1 + next, cIdx + 1 + k);
      }

      if (maxTW > maxHW + 0.1) {
        const fBase = filletPos.length / 3;
        for (let k = 0; k < segs; k++) {
          const ang = (k / segs) * Math.PI * 2;
          const cosA = Math.cos(ang);
          const sinA = Math.sin(ang);
          const ix = node.x + cosA * maxHW;
          const iz = node.z + sinA * maxHW;
          const ox = node.x + cosA * maxTW;
          const oz = node.z + sinA * maxTW;
          filletPos.push(ix, hm.sample(ix, iz) + visualLift - 0.006, iz);
          filletPos.push(ox, hm.sample(ox, oz) + visualLift - 0.006, oz);
        }
        for (let k = 0; k < segs; k++) {
          const next = (k + 1) % segs;
          const i0 = fBase + k * 2;
          const i1 = fBase + next * 2;
          filletIdx.push(i0, i1, i1 + 1, i0, i1 + 1, i0 + 1);
        }
      }
    } else {
      // Predefined 3+ Way Intersection Polygon with Smooth Bezier Curb Fillets!
      const boundaryAsphalt: Array<[number, number]> = [];
      const cornerSteps = 5;

      for (let i = 0; i < arms.length; i++) {
        const a0 = arms[i];
        const a1 = arms[(i + 1) % arms.length];

        // Right vector of arm i (in XZ, +90° in atan2): (-uz, ux)
        const r0x = -a0.uz;
        const r0z = a0.ux;
        const r1x = -a1.uz;
        const r1z = a1.ux;

        // Arm i mouth: Left corner -> Right corner
        const p0Lx = node.x + a0.ux * a0.trim - r0x * a0.halfW;
        const p0Lz = node.z + a0.uz * a0.trim - r0z * a0.halfW;
        const p0Rx = node.x + a0.ux * a0.trim + r0x * a0.halfW;
        const p0Rz = node.z + a0.uz * a0.trim + r0z * a0.halfW;

        // Next arm mouth Left corner
        const p1Lx = node.x + a1.ux * a1.trim - r1x * a1.halfW;
        const p1Lz = node.z + a1.uz * a1.trim - r1z * a1.halfW;

        boundaryAsphalt.push([p0Lx, p0Lz]);
        boundaryAsphalt.push([p0Rx, p0Rz]);

        // Smooth Bezier fillet from p0R to p1L
        const midCornerX = (p0Rx + p1Lx) * 0.5;
        const midCornerZ = (p0Rz + p1Lz) * 0.5;
        // Pull control point slightly toward node center for concave curb return
        const ctrlX = node.x + (midCornerX - node.x) * 0.65;
        const ctrlZ = node.z + (midCornerZ - node.z) * 0.65;

        const filletAvgCurb = (a0.curbW + a1.curbW) * 0.5;
        const fBase = filletPos.length / 3;
        const hasCurb = filletAvgCurb > 0.15;

        for (let s = 0; s <= cornerSteps; s++) {
          const u = s / cornerSteps;
          const omt = 1 - u;
          const bx = omt * omt * p0Rx + 2 * omt * u * ctrlX + u * u * p1Lx;
          const bz = omt * omt * p0Rz + 2 * omt * u * ctrlZ + u * u * p1Lz;
          if (s > 0 && s < cornerSteps) {
            boundaryAsphalt.push([bx, bz]);
          }

          if (hasCurb) {
            // Tangent along curve -> outward normal points away from intersection
            const tx = 2 * omt * (ctrlX - p0Rx) + 2 * u * (p1Lx - ctrlX);
            const tz = 2 * omt * (ctrlZ - p0Rz) + 2 * u * (p1Lz - ctrlZ);
            const tLen = Math.max(0.001, Math.hypot(tx, tz));
            const outX = -tz / tLen;
            const outZ = tx / tLen;
            const curbAtU = a0.curbW + (a1.curbW - a0.curbW) * u;
            const ox = bx + outX * curbAtU;
            const oz = bz + outZ * curbAtU;
            filletPos.push(bx, hm.sample(bx, bz) + visualLift - 0.001, bz);
            filletPos.push(ox, hm.sample(ox, oz) + visualLift - 0.001, oz);
          }
        }

        if (hasCurb) {
          for (let s = 0; s < cornerSteps; s++) {
            const i0 = fBase + s * 2;
            const i1 = fBase + (s + 1) * 2;
            filletIdx.push(i0, i1, i1 + 1, i0, i1 + 1, i0 + 1);
          }
        }
      }

      const cIdx = hubPos.length / 3;
      hubPos.push(node.x, hm.sample(node.x, node.z) + visualLift - 0.001, node.z);
      for (const [bx, bz] of boundaryAsphalt) {
        hubPos.push(bx, hm.sample(bx, bz) + visualLift - 0.001, bz);
      }
      const nPts = boundaryAsphalt.length;
      for (let k = 0; k < nPts; k++) {
        const next = (k + 1) % nPts;
        hubIdx.push(cIdx, cIdx + 1 + next, cIdx + 1 + k);
      }
    }
  }

  if (hubPos.length > 0) {
    const hubGeo = new THREE.BufferGeometry();
    hubGeo.setAttribute('position', new THREE.Float32BufferAttribute(hubPos, 3));
    hubGeo.setIndex(hubIdx);
    hubGeo.computeVertexNormals();
    const hubMat = new THREE.MeshLambertMaterial({
      color: 0x32363b,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const hubMesh = new THREE.Mesh(hubGeo, hubMat);
    hubMesh.receiveShadow = true;
    group.add(hubMesh);
  }

  if (filletPos.length > 0) {
    const filletGeo = new THREE.BufferGeometry();
    filletGeo.setAttribute('position', new THREE.Float32BufferAttribute(filletPos, 3));
    filletGeo.setIndex(filletIdx);
    filletGeo.computeVertexNormals();
    const filletMat = new THREE.MeshLambertMaterial({
      color: isMikolow ? 0xa5a7ab : 0x9ea3aa,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const filletMesh = new THREE.Mesh(filletGeo, filletMat);
    filletMesh.receiveShadow = true;
    group.add(filletMesh);
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
    const bridges = map.railwayBridges ?? [];
    const insideBridge = (wx: number, wz: number): boolean =>
      bridges.some((b) => Math.hypot(wx - b.x, wz - b.z) < b.spanLength * 0.52);

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

        for (let s = 0; s < steps; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          const mx = x0 + dx * ((t0 + t1) * 0.5);
          const mz = z0 + dz * ((t0 + t1) * 0.5);
          if (insideBridge(mx, mz)) continue;

          const baseV = railPos.length / 3;
          for (const t of [t0, t1]) {
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
          for (let c = 0; c < 2; c++) {
            const i00 = baseV + c;
            const i01 = baseV + (c + 1);
            const i10 = baseV + 3 + c;
            const i11 = baseV + 3 + (c + 1);
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
