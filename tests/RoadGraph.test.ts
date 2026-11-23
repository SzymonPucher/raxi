import { describe, expect, it } from 'vitest';
import { createMapDefinition } from '../src/world/mapData';

describe('RoadGraph & MapDefinition', () => {
  const map = createMapDefinition();
  const graph = map.graph;

  it('contains all 16 landmarks and 4 garages', () => {
    expect(map.landmarks.length).toBe(16);
    expect(map.garages.length).toBe(4);
    expect(map.sidewalkSpots.length).toBeGreaterThan(80);
  });

  it('finds valid A* routes between downtown and outskirts landmarks', () => {
    const start = map.landmarks.find((l) => l.id === 'raxi_tower')!;
    const end = map.landmarks.find((l) => l.id === 'lighthouse')!;
    const route = graph.findRouteBetweenPoints(start.curbX, start.curbZ, end.curbX, end.curbZ);
    expect(route.waypoints.length).toBeGreaterThan(4);
    expect(route.totalLength).toBeGreaterThan(800);
  });

  it('uses shorter park shortcuts only when allowShortcuts is true', () => {
    const normal = graph.findRoute('g_3_3', 'g_5_5', { allowShortcuts: false });
    const shortcut = graph.findRoute('g_3_3', 'g_5_5', { allowShortcuts: true });
    expect(shortcut.totalLength).toBeLessThan(normal.totalLength);
  });

  it('reroutes around blocked road-works edges', () => {
    const base = graph.findRoute('g_5_5', 'g_5_6');
    const directEdge = graph.edges.find(
      (e) => (e.from === 'g_5_5' && e.to === 'g_5_6') || (e.from === 'g_5_6' && e.to === 'g_5_5')
    );
    expect(directEdge).toBeDefined();
    graph.setEdgeBlocked(directEdge!.id, true);
    const rerouted = graph.findRoute('g_5_5', 'g_5_6');
    graph.clearAllBlocked();
    expect(rerouted.totalLength).toBeGreaterThan(base.totalLength);
  });

  it('projects positions onto road edges and detects oncoming lane', () => {
    // Edge from g_5_5 (0,0) to g_5_6 (0,100): dir=(0,1), right=(-1,0)
    // Right lane has signedLateral > 0 => x < 0, traveling +Z (headingZ=1) is legal; headingZ=-1 is oncoming
    const legal = graph.projectPoint(-3.5, 50, 0, 1);
    const oncoming = graph.projectPoint(-3.5, 50, 0, -1);
    expect(legal).not.toBeNull();
    expect(legal!.isOncoming).toBe(false);
    expect(oncoming!.isOncoming).toBe(true);
  });
});
