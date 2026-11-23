export type DistrictId = 'downtown' | 'residential' | 'docks' | 'park' | 'outskirts';
export type RoadType = 'avenue' | 'street' | 'highway' | 'country' | 'bridge' | 'shortcut';

export interface RoadNode {
  id: string;
  x: number;
  y: number;
  z: number;
  district: DistrictId;
  hasTrafficLight: boolean;
}

export interface RoadEdge {
  id: string;
  from: string;
  to: string;
  lanesPerDir: number; // 1 or 2
  roadType: RoadType;
  speedLimit: number; // m/s
  width: number; // total paved width in meters
  sidewalkWidth?: number; // sidewalk/curb width per side in meters
  name?: string; // optional real street name
  isShortcut?: boolean;
  isOneWay?: boolean;
  length: number;
  blocked?: boolean;
}

export interface RouteResult {
  nodeIds: string[];
  waypoints: Array<{ x: number; y: number; z: number }>;
  totalLength: number;
}

export interface RoadProjection {
  edge: RoadEdge;
  fromNode: RoadNode;
  toNode: RoadNode;
  t: number; // 0..1 along edge
  closestX: number;
  closestY: number;
  closestZ: number;
  distFromCenter: number;
  /** Signed offset to the right of from->to direction */
  signedLateral: number;
  /** Edge unit direction (from -> to) */
  dirX: number;
  dirZ: number;
  /** Right vector perpendicular to dirX, dirZ */
  rightX: number;
  rightZ: number;
  /** Half-width of road */
  halfWidth: number;
  /** Distance from car to road centerline in lane units */
  laneIndex: number;
  /** Whether car's heading opposes the lane's legal direction */
  isOncoming: boolean;
  /** Distance to the upcoming node in the car's heading direction */
  distToAheadNode: number;
  /** Distance to the closest endpoint node of this edge (small inside intersections) */
  distToNearestNode: number;
  /** Signed dot product of car heading with edge direction (from->to) */
  headingDot: number;
  aheadNode: RoadNode;
}

/**
 * Pure, Three.js-free road network graph with A* pathfinding and spatial lane queries.
 */
export class RoadGraph {
  public readonly nodes = new Map<string, RoadNode>();
  public readonly edges: RoadEdge[] = [];
  public readonly edgeMap = new Map<string, RoadEdge>();
  public readonly adjacency = new Map<string, Array<{ to: string; edge: RoadEdge }>>();

  constructor(nodes: RoadNode[], edges: Omit<RoadEdge, 'length'>[]) {
    for (const n of nodes) {
      this.nodes.set(n.id, n);
      this.adjacency.set(n.id, []);
    }
    for (const e of edges) {
      const a = this.nodes.get(e.from);
      const b = this.nodes.get(e.to);
      if (!a || !b) continue;
      const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const full: RoadEdge = { ...e, length };
      this.edges.push(full);
      this.edgeMap.set(full.id, full);
      this.adjacency.get(e.from)!.push({ to: e.to, edge: full });
      if (!e.isOneWay) {
        this.adjacency.get(e.to)!.push({ to: e.from, edge: full });
      }
    }
  }

  getNode(id: string): RoadNode | undefined {
    return this.nodes.get(id);
  }

  setEdgeBlocked(edgeId: string, blocked: boolean): void {
    const e = this.edgeMap.get(edgeId);
    if (e) e.blocked = blocked;
  }

  clearAllBlocked(): void {
    for (const e of this.edges) {
      e.blocked = false;
    }
  }

  findNearestNode(x: number, z: number, allowShortcuts = false): RoadNode {
    let best: RoadNode | null = null;
    let bestDistSq = Infinity;
    for (const n of this.nodes.values()) {
      if (!allowShortcuts) {
        const adj = this.adjacency.get(n.id);
        if (!adj || adj.every((a) => a.edge.isShortcut)) continue;
      }
      const dx = n.x - x;
      const dz = n.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        best = n;
      }
    }
    return best ?? this.nodes.values().next().value!;
  }

  /**
   * A* pathfinding between two node IDs.
   */
  findRoute(
    startNodeId: string,
    goalNodeId: string,
    options: { allowShortcuts?: boolean } = {}
  ): RouteResult {
    const start = this.nodes.get(startNodeId);
    const goal = this.nodes.get(goalNodeId);
    if (!start || !goal) {
      return { nodeIds: [], waypoints: [], totalLength: 0 };
    }
    if (startNodeId === goalNodeId) {
      return {
        nodeIds: [startNodeId],
        waypoints: [{ x: start.x, y: start.y, z: start.z }],
        totalLength: 0,
      };
    }

    const allowShortcuts = Boolean(options.allowShortcuts);
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();
    const cameFrom = new Map<string, string>();
    const closed = new Set<string>();
    const open = new Set<string>([startNodeId]);

    const heuristic = (a: RoadNode, b: RoadNode) => Math.hypot(b.x - a.x, b.z - a.z);

    gScore.set(startNodeId, 0);
    fScore.set(startNodeId, heuristic(start, goal));

    while (open.size > 0) {
      let currentId = '';
      let lowestF = Infinity;
      for (const id of open) {
        const f = fScore.get(id) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          currentId = id;
        }
      }
      if (!currentId) break;
      if (currentId === goalNodeId) {
        return this.reconstruct(cameFrom, currentId);
      }

      open.delete(currentId);
      closed.add(currentId);

      const neighbors = this.adjacency.get(currentId);
      if (!neighbors) continue;
      const currentG = gScore.get(currentId) ?? Infinity;

      for (const { to, edge } of neighbors) {
        if (closed.has(to)) continue;
        if (edge.blocked) continue;
        if (edge.isShortcut && !allowShortcuts) continue;

        // Slight preference for highways/avenues while preserving true metric distance
        const weight = edge.roadType === 'highway' ? 0.92 : edge.isShortcut ? 0.88 : 1.0;
        const tentativeG = currentG + edge.length * weight;
        if (tentativeG < (gScore.get(to) ?? Infinity)) {
          cameFrom.set(to, currentId);
          gScore.set(to, tentativeG);
          const toNode = this.nodes.get(to)!;
          fScore.set(to, tentativeG + heuristic(toNode, goal));
          open.add(to);
        }
      }
    }

    // Fallback direct line if blocked edges isolated a node
    const directLen = Math.hypot(goal.x - start.x, goal.z - start.z);
    return {
      nodeIds: [startNodeId, goalNodeId],
      waypoints: [
        { x: start.x, y: start.y, z: start.z },
        { x: goal.x, y: goal.y, z: goal.z },
      ],
      totalLength: directLen,
    };
  }

  findRouteBetweenPoints(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    options: { allowShortcuts?: boolean } = {}
  ): RouteResult {
    const startNode = this.findNearestNode(x0, z0, options.allowShortcuts);
    const goalNode = this.findNearestNode(x1, z1, options.allowShortcuts);
    const res = this.findRoute(startNode.id, goalNode.id, options);
    const endDist = Math.hypot(x1 - goalNode.x, z1 - goalNode.z);
    if (endDist > 3) {
      res.waypoints.push({ x: x1, y: goalNode.y, z: z1 });
      res.totalLength += endDist;
    }
    return res;
  }

  private reconstruct(cameFrom: Map<string, string>, currentId: string): RouteResult {
    const nodeIds: string[] = [currentId];
    let cur = currentId;
    while (cameFrom.has(cur)) {
      cur = cameFrom.get(cur)!;
      nodeIds.push(cur);
    }
    nodeIds.reverse();
    const waypoints: Array<{ x: number; y: number; z: number }> = [];
    let totalLength = 0;
    for (let i = 0; i < nodeIds.length; i++) {
      const n = this.nodes.get(nodeIds[i])!;
      waypoints.push({ x: n.x, y: n.y, z: n.z });
      if (i > 0) {
        const prev = this.nodes.get(nodeIds[i - 1])!;
        totalLength += Math.hypot(n.x - prev.x, n.y - prev.y, n.z - prev.z);
      }
    }
    return { nodeIds, waypoints, totalLength };
  }

  /**
   * Project a world position + heading onto the closest road edge.
   * Used by RulesTracker, Traffic, and navigation.
   */
  projectPoint(
    x: number,
    z: number,
    headingX = 0,
    headingZ = -1,
    maxDistance = 18
  ): RoadProjection | null {
    const headingLen = Math.hypot(headingX, headingZ);
    const hasHeading = headingLen > 0.01;
    const hnx = hasHeading ? headingX / headingLen : 0;
    const hnz = hasHeading ? headingZ / headingLen : -1;

    let bestEdge: RoadEdge | null = null;
    let bestScore = Infinity;
    let bestDistSq = maxDistance * maxDistance;
    let bestT = 0;
    let bestCX = 0;
    let bestCY = 0;
    let bestCZ = 0;

    for (let i = 0; i < this.edges.length; i++) {
      const e = this.edges[i];
      const a = this.nodes.get(e.from)!;
      const b = this.nodes.get(e.to)!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lenSq = dx * dx + dz * dz;
      if (lenSq < 0.0001) continue;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + dx * t;
      const cz = a.z + dz * t;
      const distSq = (x - cx) * (x - cx) + (z - cz) * (z - cz);
      if (distSq > maxDistance * maxDistance) continue;

      const dist = Math.sqrt(distSq);
      let score = dist;
      if (hasHeading) {
        const len = Math.sqrt(lenSq);
        const align = Math.abs((dx / len) * hnx + (dz / len) * hnz);
        // Prefer road edge aligned with vehicle heading so going straight across intersections
        // never snaps onto the perpendicular cross-street
        score += (1 - align) * 9.0;
      }

      if (score < bestScore) {
        bestScore = score;
        bestDistSq = distSq;
        bestEdge = e;
        bestT = t;
        bestCX = cx;
        bestCY = a.y + (b.y - a.y) * t;
        bestCZ = cz;
      }
    }

    if (!bestEdge) return null;
    const a = this.nodes.get(bestEdge.from)!;
    const b = this.nodes.get(bestEdge.to)!;
    const len2D = Math.max(0.001, Math.hypot(b.x - a.x, b.z - a.z));
    const dirX = (b.x - a.x) / len2D;
    const dirZ = (b.z - a.z) / len2D;
    // Right-hand side of (dirX, dirZ) in XZ plane (Y up): (-dirZ, dirX)
    const rightX = -dirZ;
    const rightZ = dirX;
    const signedLateral = (x - bestCX) * rightX + (z - bestCZ) * rightZ;
    const halfWidth = bestEdge.width * 0.5;

    // Right-hand traffic: signedLateral > 0 travels along +dir (from->to), < 0 travels along -dir (to->from)
    const laneWidth = halfWidth / Math.max(1, bestEdge.lanesPerDir);
    const laneIndex = Math.floor(signedLateral / Math.max(1.5, laneWidth));

    const headingDot = hnx * dirX + hnz * dirZ;
    const movingAlongForward = headingDot >= 0;

    // Oncoming if firmly on the opposite half of a two-way road
    const isOncoming =
      !bestEdge.isOneWay &&
      !bestEdge.isShortcut &&
      Math.abs(signedLateral) > 1.1 &&
      ((signedLateral > 0 && headingDot < -0.35) || (signedLateral < 0 && headingDot > 0.35));

    const aheadNode = movingAlongForward ? b : a;
    const distToAheadNode = movingAlongForward ? (1 - bestT) * len2D : bestT * len2D;
    const distToNearestNode = Math.min(bestT * len2D, (1 - bestT) * len2D);

    return {
      edge: bestEdge,
      fromNode: a,
      toNode: b,
      t: bestT,
      closestX: bestCX,
      closestY: bestCY,
      closestZ: bestCZ,
      distFromCenter: Math.sqrt(bestDistSq),
      signedLateral,
      dirX,
      dirZ,
      rightX,
      rightZ,
      halfWidth,
      laneIndex,
      isOncoming,
      distToAheadNode,
      distToNearestNode,
      headingDot,
      aheadNode,
    };
  }
}
