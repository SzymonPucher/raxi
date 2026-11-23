import { WaitingPassenger } from '../../gameplay/PassengerSpawner';
import { getTripColorHex } from '../../gameplay/Passenger';
import { GreenZoneKind, MapDefinition } from '../../world/mapData';
import { RoadEdge } from '../../world/RoadGraph';

const MINIMAP_GREEN_FILL: Record<GreenZoneKind, string> = {
  forest: 'rgba(34, 96, 54, 0.56)',
  park: 'rgba(54, 142, 70, 0.52)',
  sports: 'rgba(62, 170, 84, 0.58)',
  cemetery: 'rgba(46, 108, 66, 0.48)',
  meadow: 'rgba(76, 132, 58, 0.40)',
  lawn: 'rgba(68, 134, 70, 0.36)',
};

interface BoundedPolyItem {
  poly: Array<[number, number]>;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  fillStyle?: string;
  isSports?: boolean;
}

interface CachedEdgeItem {
  edge: RoadEdge;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  lineWidth: number;
}

interface CachedRoadBatch {
  strokeStyle: string;
  lineWidth: number;
  items: CachedEdgeItem[];
}

interface CachedMinimapData {
  greenZones: BoundedPolyItem[];
  railLines: BoundedPolyItem[];
  parkingLots: BoundedPolyItem[];
  footprintParts: BoundedPolyItem[];
  roadBatches: CachedRoadBatch[];
  allEdges: CachedEdgeItem[];
}

const minimapCache = new WeakMap<MapDefinition, CachedMinimapData>();

function computeBounds(pts: Array<[number, number]>): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0];
    const z = pts[i][1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

function getCachedMinimapData(map: MapDefinition, scale: number): CachedMinimapData {
  let cached = minimapCache.get(map);
  if (cached) return cached;

  const greenZones: BoundedPolyItem[] = [];
  for (const gz of map.greenZones ?? []) {
    if (gz.polygon.length < 3) continue;
    greenZones.push({
      poly: gz.polygon,
      ...computeBounds(gz.polygon),
      fillStyle: MINIMAP_GREEN_FILL[gz.kind] ?? 'rgba(54, 142, 70, 0.48)',
      isSports: gz.kind === 'sports',
    });
  }

  const railLines: BoundedPolyItem[] = [];
  for (const rl of map.railLines ?? []) {
    if (rl.points.length < 2) continue;
    railLines.push({
      poly: rl.points,
      ...computeBounds(rl.points),
    });
  }

  const parkingLots: BoundedPolyItem[] = [];
  const footprintParts: BoundedPolyItem[] = [];
  for (const lm of map.landmarks) {
    if (lm.parkingLots) {
      for (const lot of lm.parkingLots) {
        if (lot.polygon.length < 3) continue;
        parkingLots.push({ poly: lot.polygon, ...computeBounds(lot.polygon) });
      }
    }
    if (lm.footprintParts) {
      for (const part of lm.footprintParts) {
        if (part.polygon.length < 3) continue;
        footprintParts.push({ poly: part.polygon, ...computeBounds(part.polygon) });
      }
    }
  }

  const batchMap = new Map<string, CachedRoadBatch>();
  const allEdges: CachedEdgeItem[] = [];
  for (const e of map.graph.edges) {
    const a = map.graph.getNode(e.from)!;
    const b = map.graph.getNode(e.to)!;
    const strokeStyle = e.isShortcut
      ? 'rgba(180, 155, 110, 0.65)'
      : e.roadType === 'highway'
        ? '#8095a8'
        : '#5c6b78';
    const lineWidth = Number(Math.max(1.5, e.width * scale * 0.65).toFixed(2));
    const item: CachedEdgeItem = {
      edge: e,
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      minX: Math.min(a.x, b.x),
      maxX: Math.max(a.x, b.x),
      minZ: Math.min(a.z, b.z),
      maxZ: Math.max(a.z, b.z),
      lineWidth,
    };
    allEdges.push(item);

    const key = `${strokeStyle}|${lineWidth}`;
    let batch = batchMap.get(key);
    if (!batch) {
      batch = { strokeStyle, lineWidth, items: [] };
      batchMap.set(key, batch);
    }
    batch.items.push(item);
  }

  cached = {
    greenZones,
    railLines,
    parkingLots,
    footprintParts,
    roadBatches: Array.from(batchMap.values()),
    allEdges,
  };
  minimapCache.set(map, cached);
  return cached;
}

/**
 * Bottom-left Canvas 2D Minimap rotated with the player (§8.4).
 * Shows optional green zones & railways, roads, A* route line, waiting passengers (colored dots), destinations, and garages.
 * Disabled when Lone Wolf curse (#32) is active!
 */
export class Minimap {
  public readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly size = 190;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.className = 'hud-minimap-canvas';
    this.ctx = this.canvas.getContext('2d')!;
  }

  render(params: {
    map: MapDefinition;
    playerX: number;
    playerZ: number;
    playerYaw: number;
    routeWaypoints: Array<{ x: number; z: number }>;
    waitingPassengers: WaitingPassenger[];
    destinations: Array<{ x: number; z: number }>;
    inBreakMode: boolean;
    hiddenByCurse: boolean;
  }): void {
    const ctx = this.ctx;
    const s = this.size;
    const half = s * 0.5;
    ctx.clearRect(0, 0, s, s);

    if (params.hiddenByCurse) {
      ctx.fillStyle = 'rgba(15, 18, 24, 0.85)';
      ctx.beginPath();
      ctx.arc(half, half, half - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff5252';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LONE WOLF', half, half - 6);
      ctx.fillStyle = '#aaa';
      ctx.font = '11px sans-serif';
      ctx.fillText('NO MINIMAP', half, half + 12);
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 3, 0, Math.PI * 2);
    ctx.clip();

    // Background
    ctx.fillStyle = 'rgba(18, 25, 34, 0.88)';
    ctx.fillRect(0, 0, s, s);

    const scale = 0.24; // meters -> pixels (~380m radius visible)
    const px = params.playerX;
    const pz = params.playerZ;
    // Rotation-invariant world culling bound around (px, pz)
    const worldCull = (half + 45) / scale;
    const cullMinX = px - worldCull;
    const cullMaxX = px + worldCull;
    const cullMinZ = pz - worldCull;
    const cullMaxZ = pz + worldCull;

    const cached = getCachedMinimapData(params.map, scale);

    ctx.translate(half, half);
    // Rotate map so player's forward direction always points UP
    ctx.rotate(params.playerYaw);

    // Optional Green Zones (parks, forests, meadows, sports fields) softly under the road network
    for (let g = 0; g < cached.greenZones.length; g++) {
      const gz = cached.greenZones[g];
      if (gz.maxX < cullMinX || gz.minX > cullMaxX || gz.maxZ < cullMinZ || gz.minZ > cullMaxZ) {
        continue;
      }
      const poly = gz.poly;
      ctx.beginPath();
      for (let i = 0; i < poly.length; i++) {
        const lx = (poly[i][0] - px) * scale;
        const lz = (poly[i][1] - pz) * scale;
        if (i === 0) ctx.moveTo(lx, lz);
        else ctx.lineTo(lx, lz);
      }
      ctx.closePath();
      ctx.fillStyle = gz.fillStyle!;
      ctx.fill();
      if (gz.isSports) {
        ctx.strokeStyle = 'rgba(220, 245, 225, 0.28)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }

    // Optional Railway Lines (subtle dashed tracks)
    for (let r = 0; r < cached.railLines.length; r++) {
      const rl = cached.railLines[r];
      if (rl.maxX < cullMinX || rl.minX > cullMaxX || rl.maxZ < cullMinZ || rl.minZ > cullMaxZ) {
        continue;
      }
      const pts = rl.poly;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const lx = (pts[i][0] - px) * scale;
        const lz = (pts[i][1] - pz) * scale;
        if (i === 0) ctx.moveTo(lx, lz);
        else ctx.lineTo(lx, lz);
      }
      ctx.strokeStyle = 'rgba(130, 145, 160, 0.42)';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(215, 225, 235, 0.72)';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Optional Landmark Parking Lots & Real Building Silhouettes (world-culled!)
    if (cached.parkingLots.length > 0) {
      ctx.fillStyle = 'rgba(72, 80, 88, 0.85)';
      ctx.beginPath();
      let hasLot = false;
      for (let l = 0; l < cached.parkingLots.length; l++) {
        const lot = cached.parkingLots[l];
        if (lot.maxX < cullMinX || lot.minX > cullMaxX || lot.maxZ < cullMinZ || lot.minZ > cullMaxZ) {
          continue;
        }
        hasLot = true;
        const poly = lot.poly;
        for (let i = 0; i < poly.length; i++) {
          const lx = (poly[i][0] - px) * scale;
          const lz = (poly[i][1] - pz) * scale;
          if (i === 0) ctx.moveTo(lx, lz);
          else ctx.lineTo(lx, lz);
        }
        ctx.closePath();
      }
      if (hasLot) ctx.fill();
    }

    if (cached.footprintParts.length > 0) {
      ctx.fillStyle = 'rgba(182, 168, 152, 0.88)';
      ctx.strokeStyle = 'rgba(30, 35, 42, 0.75)';
      ctx.lineWidth = 0.8;
      for (let p = 0; p < cached.footprintParts.length; p++) {
        const part = cached.footprintParts[p];
        if (part.maxX < cullMinX || part.minX > cullMaxX || part.maxZ < cullMinZ || part.minZ > cullMaxZ) {
          continue;
        }
        const poly = part.poly;
        ctx.beginPath();
        for (let i = 0; i < poly.length; i++) {
          const lx = (poly[i][0] - px) * scale;
          const lz = (poly[i][1] - pz) * scale;
          if (i === 0) ctx.moveTo(lx, lz);
          else ctx.lineTo(lx, lz);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Roads (batched by strokeStyle + lineWidth -> ~6 draw calls instead of ~400!)
    let hasBlocked = false;
    for (let b = 0; b < cached.roadBatches.length; b++) {
      const batch = cached.roadBatches[b];
      const items = batch.items;
      let started = false;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.maxX < cullMinX || it.minX > cullMaxX || it.maxZ < cullMinZ || it.minZ > cullMaxZ) {
          continue;
        }
        if (it.edge.blocked) {
          hasBlocked = true;
          continue;
        }
        if (!started) {
          started = true;
          ctx.beginPath();
        }
        ctx.moveTo((it.ax - px) * scale, (it.az - pz) * scale);
        ctx.lineTo((it.bx - px) * scale, (it.bz - pz) * scale);
      }
      if (started) {
        ctx.strokeStyle = batch.strokeStyle;
        ctx.lineWidth = batch.lineWidth;
        ctx.stroke();
      }
    }

    if (hasBlocked) {
      ctx.strokeStyle = '#ff5252';
      for (let i = 0; i < cached.allEdges.length; i++) {
        const it = cached.allEdges[i];
        if (!it.edge.blocked) continue;
        if (it.maxX < cullMinX || it.minX > cullMaxX || it.maxZ < cullMinZ || it.minZ > cullMaxZ) {
          continue;
        }
        ctx.lineWidth = it.lineWidth;
        ctx.beginPath();
        ctx.moveTo((it.ax - px) * scale, (it.az - pz) * scale);
        ctx.lineTo((it.bx - px) * scale, (it.bz - pz) * scale);
        ctx.stroke();
      }
    }

    // Active A* Route line
    if (params.routeWaypoints.length >= 2) {
      ctx.strokeStyle = params.inBreakMode ? '#00e5ff' : '#00e676';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let i = 0; i < params.routeWaypoints.length; i++) {
        const wx = (params.routeWaypoints[i].x - px) * scale;
        const wz = (params.routeWaypoints[i].z - pz) * scale;
        if (i === 0) ctx.moveTo(wx, wz);
        else ctx.lineTo(wx, wz);
      }
      ctx.stroke();
    }

    // Garages (cyan wrench squares)
    for (const g of params.map.garages) {
      const gx = (g.x - px) * scale;
      const gz = (g.z - pz) * scale;
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(gx - 4, gz - 4, 8, 8);
      ctx.strokeStyle = '#002b36';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(gx - 4, gz - 4, 8, 8);
    }

    // Waiting passengers (colored dots by trip length)
    if (!params.inBreakMode) {
      for (const wp of params.waitingPassengers) {
        const wpx = (wp.x - px) * scale;
        const wpz = (wp.z - pz) * scale;
        ctx.fillStyle = '#' + getTripColorHex(wp.tripCategory).toString(16).padStart(6, '0');
        ctx.beginPath();
        ctx.arc(wpx, wpz, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Active destination markers
    for (const d of params.destinations) {
      const dx = (d.x - px) * scale;
      const dz = (d.z - pz) * scale;
      // Clamp to minimap edge if offscreen
      const dist = Math.hypot(dx, dz);
      const maxR = half - 10;
      const cx = dist > maxR ? (dx / dist) * maxR : dx;
      const cz = dist > maxR ? (dz / dist) * maxR : dz;
      ctx.fillStyle = '#00ff88';
      ctx.beginPath();
      ctx.arc(cx, cz, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();

    // Player taxi arrow at center (always pointing up)
    ctx.fillStyle = '#ffcc00';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(half, half - 8);
    ctx.lineTo(half + 6, half + 6);
    ctx.lineTo(half, half + 3);
    ctx.lineTo(half - 6, half + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rim ring
    ctx.strokeStyle = params.inBreakMode ? '#00e5ff' : '#ffcc00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(half, half, half - 2.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}
