import { afterEach, describe, expect, it } from 'vitest';
import { Storage } from '../src/save/Storage';
import { getLocationLabel } from '../src/ui/hud/HUD';
import { AVAILABLE_MAPS, createMapById, getMapMeta } from '../src/world/MapRegistry';

function createMemoryLocalStorage(initial: Record<string, string> = {}): globalThis.Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe('MapRegistry & Raxi City backwards compatibility', () => {
  it('registers both Raxi City and Mikołów in AVAILABLE_MAPS', () => {
    expect(AVAILABLE_MAPS.map((m) => m.id)).toEqual(['raxi_city', 'mikolow']);
    expect(getMapMeta('raxi_city').name).toBe('Raxi City');
    expect(getMapMeta('mikolow').name).toContain('Mikołów');
  });

  it('keeps createMapById("raxi_city") unchanged (16 landmarks, 4 garages, valid routes)', () => {
    const map = createMapById('raxi_city');
    expect(map.landmarks.length).toBe(16);
    expect(map.garages.length).toBe(4);
    expect(map.sidewalkSpots.length).toBeGreaterThan(80);
    expect(map.disableDefaultGridBuildings).toBeFalsy();

    const tower = map.landmarks.find((l) => l.id === 'raxi_tower')!;
    const lighthouse = map.landmarks.find((l) => l.id === 'lighthouse')!;
    expect(tower).toBeDefined();
    expect(lighthouse).toBeDefined();

    const route = map.graph.findRouteBetweenPoints(
      tower.curbX,
      tower.curbZ,
      lighthouse.curbX,
      lighthouse.curbZ
    );
    expect(route.waypoints.length).toBeGreaterThan(4);
    expect(route.totalLength).toBeGreaterThan(800);
  });
});

describe('Mikołów, Poland MapDefinition', () => {
  const map = createMapById('mikolow');
  const graph = map.graph;

  it('builds with valid metadata, spawn, landmarks, garages, and Polish street addresses', () => {
    expect(map.id).toBe('mikolow');
    expect(map.displayName).toContain('Mikołów');
    expect(map.disableDefaultGridBuildings).toBe(true);
    expect(map.landmarks.length).toBe(16);
    expect(map.garages.length).toBe(4);
    expect(map.sidewalkSpots.length).toBeGreaterThan(100);
    expect(map.customBuildings?.length ?? 0).toBeGreaterThan(100);

    // Spawn sits legally on a drivable road
    expect(map.spawn).toBeDefined();
    const spawn = map.spawn!;
    const fwdX = -Math.sin(spawn.yaw);
    const fwdZ = -Math.cos(spawn.yaw);
    const proj = graph.projectPoint(spawn.x, spawn.z, fwdX, fwdZ);
    expect(proj).not.toBeNull();
    expect(proj!.isOncoming).toBe(false);

    // Polish street addresses are present on sidewalk spots
    expect(map.sidewalkSpots.some((s) => s.address.startsWith('ul. ') || s.address.includes('Rynek'))).toBe(
      true
    );
  });

  it('has a fully connected road graph linking all major Mikołów landmarks and garages', () => {
    const rynek = map.landmarks.find((l) => l.id === 'ratusz_rynek')!;
    const bazylika = map.landmarks.find((l) => l.id === 'bazylika_wojciecha')!;
    const pkp = map.landmarks.find((l) => l.id === 'dworzec_pkp')!;
    const mosir = map.landmarks.find((l) => l.id === 'mosir_hala')!;
    const ewangelicki = map.landmarks.find((l) => l.id === 'kosciol_ewangelicki')!;
    const auchan = map.landmarks.find((l) => l.id === 'auchan_mikolow')!;

    expect(rynek).toBeDefined();
    expect(bazylika).toBeDefined();
    expect(pkp).toBeDefined();
    expect(mosir).toBeDefined();
    expect(ewangelicki).toBeDefined();
    expect(auchan).toBeDefined();

    // Every landmark is reachable from Rynek without shortcuts
    for (const lm of map.landmarks) {
      if (lm.id === rynek.id) continue;
      const route = graph.findRouteBetweenPoints(
        rynek.curbX,
        rynek.curbZ,
        lm.curbX,
        lm.curbZ,
        { allowShortcuts: false }
      );
      expect(route.waypoints.length, `route to ${lm.name}`).toBeGreaterThanOrEqual(2);
      expect(route.totalLength, `route length to ${lm.name}`).toBeGreaterThan(20);
    }

    // Every garage is reachable from Rynek without shortcuts
    for (const g of map.garages) {
      const route = graph.findRouteBetweenPoints(rynek.curbX, rynek.curbZ, g.x, g.z, {
        allowShortcuts: false,
      });
      expect(route.waypoints.length, `route to garage ${g.name}`).toBeGreaterThanOrEqual(2);
      expect(route.totalLength, `route length to garage ${g.name}`).toBeGreaterThan(50);
    }
  });

  it('preserves realistic real-world metric distances between Mikołów landmarks', () => {
    const byId = (id: string) => map.landmarks.find((l) => l.id === id)!;
    const rynek = byId('ratusz_rynek');

    const checks: Array<{
      id: string;
      minDirectM: number;
      maxDirectM: number;
      maxRoadM: number;
    }> = [
      { id: 'bazylika_wojciecha', minDirectM: 280, maxDirectM: 450, maxRoadM: 700 },
      { id: 'dworzec_pkp', minDirectM: 350, maxDirectM: 600, maxRoadM: 900 },
      { id: 'mosir_hala', minDirectM: 300, maxDirectM: 580, maxRoadM: 1100 },
      { id: 'kosciol_ewangelicki', minDirectM: 300, maxDirectM: 520, maxRoadM: 950 },
      { id: 'auchan_mikolow', minDirectM: 1200, maxDirectM: 1900, maxRoadM: 2600 },
    ];

    for (const c of checks) {
      const target = byId(c.id);
      const direct = Math.hypot(target.x - rynek.x, target.z - rynek.z);
      expect(direct, `direct distance Rynek -> ${c.id}`).toBeGreaterThanOrEqual(c.minDirectM);
      expect(direct, `direct distance Rynek -> ${c.id}`).toBeLessThanOrEqual(c.maxDirectM);

      const route = graph.findRouteBetweenPoints(
        rynek.curbX,
        rynek.curbZ,
        target.curbX,
        target.curbZ,
        { allowShortcuts: false }
      );
      expect(route.totalLength, `road distance Rynek -> ${c.id}`).toBeGreaterThanOrEqual(
        direct * 0.85
      );
      expect(route.totalLength, `road distance Rynek -> ${c.id}`).toBeLessThanOrEqual(c.maxRoadM);
    }
  });

  it('has real elevation relief (>= 15m) and snaps every road node and sidewalk spot strictly onto HeightMap', () => {
    let minH = Infinity;
    let maxH = -Infinity;
    for (let x = -1150; x <= 1150; x += 50) {
      for (let z = -1150; z <= 1150; z += 50) {
        const h = map.heightMap.sample(x, z);
        expect(Number.isFinite(h)).toBe(true);
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    expect(maxH - minH).toBeGreaterThanOrEqual(15);

    for (const node of graph.nodes.values()) {
      expect(node.y).toBeCloseTo(map.heightMap.sample(node.x, node.z), 5);
    }
    for (const spot of map.sidewalkSpots) {
      expect(spot.y).toBeCloseTo(map.heightMap.sample(spot.x, spot.z), 5);
    }
    for (const ramp of map.ramps) {
      expect(ramp.y).toBeCloseTo(map.heightMap.sample(ramp.x, ramp.z), 5);
    }
  });

  it('populates valid green zones, rail lines, and per-edge sidewalk widths', () => {
    const greenZones = map.greenZones ?? [];
    expect(greenZones.length).toBeGreaterThanOrEqual(10);
    expect(greenZones.some((z) => z.name.includes('Duże Planty'))).toBe(true);
    expect(greenZones.some((z) => z.name.includes('Małe Planty'))).toBe(true);

    for (const gz of greenZones) {
      expect(gz.polygon.length).toBeGreaterThanOrEqual(3);
      expect(gz.treeDensity).toBeGreaterThanOrEqual(0);
      expect(gz.treeDensity).toBeLessThanOrEqual(1);
      for (const [px, pz] of gz.polygon) {
        expect(Number.isFinite(px)).toBe(true);
        expect(Number.isFinite(pz)).toBe(true);
      }
    }

    const railLines = map.railLines ?? [];
    expect(railLines.length).toBeGreaterThanOrEqual(1);
    for (const rl of railLines) {
      expect(rl.points.length).toBeGreaterThanOrEqual(2);
    }

    for (const edge of graph.edges) {
      expect(edge.sidewalkWidth).toBeDefined();
      expect(edge.sidewalkWidth!).toBeGreaterThan(0);
      expect(edge.sidewalkWidth!).toBeLessThanOrEqual(6);
      expect(edge.width).toBeGreaterThan(0);
      expect(edge.name && edge.name.trim().length > 0).toBe(true);
    }
  });

  it('includes ul. Stolarska connected to the Mikołów road graph with realistic buildings and addresses', () => {
    const stolarskaEdges = graph.edges.filter((e) => e.name === 'ul. Stolarska');
    expect(stolarskaEdges.length).toBeGreaterThanOrEqual(15);

    const playableBound = map.worldHalfSize - 60;
    for (const e of stolarskaEdges) {
      const a = graph.getNode(e.from)!;
      const b = graph.getNode(e.to)!;
      expect(Math.abs(a.x)).toBeLessThan(playableBound);
      expect(Math.abs(b.x)).toBeLessThan(playableBound);
      expect(Math.abs(a.z)).toBeLessThan(playableBound);
      expect(Math.abs(b.z)).toBeLessThan(playableBound);
    }

    // Routable from Rynek to the far western end of ul. Stolarska without shortcuts
    const rynek = map.landmarks.find((l) => l.id === 'ratusz_rynek')!;
    const westEnd = graph.getNode('m_st_14')!;
    expect(westEnd).toBeDefined();
    const route = graph.findRouteBetweenPoints(rynek.curbX, rynek.curbZ, westEnd.x, westEnd.z, {
      allowShortcuts: false,
    });
    expect(route.waypoints.length).toBeGreaterThan(6);
    expect(route.totalLength).toBeGreaterThan(1500);

    // Sidewalk pickup/dropoff addresses exist on ul. Stolarska
    const stolarskaSpots = map.sidewalkSpots.filter((s) => s.address.startsWith('ul. Stolarska'));
    expect(stolarskaSpots.length).toBeGreaterThanOrEqual(10);

    // Realistic buildings (houses, apartment blocks, garages/industrial) populate the Stolarska area
    const stolarskaBuildings = (map.customBuildings ?? []).filter(
      (b) => b.x <= -1165 && b.x >= -1630 && b.z >= -340 && b.z <= 65
    );
    expect(stolarskaBuildings.length).toBeGreaterThanOrEqual(50);
    expect(stolarskaBuildings.some((b) => b.style === 'domek')).toBe(true);
    expect(stolarskaBuildings.some((b) => b.style === 'blok')).toBe(true);
  });
  it('recreates real building shapes and parking lots for shopping landmarks instead of generic boxes', () => {
    const kaufland = map.landmarks.find((l) => l.id === 'kaufland_mikolow')!;
    expect(kaufland.footprintParts!.length).toBeGreaterThanOrEqual(1);
    expect(kaufland.footprintParts![0].polygon.length).toBeGreaterThan(4);
    expect(kaufland.parkingLots!.length).toBeGreaterThanOrEqual(1);
    expect(kaufland.parkingLots![0].polygon.length).toBeGreaterThan(8);

    for (const id of ['auchan_mikolow', 'galeria_pik', 'mosir_hala']) {
      const lm = map.landmarks.find((l) => l.id === id)!;
      expect(lm.footprintParts?.length ?? 0, id).toBeGreaterThanOrEqual(1);
    }

    // No generic filler building center sits inside a real landmark polygon
    const inside = (x: number, z: number, poly: Array<[number, number]>) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i];
        const [xj, zj] = poly[j];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) c = !c;
      }
      return c;
    };
    for (const lm of map.landmarks) {
      const polys = [
        ...(lm.footprintParts ?? []).map((p) => p.polygon),
        ...(lm.parkingLots ?? []).map((p) => p.polygon),
      ];
      for (const b of map.customBuildings ?? []) {
        for (const poly of polys) {
          expect(inside(b.x, b.z, poly), `${lm.id} vs building ${b.x},${b.z}`).toBe(false);
        }
      }
    }
  });

  it('models real-world Mikołów roundabouts as counter-clockwise one-way rings with no signals inside', () => {
    const rbEdges = graph.edges.filter((e) => e.isRoundabout);
    expect(rbEdges.length).toBeGreaterThan(20);

    const rbIds = new Set(rbEdges.map((e) => e.roundaboutId).filter(Boolean));
    expect(rbIds.size).toBe(8);

    for (const e of rbEdges) {
      expect(e.isOneWay).toBe(true);
      expect(e.roundaboutCenter).toBeDefined();
      const a = graph.getNode(e.from)!;
      const b = graph.getNode(e.to)!;
      expect(a.hasTrafficLight).toBe(false);
      expect(b.hasTrafficLight).toBe(false);
      // Counter-clockwise in XZ (+X East, +Z South): cross product (a-c) x (b-c) <= 0
      const c = e.roundaboutCenter!;
      const cross = (a.x - c.x) * (b.z - c.z) - (a.z - c.z) * (b.x - c.x);
      expect(cross, `roundabout edge ${e.id} winding`).toBeLessThanOrEqual(0.01);
    }

    // Real-world building coverage (>3000 OSM-derived buildings)
    expect(map.customBuildings?.length ?? 0).toBeGreaterThan(3000);
  });

  it('includes varied road types/widths and keeps buildings clear of road asphalt', () => {
    const types = new Set(graph.edges.map((e) => e.roadType));
    expect(types.has('highway')).toBe(true);
    expect(types.has('avenue')).toBe(true);
    expect(types.has('street')).toBe(true);
    expect(types.has('country')).toBe(true);
    expect(types.has('shortcut')).toBe(true);

    const widths = graph.edges.map((e) => e.width);
    expect(Math.min(...widths)).toBeLessThan(6.0);
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(10.5);

    for (const b of map.customBuildings ?? []) {
      const proj = graph.projectPoint(b.x, b.z, 0, -1, 14);
      if (proj && !proj.edge.isShortcut) {
        expect(proj.distFromCenter).toBeGreaterThanOrEqual(proj.halfWidth * 0.8);
      }
    }

    // Street-View-verified polygonal buildings & fences on ul. Stolarska and ul. Henryka Dąbrowskiego
    const polyBlds = (map.customBuildings ?? []).filter((b) => b.polygon && b.polygon.length >= 3);
    expect(polyBlds.some((b) => b.x < -1165)).toBe(true);
    expect(polyBlds.some((b) => b.x > 720 && b.z > 175 && b.z < 405)).toBe(true);
    const fences = map.fences ?? [];
    expect(fences.length).toBeGreaterThan(50);
    expect(fences.some((f) => f.points[0][0] < -1165)).toBe(true);
    expect(fences.some((f) => f.points[0][0] > 720)).toBe(true);
  });

  it('resolves street and landmark names near Mikołów landmarks', () => {
    const baz = map.landmarks.find((l) => l.id === 'bazylika_wojciecha')!;
    const loc = getLocationLabel(map, baz.curbX, baz.curbZ, 0);
    expect(loc.landmark).toBe('Bazylika św. Wojciecha');
    expect(loc.street).toBeTruthy();

    const rynek = map.landmarks.find((l) => l.id === 'ratusz_rynek')!;
    const locRynek = getLocationLabel(map, rynek.curbX, rynek.curbZ, 0);
    expect(locRynek.landmark).toBe('Ratusz na Rynku');
    expect(locRynek.street).toBeTruthy();
  });
});

describe('Storage selectedMap persistence & legacy save migration', () => {
  const originalLocalStorage = globalThis.localStorage;

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    });
  });

  it('migrates legacy raxi.v1 saves without selectedMap to raxi_city and persists map selection', () => {
    const legacySave = {
      version: 1,
      settings: {
        masterVolume: 0.7,
        graphicsPreset: 'high',
      },
      highScores: [{ score: 1200, deliveries: 4, seed: 4242, date: '2026-01-01', timeSurvived: 95 }],
      stats: { shifts: 1, totalDeliveries: 4, bestScore: 1200 },
    };

    const mockStorage = createMemoryLocalStorage({
      'raxi.v1': JSON.stringify(legacySave),
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });

    const storage = new Storage();
    expect(storage.settings.selectedMap).toBe('raxi_city');
    expect(storage.highScores.length).toBe(1);
    expect(storage.highScores[0].mapId).toBeUndefined();

    storage.updateSettings({ selectedMap: 'mikolow' });
    storage.recordShift({
      score: 2500,
      deliveries: 7,
      seed: 9999,
      timeSurvived: 130,
      mapId: 'mikolow',
    });

    const reloaded = new Storage();
    expect(reloaded.settings.selectedMap).toBe('mikolow');
    expect(reloaded.highScores[0].mapId).toBe('mikolow');
    expect(reloaded.highScores[1].mapId).toBeUndefined();
  });

  it('sanitizes invalid selectedMap values back to raxi_city', () => {
    const mockStorage = createMemoryLocalStorage({
      'raxi.v1': JSON.stringify({
        version: 1,
        settings: { selectedMap: 'invalid_map_id' },
      }),
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });

    const storage = new Storage();
    expect(storage.settings.selectedMap).toBe('raxi_city');
  });
});
