import { WaitingPassenger } from '../../gameplay/PassengerSpawner';
import { getTripColorHex } from '../../gameplay/Passenger';
import { GreenZoneKind, MapDefinition } from '../../world/mapData';

const MINIMAP_GREEN_FILL: Record<GreenZoneKind, string> = {
  forest: 'rgba(34, 96, 54, 0.56)',
  park: 'rgba(54, 142, 70, 0.52)',
  sports: 'rgba(62, 170, 84, 0.58)',
  cemetery: 'rgba(46, 108, 66, 0.48)',
  meadow: 'rgba(76, 132, 58, 0.40)',
  lawn: 'rgba(68, 134, 70, 0.36)',
};

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

    ctx.translate(half, half);
    // Rotate map so player's forward direction always points UP
    ctx.rotate(params.playerYaw);

    const toLocal = (wx: number, wz: number): [number, number] => [
      (wx - params.playerX) * scale,
      (wz - params.playerZ) * scale,
    ];

    // Optional Green Zones (parks, forests, meadows, sports fields) softly under the road network
    const greenZones = params.map.greenZones;
    if (greenZones && greenZones.length > 0) {
      const cullBound = half + 55;
      for (let g = 0; g < greenZones.length; g++) {
        const gz = greenZones[g];
        const poly = gz.polygon;
        if (poly.length < 3) continue;

        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (let i = 0; i < poly.length; i++) {
          const lx = (poly[i][0] - params.playerX) * scale;
          const lz = (poly[i][1] - params.playerZ) * scale;
          if (lx < minX) minX = lx;
          if (lx > maxX) maxX = lx;
          if (lz < minZ) minZ = lz;
          if (lz > maxZ) maxZ = lz;
        }
        if (maxX < -cullBound || minX > cullBound || maxZ < -cullBound || minZ > cullBound) {
          continue;
        }

        ctx.beginPath();
        for (let i = 0; i < poly.length; i++) {
          const [lx, lz] = toLocal(poly[i][0], poly[i][1]);
          if (i === 0) ctx.moveTo(lx, lz);
          else ctx.lineTo(lx, lz);
        }
        ctx.closePath();
        ctx.fillStyle = MINIMAP_GREEN_FILL[gz.kind] ?? 'rgba(54, 142, 70, 0.48)';
        ctx.fill();
        if (gz.kind === 'sports') {
          ctx.strokeStyle = 'rgba(220, 245, 225, 0.28)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    // Optional Railway Lines (subtle dashed tracks)
    const railLines = params.map.railLines;
    if (railLines && railLines.length > 0) {
      for (let r = 0; r < railLines.length; r++) {
        const pts = railLines[r].points;
        if (pts.length < 2) continue;

        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const [lx, lz] = toLocal(pts[i][0], pts[i][1]);
          if (i === 0) ctx.moveTo(lx, lz);
          else ctx.lineTo(lx, lz);
        }
        // Subtle dark rail bed
        ctx.strokeStyle = 'rgba(130, 145, 160, 0.42)';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Crisp dashed steel sleepers/rails
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(215, 225, 235, 0.72)';
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Optional Landmark Parking Lots & Real Building Silhouettes
    for (const lm of params.map.landmarks) {
      if (lm.parkingLots) {
        for (const lot of lm.parkingLots) {
          if (lot.polygon.length < 3) continue;
          ctx.beginPath();
          for (let i = 0; i < lot.polygon.length; i++) {
            const [lx, lz] = toLocal(lot.polygon[i][0], lot.polygon[i][1]);
            if (i === 0) ctx.moveTo(lx, lz);
            else ctx.lineTo(lx, lz);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(72, 80, 88, 0.85)';
          ctx.fill();
        }
      }
      if (lm.footprintParts) {
        for (const part of lm.footprintParts) {
          if (part.polygon.length < 3) continue;
          ctx.beginPath();
          for (let i = 0; i < part.polygon.length; i++) {
            const [lx, lz] = toLocal(part.polygon[i][0], part.polygon[i][1]);
            if (i === 0) ctx.moveTo(lx, lz);
            else ctx.lineTo(lx, lz);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(182, 168, 152, 0.88)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(30, 35, 42, 0.75)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    // Roads
    for (const e of params.map.graph.edges) {
      const a = params.map.graph.getNode(e.from)!;
      const b = params.map.graph.getNode(e.to)!;
      const [x0, z0] = toLocal(a.x, a.z);
      const [x1, z1] = toLocal(b.x, b.z);
      if (Math.min(Math.abs(x0), Math.abs(x1)) > half + 40 && Math.min(Math.abs(z0), Math.abs(z1)) > half + 40) {
        continue;
      }
      ctx.strokeStyle = e.blocked
        ? '#ff5252'
        : e.isShortcut
          ? 'rgba(180, 155, 110, 0.65)'
          : e.roadType === 'highway'
            ? '#8095a8'
            : '#5c6b78';
      ctx.lineWidth = Math.max(1.5, e.width * scale * 0.65);
      ctx.beginPath();
      ctx.moveTo(x0, z0);
      ctx.lineTo(x1, z1);
      ctx.stroke();
    }

    // Active A* Route line
    if (params.routeWaypoints.length >= 2) {
      ctx.strokeStyle = params.inBreakMode ? '#00e5ff' : '#00e676';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let i = 0; i < params.routeWaypoints.length; i++) {
        const [wx, wz] = toLocal(params.routeWaypoints[i].x, params.routeWaypoints[i].z);
        if (i === 0) ctx.moveTo(wx, wz);
        else ctx.lineTo(wx, wz);
      }
      ctx.stroke();
    }

    // Garages (cyan wrench squares)
    for (const g of params.map.garages) {
      const [gx, gz] = toLocal(g.x, g.z);
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(gx - 4, gz - 4, 8, 8);
      ctx.strokeStyle = '#002b36';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(gx - 4, gz - 4, 8, 8);
    }

    // Waiting passengers (colored dots by trip length)
    if (!params.inBreakMode) {
      for (const wp of params.waitingPassengers) {
        const [px, pz] = toLocal(wp.x, wp.z);
        ctx.fillStyle = '#' + getTripColorHex(wp.tripCategory).toString(16).padStart(6, '0');
        ctx.beginPath();
        ctx.arc(px, pz, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Active destination markers
    for (const d of params.destinations) {
      const [dx, dz] = toLocal(d.x, d.z);
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
