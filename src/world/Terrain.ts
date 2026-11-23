import * as THREE from 'three';
import { CG } from '../physics/collisionGroups';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { MapDefinition } from './mapData';
import { buildVectorRoads } from './VectorRoads';

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

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = hm.heights[i];
    pos.setY(i, y);

    // Clean vertex colors for ground biomes & city districts
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

  // Drape infinite-resolution analytic GLSL vector roads onto the exact same heightmap!
  const vectorRoads = buildVectorRoads(map);
  group.add(vectorRoads);

  // Single authoritative Rapier terrain collider — zero separate road colliders!
  const vertices = new Float32Array(pos.array as Float32Array);
  const idxAttr = geo.index!;
  const indices = new Uint32Array(idxAttr.array);
  const col = physics.createStaticTrimesh(vertices, indices, { kind: 'ground' }, CG.GROUND);

  // Invisible perimeter walls at ±1140 so car stays inside the world
  const bound = map.worldHalfSize - 60;
  const wallH = 30;
  const wallT = 10;
  physics.createStaticBox(0, wallH * 0.5, -bound, bound, wallH, wallT, { kind: 'building' }, CG.STATIC_WORLD);
  physics.createStaticBox(0, wallH * 0.5, bound, bound, wallH, wallT, { kind: 'building' }, CG.STATIC_WORLD);
  physics.createStaticBox(-bound, wallH * 0.5, 0, wallT, wallH, bound, { kind: 'building' }, CG.STATIC_WORLD);
  physics.createStaticBox(bound, wallH * 0.5, 0, wallT, wallH, bound, { kind: 'building' }, CG.STATIC_WORLD);

  return { group, groundColliderHandle: col.handle };
}
