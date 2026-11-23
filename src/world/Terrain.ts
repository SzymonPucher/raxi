import * as THREE from 'three';
import { CG } from '../physics/collisionGroups';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { GreenZoneDef, GreenZoneKind, MapDefinition } from './mapData';
import { buildVectorRoads } from './VectorRoads';

interface BoundedGreenZone {
  zone: GreenZoneDef;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  priority: number;
}

const GREEN_ZONE_PRIORITY: Record<GreenZoneKind, number> = {
  sports: 6,
  cemetery: 5,
  park: 4,
  lawn: 3,
  forest: 2,
  meadow: 1,
};

function pointInPolygon(x: number, z: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const zi = polygon[i][1];
    const xj = polygon[j][0];
    const zj = polygon[j][1];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function prepareGreenZones(zones: GreenZoneDef[]): BoundedGreenZone[] {
  const prepared: BoundedGreenZone[] = [];
  for (const zone of zones) {
    if (zone.polygon.length < 3) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [px, pz] of zone.polygon) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz;
      if (pz > maxZ) maxZ = pz;
    }
    prepared.push({
      zone,
      minX,
      maxX,
      minZ,
      maxZ,
      priority: GREEN_ZONE_PRIORITY[zone.kind] ?? 1,
    });
  }
  prepared.sort((a, b) => b.priority - a.priority);
  return prepared;
}

/**
 * Builds crisp white pitch markings (touchlines, halfway line, center circle)
 * strictly conforming to the heightmap inside `sports` green zones (1 draw call, zero colliders).
 */
function buildSportsPitchMarkings(
  map: MapDefinition,
  boundedZones: BoundedGreenZone[]
): THREE.Mesh | null {
  const sportsZones = boundedZones.filter((b) => b.zone.kind === 'sports');
  if (sportsZones.length === 0) return null;

  const hm = map.heightMap;
  const positions: number[] = [];
  const indices: number[] = [];
  const lift = 0.048;

  const pushStrip = (x0: number, z0: number, x1: number, z1: number, width: number) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) return;
    const rx = (-dz / len) * (width * 0.5);
    const rz = (dx / len) * (width * 0.5);
    const steps = Math.max(1, Math.ceil(len / 8));
    const base = positions.length / 3;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = x0 + dx * t;
      const cz = z0 + dz * t;
      const lx = cx - rx;
      const lz = cz - rz;
      const rvx = cx + rx;
      const rvz = cz + rz;
      positions.push(lx, hm.sample(lx, lz) + lift, lz);
      positions.push(rvx, hm.sample(rvx, rvz) + lift, rvz);
    }
    for (let s = 0; s < steps; s++) {
      const i00 = base + s * 2;
      const i01 = base + s * 2 + 1;
      const i10 = base + (s + 1) * 2;
      const i11 = base + (s + 1) * 2 + 1;
      indices.push(i00, i01, i11, i00, i11, i10);
    }
  };

  for (const bz of sportsZones) {
    const w = bz.maxX - bz.minX;
    const d = bz.maxZ - bz.minZ;
    if (w < 24 || d < 24) continue;

    const cx = (bz.minX + bz.maxX) * 0.5;
    const cz = (bz.minZ + bz.maxZ) * 0.5;
    // Fit an authentic football pitch inside the sports polygon
    const pitchW = Math.min(w * 0.62, 72);
    const pitchD = Math.min(d * 0.62, 100);
    const hw = pitchW * 0.5;
    const hd = pitchD * 0.5;

    // Verify corners sit inside the sports polygon
    if (
      !pointInPolygon(cx - hw, cz - hd, bz.zone.polygon) ||
      !pointInPolygon(cx + hw, cz - hd, bz.zone.polygon) ||
      !pointInPolygon(cx + hw, cz + hd, bz.zone.polygon) ||
      !pointInPolygon(cx - hw, cz + hd, bz.zone.polygon)
    ) {
      continue;
    }

    const lineW = 0.42;
    // Outer boundary rectangle
    pushStrip(cx - hw, cz - hd, cx + hw, cz - hd, lineW);
    pushStrip(cx + hw, cz - hd, cx + hw, cz + hd, lineW);
    pushStrip(cx + hw, cz + hd, cx - hw, cz + hd, lineW);
    pushStrip(cx - hw, cz + hd, cx - hw, cz - hd, lineW);

    // Halfway line across the shorter dimension
    if (pitchD >= pitchW) {
      pushStrip(cx - hw, cz, cx + hw, cz, lineW);
    } else {
      pushStrip(cx, cz - hd, cx, cz + hd, lineW);
    }

    // Center circle
    const rad = Math.min(9.15, Math.min(hw, hd) * 0.32);
    const segs = 20;
    for (let k = 0; k < segs; k++) {
      const a0 = (k / segs) * Math.PI * 2;
      const a1 = ((k + 1) / segs) * Math.PI * 2;
      pushStrip(
        cx + Math.cos(a0) * rad,
        cz + Math.sin(a0) * rad,
        cx + Math.cos(a1) * rad,
        cz + Math.sin(a1) * rad,
        lineW * 0.85
      );
    }
  }

  if (positions.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({
    color: 0xf4f7f4,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Builds drivable asphalt parking lots with crisp white painted stall lines & driving aisles
 * strictly draped onto `map.heightMap` for all landmarks that define `parkingLots`
 * (2 merged draw calls total, zero extra colliders).
 */
function buildParkingLots(map: MapDefinition): THREE.Group | null {
  const lots: Array<{ polygon: Array<[number, number]>; stallAngle?: number }> = [];
  for (const lm of map.landmarks) {
    if (lm.parkingLots && lm.parkingLots.length > 0) {
      for (const lot of lm.parkingLots) {
        if (lot.polygon.length >= 3) lots.push(lot);
      }
    }
  }
  if (lots.length === 0) return null;

  const hm = map.heightMap;
  const asphaltPos: number[] = [];
  const asphaltIdx: number[] = [];
  const linePos: number[] = [];
  const lineIdx: number[] = [];

  const asphaltLift = 0.065;
  const lineLift = 0.105;

  // Subdivide any triangle whose longest edge > 12m so asphalt conforms smoothly to rolling hills
  const pushSubdividedTri = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    cx: number,
    cz: number,
    depth = 0
  ) => {
    const ab = Math.hypot(bx - ax, bz - az);
    const bc = Math.hypot(cx - bx, cz - bz);
    const ca = Math.hypot(ax - cx, az - cz);
    const maxEdge = Math.max(ab, bc, ca);
    if (maxEdge > 12 && depth < 4) {
      if (ab >= bc && ab >= ca) {
        const mx = (ax + bx) * 0.5;
        const mz = (az + bz) * 0.5;
        pushSubdividedTri(ax, az, mx, mz, cx, cz, depth + 1);
        pushSubdividedTri(mx, mz, bx, bz, cx, cz, depth + 1);
      } else if (bc >= ab && bc >= ca) {
        const mx = (bx + cx) * 0.5;
        const mz = (bz + cz) * 0.5;
        pushSubdividedTri(ax, az, bx, bz, mx, mz, depth + 1);
        pushSubdividedTri(ax, az, mx, mz, cx, cz, depth + 1);
      } else {
        const mx = (cx + ax) * 0.5;
        const mz = (cz + az) * 0.5;
        pushSubdividedTri(ax, az, bx, bz, mx, mz, depth + 1);
        pushSubdividedTri(mx, mz, bx, bz, cx, cz, depth + 1);
      }
      return;
    }
    const base = asphaltPos.length / 3;
    asphaltPos.push(
      ax, hm.sample(ax, az) + asphaltLift, az,
      bx, hm.sample(bx, bz) + asphaltLift, bz,
      cx, hm.sample(cx, cz) + asphaltLift, cz
    );
    // Ensure upward (+Y) triangle winding
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (cross < 0) {
      asphaltIdx.push(base, base + 1, base + 2);
    } else {
      asphaltIdx.push(base, base + 2, base + 1);
    }
  };

  const pushLineStrip = (x0: number, z0: number, x1: number, z1: number, width: number) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.4) return;
    const rx = (-dz / len) * (width * 0.5);
    const rz = (dx / len) * (width * 0.5);
    const steps = Math.max(1, Math.ceil(len / 8));
    const base = linePos.length / 3;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = x0 + dx * t;
      const cz = z0 + dz * t;
      const lx = cx - rx;
      const lz = cz - rz;
      const rvx = cx + rx;
      const rvz = cz + rz;
      linePos.push(lx, hm.sample(lx, lz) + lineLift, lz);
      linePos.push(rvx, hm.sample(rvx, rvz) + lineLift, rvz);
    }
    for (let s = 0; s < steps; s++) {
      const i00 = base + s * 2;
      const i01 = base + s * 2 + 1;
      const i10 = base + (s + 1) * 2;
      const i11 = base + (s + 1) * 2 + 1;
      lineIdx.push(i00, i01, i11, i00, i11, i10);
    }
  };

  for (const lot of lots) {
    const poly = lot.polygon;
    const contour = poly.map(([x, z]) => new THREE.Vector2(x, z));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [i0, i1, i2] of faces) {
      pushSubdividedTri(
        poly[i0][0], poly[i0][1],
        poly[i1][0], poly[i1][1],
        poly[i2][0], poly[i2][1]
      );
    }

    // Subtle white perimeter curb marking around lot boundary
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      pushLineStrip(a[0], a[1], b[0], b[1], 0.28);
    }

    // Painted parking stall bays oriented along stallAngle (2.7m wide x 5.0m deep double rows + 6.5m driving aisle)
    const angle = lot.stallAngle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [px, pz] of poly) {
      const u = px * cos + pz * sin;
      const v = -px * sin + pz * cos;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    const toWorld = (u: number, v: number): [number, number] => [
      u * cos - v * sin,
      u * sin + v * cos,
    ];

    const isWellInside = (x: number, z: number): boolean => {
      if (!pointInPolygon(x, z, poly)) return false;
      // Keep stalls >= 2.2m inside the lot perimeter
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const lenSq = dx * dx + dz * dz;
        const t = lenSq < 1e-6 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lenSq));
        const dist = Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
        if (dist < 2.2) return false;
      }
      return true;
    };

    const rowPitch = 16.5; // 5m bay + 5m back-to-back bay + 6.5m driving aisle
    const stallW = 2.8;
    const stallD = 5.0;

    for (let v = minV + 6; v <= maxV - 6; v += rowPitch) {
      // Spine line separating back-to-back parking stalls + individual stall ticks
      let prevSpine: [number, number] | null = null;
      for (let u = minU + 4; u <= maxU - 4; u += stallW) {
        const [sx, sz] = toWorld(u, v);
        const [tx0, tz0] = toWorld(u, v - stallD);
        const [tx1, tz1] = toWorld(u, v + stallD);
        const centerOk = isWellInside(sx, sz);
        if (centerOk) {
          if (prevSpine) {
            pushLineStrip(prevSpine[0], prevSpine[1], sx, sz, 0.16);
          }
          prevSpine = [sx, sz];
          if (isWellInside(tx0, tz0)) {
            pushLineStrip(sx, sz, tx0, tz0, 0.15);
          }
          if (isWellInside(tx1, tz1)) {
            pushLineStrip(sx, sz, tx1, tz1, 0.15);
          }
        } else {
          prevSpine = null;
        }
      }
    }
  }

  const group = new THREE.Group();

  if (asphaltPos.length > 0) {
    const aGeo = new THREE.BufferGeometry();
    aGeo.setAttribute('position', new THREE.Float32BufferAttribute(asphaltPos, 3));
    aGeo.setIndex(asphaltIdx);
    aGeo.computeVertexNormals();
    const aMat = new THREE.MeshLambertMaterial({
      color: 0x3b4046,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const aMesh = new THREE.Mesh(aGeo, aMat);
    aMesh.receiveShadow = true;
    group.add(aMesh);
  }

  if (linePos.length > 0) {
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    lGeo.setIndex(lineIdx);
    lGeo.computeVertexNormals();
    const lMat = new THREE.MeshLambertMaterial({
      color: 0xe6ecee,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const lMesh = new THREE.Mesh(lGeo, lMat);
    lMesh.receiveShadow = true;
    group.add(lMesh);
  }

  return group;
}

/**
 * Generates ONE single terrain mesh + ONE single Rapier terrain collider directly from
 * `map.heightMap`, overlaid with resolution-independent analytic GLSL vector roads
 * whose vertices conform strictly to `map.heightMap.sample(x, z)` (zero separate road colliders).
 */
export function buildTerrain(
  map: MapDefinition,
  physics: PhysicsWorld
): { group: THREE.Group; groundColliderHandle: number } {
  const group = new THREE.Group();
  const hm = map.heightMap;
  const size = hm.worldHalfSize * 2;
  const seg = hm.segments;

  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI * 0.5);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  const hasGreenZones = Boolean(map.greenZones && map.greenZones.length > 0);
  const boundedGreenZones = hasGreenZones ? prepareGreenZones(map.greenZones!) : [];

  // Pre-collect urban/commercial landmark spots & Rynek center for authentic Silesian hardscape tinting
  const townhall = hasGreenZones ? map.landmarks.find((l) => l.style === 'townhall') : undefined;
  const rynekX = townhall ? townhall.x + 22 : 0;
  const rynekZ = townhall ? townhall.z - 25 : 0;
  const urbanHardscapeSpots = hasGreenZones
    ? map.landmarks.filter(
        (l) =>
          l.style === 'train_station' ||
          l.style === 'retail_center' ||
          l.style === 'townhall' ||
          l.style === 'mall' ||
          l.style === 'hospital'
      )
    : [];

  let maxTerrainY = 0;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = hm.heights[i];
    if (y > maxTerrainY) maxTerrainY = y;
    pos.setY(i, y);

    if (hasGreenZones) {
      // Accurate polygon-driven green zones & Silesian town surface classification
      let matchedKind: GreenZoneKind | null = null;
      for (let g = 0; g < boundedGreenZones.length; g++) {
        const bz = boundedGreenZones[g];
        if (x < bz.minX || x > bz.maxX || z < bz.minZ || z > bz.maxZ) continue;
        if (pointInPolygon(x, z, bz.zone.polygon)) {
          matchedKind = bz.zone.kind;
          break;
        }
      }

      // Gentle organic variation so large fields/woods feel alive
      const organic = (Math.sin(x * 0.032 + z * 0.017) * Math.cos(z * 0.029 - x * 0.013)) * 0.028;

      if (matchedKind === 'sports') {
        const stripe = Math.floor((x + 2000) / 12) % 2 === 0 ? 0.025 : -0.02;
        c.setHex(0x3fb94e).offsetHSL(0, 0.02, stripe);
      } else if (matchedKind === 'park') {
        c.setHex(0x4ea64b).offsetHSL(0, 0, organic);
      } else if (matchedKind === 'forest') {
        c.setHex(0x2f6838).offsetHSL(0, 0, organic * 0.85);
      } else if (matchedKind === 'cemetery') {
        c.setHex(0x407c4b).offsetHSL(0, 0, organic * 0.6);
      } else if (matchedKind === 'lawn') {
        c.setHex(0x6ab354).offsetHSL(0, 0, organic * 0.7);
      } else if (matchedKind === 'meadow') {
        c.setHex(0x6da44b).offsetHSL(0.01, -0.02, organic * 1.1);
      } else {
        // Non-green-zone ground: Rynek cobblestone plaza -> Old Town stone -> urban/suburban lawns -> outskirts
        const distCenter = Math.hypot(x - rynekX, z - rynekZ);
        if (distCenter <= 68) {
          // Warm Silesian granite / Rynek cobblestone plaza
          c.setHex(0xb8ad9c).offsetHSL(0, 0, organic * 0.4);
        } else if (distCenter <= 190) {
          // Historic Old Town paved stone & courtyards
          c.setHex(0x9e988e).offsetHSL(0, 0, organic * 0.45);
        } else if (
          urbanHardscapeSpots.some(
            (l) => Math.abs(x - l.x) < l.footprintW * 0.9 + 24 && Math.abs(z - l.z) < l.footprintD * 0.9 + 24
          )
        ) {
          // Commercial / railway station / civic paved yard
          c.setHex(0x8e8d88).offsetHSL(0, 0, organic * 0.4);
        } else if (distCenter <= 680) {
          // Polish residential estate & suburban garden turf
          c.setHex(0x78a958).offsetHSL(0, 0, organic * 0.9);
        } else {
          // Rolling Silesian outskirts countryside & hillsides
          c.setHex(0x6ba04b).offsetHSL(0.008, -0.02, organic * 1.1);
        }
      }
    } else {
      // Original Raxi City ground biomes & city districts (100% unchanged!)
      if (
        x >= map.parkBounds.minX &&
        x <= map.parkBounds.maxX &&
        z >= map.parkBounds.minZ &&
        z <= map.parkBounds.maxZ
      ) {
        c.setHex(0x52b755); // Central Park grass
      } else if (Math.abs(x) <= 555 && Math.abs(z) <= 555) {
        if (x > 190) {
          c.setHex(0x8c8780); // Industrial / Docks concrete
        } else if (Math.abs(x) <= 195 && z >= -195 && z <= 220) {
          c.setHex(0x9ca3ab); // Downtown plaza stone
        } else {
          c.setHex(0x76b85a); // Residential lawn
        }
      } else if (Math.abs(x + 820) < 115 && Math.abs(z - 760) < 55) {
        c.setHex(0x6d757d); // Airfield tarmac
      } else if (Math.hypot(x + 850, z + 760) < 155) {
        c.setHex(0xc49c6e); // Quarry ochre
      } else if (y > 20) {
        c.setHex(0x7c858c); // Perimeter mountain rock
      } else {
        c.setHex(0x6da64f); // Outskirts rolling meadow
      }
    }

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  group.add(mesh);

  // Optional crisp white pitch markings on sports fields (purely visual, 1 draw call, zero colliders)
  if (hasGreenZones) {
    const pitchLines = buildSportsPitchMarkings(map, boundedGreenZones);
    if (pitchLines) {
      group.add(pitchLines);
    }
  }

  // Optional real-world landmark parking lots with painted stalls draped onto terrain
  const parkingLots = buildParkingLots(map);
  if (parkingLots) {
    group.add(parkingLots);
  }

  // Drape infinite-resolution analytic GLSL vector roads onto the exact same heightmap!
  const vectorRoads = buildVectorRoads(map);
  group.add(vectorRoads);

  // Single authoritative Rapier terrain collider — zero separate road colliders!
  const vertices = new Float32Array(pos.array as Float32Array);
  const idxAttr = geo.index!;
  const indices = new Uint32Array(idxAttr.array);
  const col = physics.createStaticTrimesh(vertices, indices, { kind: 'ground' }, CG.GROUND);

  // Invisible perimeter walls at ±1140 so car stays inside the world (tall enough for hilly terrain!)
  const bound = map.worldHalfSize - 60;
  const wallH = Math.max(30, maxTerrainY + 40);
  const wallT = 10;
  physics.createStaticBox(0, wallH * 0.5, -bound, bound, wallH, wallT, { kind: 'building' }, CG.STATIC_WORLD);
  physics.createStaticBox(0, wallH * 0.5, bound, bound, wallH, wallT, { kind: 'building' }, CG.STATIC_WORLD);
  physics.createStaticBox(-bound, wallH * 0.5, 0, wallT, wallH, bound, { kind: 'building' }, CG.STATIC_WORLD);
  physics.createStaticBox(bound, wallH * 0.5, 0, wallT, wallH, bound, { kind: 'building' }, CG.STATIC_WORLD);

  return { group, groundColliderHandle: col.handle };
}
