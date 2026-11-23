import { describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { CG } from '../src/physics/collisionGroups';
import {
  buildRoadCorridorIndex,
  clipFootprintOutsideStreets,
} from '../src/world/CityBuilder';
import { createMapById } from '../src/world/MapRegistry';
import { MapDefinition } from '../src/world/mapData';

function distPointToSeg(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-8) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function pointInPoly(px: number, pz: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function segsIntersect(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number
): boolean {
  const ccw = (p1x: number, p1z: number, p2x: number, p2z: number, p3x: number, p3z: number) =>
    (p3z - p1z) * (p2x - p1x) > (p2z - p1z) * (p3x - p1x);
  return (
    ccw(ax, az, cx, cz, dx, dz) !== ccw(bx, bz, cx, cz, dx, dz) &&
    ccw(ax, az, bx, bz, cx, cz) !== ccw(ax, az, bx, bz, dx, dz)
  );
}

function distSegToSeg(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number
): number {
  if (segsIntersect(ax, az, bx, bz, cx, cz, dx, dz)) return 0;
  return Math.min(
    distPointToSeg(ax, az, cx, cz, dx, dz),
    distPointToSeg(bx, bz, cx, cz, dx, dz),
    distPointToSeg(cx, cz, ax, az, bx, bz),
    distPointToSeg(dx, dz, ax, az, bx, bz)
  );
}

function minDistPolyToSeg(
  poly: Array<[number, number]>,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  if (
    pointInPoly(ax, az, poly) ||
    pointInPoly(bx, bz, poly) ||
    pointInPoly((ax + bx) * 0.5, (az + bz) * 0.5, poly)
  ) {
    return 0;
  }
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i];
    const p1 = poly[(i + 1) % poly.length];
    const d = distSegToSeg(p0[0], p0[1], p1[0], p1[1], ax, az, bx, bz);
    if (d < best) best = d;
  }
  return best;
}

function getRoadOverlaps(
  poly: Array<[number, number]>,
  map: MapDefinition,
  includeShortcuts = false
): Array<{ edgeId: string; edgeName: string; overlap: number }> {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of poly) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const overlaps: Array<{ edgeId: string; edgeName: string; overlap: number }> = [];
  for (const e of map.graph.edges) {
    if (!includeShortcuts && e.isShortcut) continue;
    const a = map.graph.getNode(e.from)!;
    const b = map.graph.getNode(e.to)!;
    const halfW = e.width * 0.5;
    if (
      Math.max(a.x, b.x) + halfW < minX ||
      Math.min(a.x, b.x) - halfW > maxX ||
      Math.max(a.z, b.z) + halfW < minZ ||
      Math.min(a.z, b.z) - halfW > maxZ
    ) {
      continue;
    }
    const d = minDistPolyToSeg(poly, a.x, a.z, b.x, b.z);
    if (d < halfW - 0.05) {
      overlaps.push({ edgeId: e.id, edgeName: e.name ?? e.id, overlap: halfW - d });
    }
  }
  return overlaps;
}

describe('Building hitboxes vs streets', () => {
  it('ensures zero Mikołów building, landmark, or fence hitboxes overlap non-shortcut streets', () => {
    const map = createMapById('mikolow');
    const roadIndex = buildRoadCorridorIndex(map);

    // 1. Custom buildings: polygonal buildings use exact polygon; rectangular buildings clip clear of streets
    for (let i = 0; i < (map.customBuildings ?? []).length; i++) {
      const b = map.customBuildings![i];
      const footprint =
        b.polygon && b.polygon.length >= 3
          ? b.polygon
          : clipFootprintOutsideStreets(b.x, b.z, b.w * 0.5, b.d * 0.5, b.rotY ?? 0, roadIndex).poly;
      const overlaps = getRoadOverlaps(footprint, map, false);
      expect(overlaps, `customBuilding[${i}] at (${b.x}, ${b.z})`).toEqual([]);
    }

    // 2. Landmarks: polygonal parts, block_estate wings, and clipped rectangular landmarks
    for (const lm of map.landmarks) {
      if (lm.footprintParts && lm.footprintParts.length > 0) {
        for (let p = 0; p < lm.footprintParts.length; p++) {
          const overlaps = getRoadOverlaps(lm.footprintParts[p].polygon, map, false);
          expect(overlaps, `landmark ${lm.id} part ${p}`).toEqual([]);
        }
      } else if (lm.style === 'block_estate') {
        const w = lm.footprintW;
        const d = lm.footprintD;
        const wings = [
          { ox: -w * 0.12, oz: -d * 0.1, ww: w * 0.72, wd: d * 0.46 },
          { ox: w * 0.24, oz: d * 0.16, ww: w * 0.44, wd: d * 0.62 },
          { ox: w * 0.06, oz: 0, ww: w * 0.18, wd: d * 0.26 },
        ];
        for (const wing of wings) {
          const { poly } = clipFootprintOutsideStreets(
            lm.x + wing.ox,
            lm.z + wing.oz,
            wing.ww * 0.5,
            wing.wd * 0.5,
            0,
            roadIndex
          );
          expect(getRoadOverlaps(poly, map, false), `landmark ${lm.id} wing`).toEqual([]);
        }
      } else {
        const { poly } = clipFootprintOutsideStreets(
          lm.x,
          lm.z,
          lm.footprintW * 0.5,
          lm.footprintD * 0.5,
          0,
          roadIndex
        );
        expect(getRoadOverlaps(poly, map, false), `landmark ${lm.id}`).toEqual([]);
      }
    }
  });

  it('clips protruding building box corners cleanly in Rapier physics along ul. Jasna', async () => {
    await PhysicsWorld.initRapier();
    const map = createMapById('mikolow');
    const roadIndex = buildRoadCorridorIndex(map);
    const physics = new PhysicsWorld();

    // Verify custom[2706] at (-590.2, -624.6) is clipped clear of ul. Jasna
    const b = map.customBuildings!.find(
      (c) => Math.abs(c.x - -590.2) < 0.2 && Math.abs(c.z - -624.6) < 0.2
    )!;
    expect(b).toBeDefined();
    const res = clipFootprintOutsideStreets(b.x, b.z, b.w * 0.5, b.d * 0.5, b.rotY ?? 0, roadIndex);
    expect(res.clipped).toBe(true);
    expect(getRoadOverlaps(res.poly, map, false)).toEqual([]);

    // Build trimesh collider for the clipped polygon and raycast along ul. Jasna centerline
    const pts = res.poly;
    const verts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      const base = verts.length / 3;
      verts.push(p0[0], -5, p0[1], p1[0], -5, p1[1], p1[0], 15, p1[1], p0[0], 15, p0[1]);
      idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }
    physics.createStaticTrimesh(
      new Float32Array(verts),
      new Uint32Array(idx),
      { kind: 'building' },
      CG.STATIC_WORLD
    );

    const jasnaEdge = map.graph.edges.find(
      (e) => e.name === 'ul. Jasna' && e.id === 'mk_e_1145'
    )!;
    const na = map.graph.getNode(jasnaEdge.from)!;
    const nb = map.graph.getNode(jasnaEdge.to)!;
    const dx = nb.x - na.x;
    const dz = nb.z - na.z;
    const len = Math.hypot(dx, dz);
    const dir = { x: dx / len, y: 0, z: dz / len };
    const hit = physics.castRay({ x: na.x, y: 2, z: na.z }, dir, len, CG.STATIC_WORLD);
    expect(hit).toBeNull();

    physics.dispose();
  });
});
