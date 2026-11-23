import * as THREE from 'three';
import { CG } from '../physics/collisionGroups';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { MapDefinition, distToRiver, getTerrainHeight } from './mapData';

/**
 * Generates the low-res terrain mesh (~128x128) across the 2.4x2.4 km map
 * with roads carved/flattened smoothly to road elevations (§6.2),
 * plus ocean & diagonal river planes and perimeter mountain walls.
 */
export function buildTerrain(
  map: MapDefinition,
  physics: PhysicsWorld
): { group: THREE.Group; groundColliderHandle: number } {
  const group = new THREE.Group();
  const size = map.worldHalfSize * 2;
  const segments = 96; // 96x96 = 18k tris, crisp hills and fast physics trimesh
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI * 0.5);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let y = getTerrainHeight(x, z);

    // Flatten terrain neatly under any road edge
    const proj = map.graph.projectPoint(x, z, 0, -1, 22);
    if (proj) {
      const flatDist = proj.halfWidth + 5;
      if (proj.distFromCenter < flatDist) {
        y = proj.closestY - 0.04;
      } else {
        const blend = (proj.distFromCenter - flatDist) / (22 - flatDist);
        y = THREE.MathUtils.lerp(proj.closestY - 0.04, y, blend);
      }
    }

    // Carve river bed slightly below water level
    const rDist = distToRiver(x, z);
    if (rDist < map.riverLine.halfWidth + 6 && Math.abs(x) < 620 && Math.abs(z) < 620) {
      const rf = Math.max(0, 1 - rDist / (map.riverLine.halfWidth + 6));
      y = Math.min(y, -3.2 * rf);
    }

    pos.setY(i, y);

    // Vertex colors per zone (2012 bright cartoony palette §6.4)
    if (x > 840 || z > 840) {
      c.setHex(0xe8d59e); // sandy beach
    } else if (x >= map.parkBounds.minX && x <= map.parkBounds.maxX && z >= map.parkBounds.minZ && z <= map.parkBounds.maxZ) {
      c.setHex(0x52b755); // vibrant central park grass
    } else if (Math.abs(x) <= 550 && Math.abs(z) <= 550) {
      if (x > 190) {
        c.setHex(0x8c8780); // industrial concrete lot
      } else if (Math.abs(x) <= 200 && z >= -200 && z <= 220) {
        c.setHex(0x9ca3ab); // downtown plaza stone
      } else {
        c.setHex(0x76b85a); // residential lawn
      }
    } else if (y > 22) {
      c.setHex(0x7c858c); // mountain rock
    } else if (Math.hypot(x + 850, z + 760) < 160) {
      c.setHex(0xc49c6e); // quarry ochre
    } else {
      c.setHex(0x6da64f); // outskirts meadow
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

  // Build Rapier trimesh collider directly from the displaced terrain geometry
  const vertices = new Float32Array(pos.array as Float32Array);
  const idxAttr = geo.index!;
  const indices = new Uint32Array(idxAttr.array);
  const col = physics.createStaticTrimesh(vertices, indices, { kind: 'ground' }, CG.GROUND);

  // Water plane (ocean + river)
  const waterGeo = new THREE.PlaneGeometry(size * 1.4, size * 1.4);
  waterGeo.rotateX(-Math.PI * 0.5);
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x2492d1 });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = -1.4;
  group.add(water);

  // Invisible boundary walls at ±1140 so car never drives off the world (§6.1)
  const bound = map.worldHalfSize - 60;
  const wallH = 30;
  const wallT = 10;
  physics.createStaticBox(0, wallH * 0.5, -bound, bound, wallH, wallT, { kind: 'building' }, CG.STATIC_WORLD);
  physics.createStaticBox(0, wallH * 0.5, bound, bound, wallH, wallT, { kind: 'building' }, CG.STATIC_WORLD);
  physics.createStaticBox(-bound, wallH * 0.5, 0, wallT, wallH, bound, { kind: 'building' }, CG.STATIC_WORLD);
  physics.createStaticBox(bound, wallH * 0.5, 0, wallT, wallH, bound, { kind: 'building' }, CG.STATIC_WORLD);

  return { group, groundColliderHandle: col.handle };
}
