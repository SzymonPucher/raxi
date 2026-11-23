import { DistrictId, RoadEdge, RoadGraph, RoadNode, RoadType } from './RoadGraph';

export interface LandmarkDef {
  id: string;
  name: string;
  district: DistrictId;
  x: number;
  z: number;
  footprintW: number;
  footprintD: number;
  height: number;
  color: number;
  accentColor: number;
  style: 'tower' | 'station' | 'hospital' | 'stadium' | 'mall' | 'bar' | 'campus' | 'hall' | 'lighthouse' | 'lookout' | 'airfield' | 'farm' | 'quarry' | 'beach' | 'police' | 'cinema';
  /** Closest curb pickup/dropoff coordinate */
  curbX: number;
  curbZ: number;
}

export interface GarageDef {
  id: string;
  name: string;
  district: DistrictId;
  x: number;
  z: number;
  yaw: number;
}

export interface RampDef {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  length: number;
  height: number;
  yaw: number;
  label?: string;
}

export interface SidewalkSpot {
  x: number;
  y: number;
  z: number;
  edgeId: string;
  district: DistrictId;
  address: string;
  landmarkId?: string;
}

export interface MapDefinition {
  graph: RoadGraph;
  landmarks: LandmarkDef[];
  garages: GarageDef[];
  ramps: RampDef[];
  sidewalkSpots: SidewalkSpot[];
  riverLine: { x0: number; z0: number; x1: number; z1: number; halfWidth: number };
  parkBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  worldHalfSize: number;
  cityCoreHalfSize: number;
}

/**
 * Deterministic district classifier across the 2.4 x 2.4 km map (§6.1).
 */
export function getDistrictAt(x: number, z: number): DistrictId {
  // Outside ring highway -> Outskirts
  if (Math.abs(x) > 540 || Math.abs(z) > 540) {
    return 'outskirts';
  }
  // Central Park + diagonal river corridor
  if (x >= -190 && x <= 10 && z >= -190 && z <= 10) {
    return 'park';
  }
  // East side -> Industrial / Docks
  if (x > 190) {
    return 'docks';
  }
  // Center -> Downtown
  if (x >= -190 && x <= 190 && z >= -190 && z <= 210) {
    return 'downtown';
  }
  // West & North -> Residential
  return 'residential';
}

/**
 * Distance from a point to the diagonal river centerline running SW (-700, 620) -> NE (700, -560).
 */
export const RIVER_LINE = {
  x0: -680,
  z0: 540,
  x1: 720,
  z1: -560,
  halfWidth: 26,
};

export function distToRiver(x: number, z: number): number {
  const dx = RIVER_LINE.x1 - RIVER_LINE.x0;
  const dz = RIVER_LINE.z1 - RIVER_LINE.z0;
  const lenSq = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - RIVER_LINE.x0) * dx + (z - RIVER_LINE.z0) * dz) / lenSq));
  const px = RIVER_LINE.x0 + dx * t;
  const pz = RIVER_LINE.z0 + dz * t;
  return Math.hypot(x - px, z - pz);
}

/**
 * Outskirts elevation function (0 inside city core & roads; rolling hills in outskirts).
 */
export function getTerrainHeight(x: number, z: number): number {
  const distFromCore = Math.max(Math.abs(x) - 560, Math.abs(z) - 560);
  if (distFromCore <= 0) return 0;
  const blend = Math.min(1, distFromCore / 180);

  // Ocean drops off on East (x > 880) and South (z > 880)
  if (x > 860 || z > 860) {
    const seaDist = Math.max(x - 860, z - 860);
    return Math.max(-4, -seaDist * 0.05);
  }

  // Rolling hills in North/West outskirts & Hilltop Lookout
  const hill =
    (Math.sin(x * 0.0055) * Math.cos(z * 0.0055) * 14 +
      Math.sin((x + z) * 0.0032) * 10 +
      10) *
    blend;

  // Quarry pit in NW outskirts around (-850, -760)
  const qDist = Math.hypot(x + 850, z + 760);
  if (qDist < 150) {
    const qFactor = Math.cos((qDist / 150) * Math.PI * 0.5);
    return Math.max(-6, hill * (1 - qFactor * 0.7) - qFactor * 6);
  }

  // Flat airfield plateau around (-820, 760)
  const airDist = Math.hypot(x + 820, z - 760);
  if (airDist < 180) {
    const f = Math.min(1, Math.max(0, (airDist - 120) / 60));
    return hill * f;
  }

  // Mountains at extreme North/West map edges
  const mtnDist = Math.max(-x - 950, -z - 950);
  if (mtnDist > 0) {
    return hill + mtnDist * 0.32;
  }

  return Math.max(0, hill * 0.55);
}

/**
 * Hand-authored static map of Raxi City (§6.1–6.2).
 */
export function createMapDefinition(): MapDefinition {
  const nodes: RoadNode[] = [];
  const edges: Omit<RoadEdge, 'length'>[] = [];
  const nodeIds = new Set<string>();

  const addNode = (
    id: string,
    x: number,
    z: number,
    hasTrafficLight = false,
    yOverride?: number
  ) => {
    if (nodeIds.has(id)) return;
    nodeIds.add(id);
    const y = yOverride !== undefined ? yOverride : Math.max(0, getTerrainHeight(x, z));
    nodes.push({
      id,
      x,
      y,
      z,
      district: getDistrictAt(x, z),
      hasTrafficLight,
    });
  };

  let edgeSeq = 0;
  const addEdge = (
    from: string,
    to: string,
    roadType: RoadType,
    lanesPerDir: number,
    speedLimit: number,
    width: number,
    opts?: { isShortcut?: boolean; isOneWay?: boolean }
  ) => {
    edges.push({
      id: `e_${edgeSeq++}`,
      from,
      to,
      roadType,
      lanesPerDir,
      speedLimit,
      width,
      isShortcut: opts?.isShortcut,
      isOneWay: opts?.isOneWay,
    });
  };

  // 1. Core City Grid: 11x11 nodes at 100m spacing (-500..+500) -> ~90m blocks + 14m roads
  const gridCoords = [-500, -400, -300, -200, -100, 0, 100, 200, 300, 400, 500];
  const gId = (ix: number, iz: number) => `g_${ix}_${iz}`;

  for (let ix = 0; ix < gridCoords.length; ix++) {
    for (let iz = 0; iz < gridCoords.length; iz++) {
      const x = gridCoords[ix];
      const z = gridCoords[iz];
      // Skip interior park node (-100, -100) to break the grid for Central Park!
      if (x === -100 && z === -100) continue;
      // Major avenue intersections get traffic lights
      const isAvenueX = ix % 2 === 1;
      const isAvenueZ = iz % 2 === 1;
      const hasLight = isAvenueX && isAvenueZ && Math.abs(x) <= 400 && Math.abs(z) <= 400;
      addNode(gId(ix, iz), x, z, hasLight, 0);
    }
  }

  // Connect grid edges, breaking grid across river except at 4 dedicated bridges!
  // 4 bridges across diagonal river: around (-300, 200), (0, 0), (200, -100), (400, -300)
  const bridgePairs = new Set([
    'g_2_7|g_2_8',
    'g_5_5|g_5_4',
    'g_7_4|g_7_3',
    'g_9_2|g_9_1',
    'g_2_7|g_3_7',
    'g_5_5|g_6_5',
    'g_7_3|g_8_3',
  ]);

  const crossesRiver = (x1: number, z1: number, x2: number, z2: number) => {
    const mx = (x1 + x2) * 0.5;
    const mz = (z1 + z2) * 0.5;
    return distToRiver(mx, mz) < RIVER_LINE.halfWidth + 8;
  };

  for (let ix = 0; ix < gridCoords.length; ix++) {
    for (let iz = 0; iz < gridCoords.length; iz++) {
      const idA = gId(ix, iz);
      if (!nodeIds.has(idA)) continue;
      const xA = gridCoords[ix];
      const zA = gridCoords[iz];

      // Horizontal (+X)
      if (ix + 1 < gridCoords.length) {
        const idB = gId(ix + 1, iz);
        if (nodeIds.has(idB)) {
          const xB = gridCoords[ix + 1];
          const zB = zA;
          const onRiver = crossesRiver(xA, zA, xB, zB);
          const pairKey = `${idA}|${idB}`;
          if (!onRiver || bridgePairs.has(pairKey)) {
            const isAve = iz % 2 === 1;
            const district = getDistrictAt((xA + xB) * 0.5, zA);
            const limit = onRiver
              ? 18
              : district === 'residential'
                ? 13
                : isAve
                  ? 18
                  : 15;
            addEdge(
              idA,
              idB,
              onRiver ? 'bridge' : isAve ? 'avenue' : 'street',
              isAve ? 2 : 1,
              limit,
              isAve ? 16 : 12
            );
          }
        }
      }

      // Vertical (+Z)
      if (iz + 1 < gridCoords.length) {
        const idB = gId(ix, iz + 1);
        if (nodeIds.has(idB)) {
          const xB = xA;
          const zB = gridCoords[iz + 1];
          const onRiver = crossesRiver(xA, zA, xB, zB);
          const pairKey = `${idA}|${idB}`;
          if (!onRiver || bridgePairs.has(pairKey)) {
            const isAve = ix % 2 === 1;
            const district = getDistrictAt(xA, (zA + zB) * 0.5);
            const limit = onRiver
              ? 18
              : district === 'residential'
                ? 13
                : isAve
                  ? 18
                  : 15;
            addEdge(
              idA,
              idB,
              onRiver ? 'bridge' : isAve ? 'avenue' : 'street',
              isAve ? 2 : 1,
              limit,
              isAve ? 16 : 12
            );
          }
        }
      }
    }
  }

  // 2. Diagonal Boulevards & Park Shortcuts (for Local Knowledge #20!)
  addNode('park_center', -100, -100, false, 0);
  addEdge('g_3_3', 'park_center', 'shortcut', 1, 14, 8, { isShortcut: true });
  addEdge('park_center', 'g_5_5', 'shortcut', 1, 14, 8, { isShortcut: true });
  addEdge('g_5_3', 'park_center', 'shortcut', 1, 14, 8, { isShortcut: true });
  addEdge('park_center', 'g_3_5', 'shortcut', 1, 14, 8, { isShortcut: true });

  // Residential back-alley shortcuts
  addEdge('g_1_1', 'g_2_2', 'shortcut', 1, 12, 7, { isShortcut: true });
  addEdge('g_1_5', 'g_2_6', 'shortcut', 1, 12, 7, { isShortcut: true });
  // Downtown underground plaza diagonal shortcut
  addEdge('g_5_6', 'g_6_7', 'shortcut', 1, 16, 8, { isShortcut: true });
  // Diagonal coastal boulevard on SE docks
  addEdge('g_8_8', 'g_10_6', 'avenue', 2, 20, 16);

  // 3. Ring Highway around the city core (±640) with 6 on/off ramps & 1 elevated overpass on North side!
  const hwNodes: Array<[string, number, number, number]> = [
    ['hw_nw', -640, -640, 0],
    ['hw_n1', -300, -640, 0],
    ['hw_n_over', 0, -640, 7.5], // Elevated overpass!
    ['hw_n2', 300, -640, 0],
    ['hw_ne', 640, -640, 0],
    ['hw_e1', 640, -200, 0],
    ['hw_e2', 640, 200, 0],
    ['hw_se', 640, 640, 0],
    ['hw_s1', 200, 640, 0],
    ['hw_s2', -200, 640, 0],
    ['hw_sw', -640, 640, 0],
    ['hw_w1', -640, 200, 0],
    ['hw_w2', -640, -200, 0],
  ];

  for (const [id, x, z, y] of hwNodes) {
    addNode(id, x, z, false, y);
  }
  for (let i = 0; i < hwNodes.length; i++) {
    const a = hwNodes[i][0];
    const b = hwNodes[(i + 1) % hwNodes.length][0];
    addEdge(a, b, 'highway', 2, 32, 18);
  }

  // 6 On/Off ramps connecting Ring Highway to city core grid
  addEdge('hw_n1', 'g_2_0', 'highway', 1, 22, 12);
  addEdge('hw_n2', 'g_8_0', 'highway', 1, 22, 12);
  addEdge('hw_e1', 'g_10_3', 'highway', 1, 22, 12);
  addEdge('hw_e2', 'g_10_7', 'highway', 1, 22, 12);
  addEdge('hw_s1', 'g_7_10', 'highway', 1, 22, 12);
  addEdge('hw_w1', 'g_0_7', 'highway', 1, 22, 12);
  addEdge('hw_w2', 'g_0_3', 'highway', 1, 22, 12);
  addEdge('hw_s2', 'g_3_10', 'highway', 1, 22, 12);

  // 4. Outskirts Country Roads connecting to Quarry, Lookout, Farm Market, Airfield, Lighthouse, Beach Club
  addNode('out_quarry', -850, -760, false, 0);
  addNode('out_lookout', -300, -900, false, 10);
  addNode('out_farm', 300, -880, false, 4);
  addNode('out_lighthouse', 820, -760, false, 1);
  addNode('out_beach', 800, 520, false, 0.5);
  addNode('out_airfield', -820, 760, false, 0);
  addNode('out_gas', -860, 0, false, 2);

  addEdge('hw_nw', 'out_quarry', 'country', 1, 24, 11);
  addEdge('out_quarry', 'out_lookout', 'country', 1, 24, 11);
  addEdge('hw_n1', 'out_lookout', 'country', 1, 24, 11);
  addEdge('out_lookout', 'out_farm', 'country', 1, 24, 11);
  addEdge('hw_n2', 'out_farm', 'country', 1, 24, 11);
  addEdge('out_farm', 'out_lighthouse', 'country', 1, 24, 11);
  addEdge('hw_ne', 'out_lighthouse', 'country', 1, 24, 11);
  addEdge('hw_e2', 'out_beach', 'country', 1, 22, 11);
  addEdge('hw_se', 'out_beach', 'country', 1, 22, 11);
  addEdge('hw_sw', 'out_airfield', 'country', 1, 24, 11);
  addEdge('hw_w1', 'out_gas', 'country', 1, 24, 11);
  addEdge('hw_w2', 'out_gas', 'country', 1, 24, 11);
  addEdge('out_gas', 'out_quarry', 'country', 1, 24, 11);
  addEdge('out_gas', 'out_airfield', 'country', 1, 24, 11);

  const graph = new RoadGraph(nodes, edges);

  // 5. All 16 Landmarks from §6.1
  const landmarks: LandmarkDef[] = [
    {
      id: 'raxi_tower',
      name: 'Raxi Tower',
      district: 'downtown',
      x: 50,
      z: 50,
      footprintW: 44,
      footprintD: 44,
      height: 145,
      color: 0x3b6ea5,
      accentColor: 0xffcc00,
      style: 'tower',
      curbX: 12,
      curbZ: 50,
    },
    {
      id: 'central_station',
      name: 'Central Station',
      district: 'downtown',
      x: -50,
      z: 150,
      footprintW: 60,
      footprintD: 42,
      height: 26,
      color: 0xd9cbb8,
      accentColor: 0x3465a4,
      style: 'station',
      curbX: -50,
      curbZ: 108,
    },
    {
      id: 'city_hospital',
      name: 'City Hospital',
      district: 'downtown',
      x: 150,
      z: 150,
      footprintW: 54,
      footprintD: 48,
      height: 55,
      color: 0xf4f7fa,
      accentColor: 0xe53935,
      style: 'hospital',
      curbX: 108,
      curbZ: 150,
    },
    {
      id: 'stadium',
      name: 'Raxi Stadium',
      district: 'downtown',
      x: 50,
      z: 350,
      footprintW: 72,
      footprintD: 64,
      height: 30,
      color: 0x90a4ae,
      accentColor: 0x26c6da,
      style: 'stadium',
      curbX: 50,
      curbZ: 308,
    },
    {
      id: 'shopping_mall',
      name: 'Shopping Mall',
      district: 'downtown',
      x: -150,
      z: 250,
      footprintW: 66,
      footprintD: 54,
      height: 24,
      color: 0xffb74d,
      accentColor: 0xec407a,
      style: 'mall',
      curbX: -150,
      curbZ: 208,
    },
    {
      id: 'harbor_bar',
      name: 'Harbor Bar',
      district: 'docks',
      x: 450,
      z: 150,
      footprintW: 38,
      footprintD: 30,
      height: 14,
      color: 0xb85d3b,
      accentColor: 0x00e5ff,
      style: 'bar',
      curbX: 408,
      curbZ: 150,
    },
    {
      id: 'university',
      name: 'University',
      district: 'residential',
      x: -350,
      z: -250,
      footprintW: 64,
      footprintD: 52,
      height: 28,
      color: 0xc97b63,
      accentColor: 0x5c6bc0,
      style: 'campus',
      curbX: -308,
      curbZ: -250,
    },
    {
      id: 'city_hall',
      name: 'City Hall',
      district: 'downtown',
      x: -50,
      z: 50,
      footprintW: 56,
      footprintD: 48,
      height: 36,
      color: 0xede7dc,
      accentColor: 0xffd54f,
      style: 'hall',
      curbX: -8,
      curbZ: 50,
    },
    {
      id: 'lighthouse',
      name: 'Lighthouse',
      district: 'outskirts',
      x: 845,
      z: -785,
      footprintW: 18,
      footprintD: 18,
      height: 46,
      color: 0xffffff,
      accentColor: 0xe53935,
      style: 'lighthouse',
      curbX: 820,
      curbZ: -760,
    },
    {
      id: 'hilltop_lookout',
      name: 'Hilltop Lookout',
      district: 'outskirts',
      x: -300,
      z: -935,
      footprintW: 32,
      footprintD: 24,
      height: 14,
      color: 0x8d6e63,
      accentColor: 0x66bb6a,
      style: 'lookout',
      curbX: -300,
      curbZ: -900,
    },
    {
      id: 'airfield',
      name: 'Airfield',
      district: 'outskirts',
      x: -870,
      z: 790,
      footprintW: 54,
      footprintD: 36,
      height: 18,
      color: 0x78909c,
      accentColor: 0xffca28,
      style: 'airfield',
      curbX: -820,
      curbZ: 760,
    },
    {
      id: 'farm_market',
      name: 'Farm Market',
      district: 'outskirts',
      x: 300,
      z: -925,
      footprintW: 40,
      footprintD: 30,
      height: 15,
      color: 0xc62828,
      accentColor: 0xfff8e1,
      style: 'farm',
      curbX: 300,
      curbZ: -880,
    },
    {
      id: 'quarry',
      name: 'Quarry',
      district: 'outskirts',
      x: -900,
      z: -790,
      footprintW: 42,
      footprintD: 32,
      height: 16,
      color: 0xa1887f,
      accentColor: 0xff9800,
      style: 'quarry',
      curbX: -850,
      curbZ: -760,
    },
    {
      id: 'beach_club',
      name: 'Beach Club',
      district: 'outskirts',
      x: 830,
      z: 520,
      footprintW: 40,
      footprintD: 34,
      height: 12,
      color: 0x4dd0e1,
      accentColor: 0xffeb3b,
      style: 'beach',
      curbX: 800,
      curbZ: 520,
    },
    {
      id: 'police_hq',
      name: 'Police HQ',
      district: 'downtown',
      x: 150,
      z: 50,
      footprintW: 50,
      footprintD: 46,
      height: 44,
      color: 0x37474f,
      accentColor: 0x2979ff,
      style: 'police',
      curbX: 108,
      curbZ: 50,
    },
    {
      id: 'cinema',
      name: 'Grand Cinema',
      district: 'downtown',
      x: -50,
      z: 250,
      footprintW: 46,
      footprintD: 42,
      height: 22,
      color: 0x6a1b9a,
      accentColor: 0xffd600,
      style: 'cinema',
      curbX: -8,
      curbZ: 250,
    },
  ];

  // 6. 4 Raxi Garages (§8.5: Downtown, Docks, Residential, Outskirts)
  const garages: GarageDef[] = [
    { id: 'garage_downtown', name: 'Downtown Raxi Garage', district: 'downtown', x: 50, z: 212, yaw: 0 },
    { id: 'garage_docks', name: 'Docks Raxi Garage', district: 'docks', x: 350, z: 212, yaw: 0 },
    { id: 'garage_residential', name: 'Westside Raxi Garage', district: 'residential', x: -350, z: 12, yaw: 0 },
    { id: 'garage_outskirts', name: 'Highway Gas & Garage', district: 'outskirts', x: -845, z: 16, yaw: Math.PI * 0.5 },
  ];

  // 7. Jump Ramps (§6.1: Docks container jumps, raised drawbridge jump, Quarry jumps, Downtown parking ramp)
  const ramps: RampDef[] = [
    { id: 'ramp_docks_1', x: 350, y: 0, z: 50, width: 10, length: 18, height: 3.4, yaw: 0, label: 'Docks Jump' },
    { id: 'ramp_docks_2', x: 450, y: 0, z: 250, width: 10, length: 18, height: 3.8, yaw: Math.PI * 0.5, label: 'Container Launch' },
    { id: 'ramp_drawbridge', x: 200, y: 0, z: -135, width: 12, length: 18, height: 3.2, yaw: 0, label: 'Drawbridge Jump' },
    { id: 'ramp_downtown', x: 100, y: 0, z: 255, width: 10, length: 16, height: 3.0, yaw: Math.PI, label: 'Plaza Ramp' },
    { id: 'ramp_quarry_1', x: -815, y: 0, z: -740, width: 12, length: 20, height: 4.5, yaw: 0.7, label: 'Quarry Mega Jump' },
    { id: 'ramp_airfield', x: -790, y: 0, z: 760, width: 12, length: 22, height: 4.2, yaw: -Math.PI * 0.5, label: 'Runway Jump' },
  ];

  // 8. Sidewalk spawn spots (both landmark curbs + generic street addresses along edges)
  const sidewalkSpots: SidewalkSpot[] = [];

  for (const lm of landmarks) {
    const nearest = graph.projectPoint(lm.curbX, lm.curbZ, 0, -1, 60);
    sidewalkSpots.push({
      x: lm.curbX,
      y: nearest ? nearest.closestY : Math.max(0, getTerrainHeight(lm.curbX, lm.curbZ)),
      z: lm.curbZ,
      edgeId: nearest?.edge.id ?? graph.edges[0].id,
      district: lm.district,
      address: lm.name,
      landmarkId: lm.id,
    });
  }

  const streetNames = [
    'Oak St', 'Maple Ave', 'Harbor Blvd', 'Central Ave', 'Neon Way',
    'Pine Rd', 'Sunset Blvd', 'Dockside Ln', 'River Walk', 'Park Ave',
    'Market St', 'Grand Blvd', 'Cedar Ln', 'Bayview Dr', 'Liberty St',
  ];

  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    if (e.roadType === 'highway' || e.roadType === 'bridge' || e.isShortcut) continue;
    const a = graph.getNode(e.from)!;
    const b = graph.getNode(e.to)!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 40) continue;
    const rx = -dz / len;
    const rz = dx / len;
    const offset = e.width * 0.5 + 2.2;

    for (const t of [0.32, 0.68]) {
      const side = (i % 2 === 0 ? 1 : -1) * (t > 0.5 ? 1 : -1);
      const sx = a.x + dx * t + rx * offset * side;
      const sz = a.z + dz * t + rz * offset * side;
      const sy = a.y + (b.y - a.y) * t;
      // Avoid placing right inside a garage or river
      if (distToRiver(sx, sz) < RIVER_LINE.halfWidth + 4) continue;
      if (garages.some((g) => Math.hypot(g.x - sx, g.z - sz) < 24)) continue;

      const houseNum = 100 + ((i * 37 + Math.round(t * 100)) % 890);
      const stName = streetNames[(i + Math.round(t * 10)) % streetNames.length];
      sidewalkSpots.push({
        x: sx,
        y: sy,
        z: sz,
        edgeId: e.id,
        district: getDistrictAt(sx, sz),
        address: `${houseNum} ${stName}`,
      });
    }
  }

  return {
    graph,
    landmarks,
    garages,
    ramps,
    sidewalkSpots,
    riverLine: RIVER_LINE,
    parkBounds: { minX: -195, maxX: -5, minZ: -195, maxZ: -5 },
    worldHalfSize: 1200,
    cityCoreHalfSize: 600,
  };
}
