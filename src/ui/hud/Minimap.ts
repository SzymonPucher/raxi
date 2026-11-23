import { WaitingPassenger } from '../../gameplay/PassengerSpawner';
import { getTripColorHex } from '../../gameplay/Passenger';
import { MapDefinition } from '../../world/mapData';

/**
 * Bottom-left Canvas 2D Minimap rotated with the player (§8.4).
 * Shows roads, A* route line, waiting passengers (colored dots), destinations, and garages.
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

    // River
    const [rx0, rz0] = toLocal(params.map.riverLine.x0, params.map.riverLine.z0);
    const [rx1, rz1] = toLocal(params.map.riverLine.x1, params.map.riverLine.z1);
    ctx.strokeStyle = 'rgba(36, 146, 209, 0.55)';
    ctx.lineWidth = params.map.riverLine.halfWidth * 2 * scale;
    ctx.beginPath();
    ctx.moveTo(rx0, rz0);
    ctx.lineTo(rx1, rz1);
    ctx.stroke();

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
