/**
 * Single authoritative heightmap for the entire 2.4 x 2.4 km world.
 * Guarantees there is strictly ONE ground height at any (x, z) coordinate,
 * matching Three.js PlaneGeometry triangulation (rotated -PI/2 around X) identically.
 */
export class HeightMap {
  public readonly segments: number;
  public readonly worldHalfSize: number;
  public readonly cellSize: number;
  public readonly gridWidth: number;
  public readonly heights: Float32Array;

  constructor(
    worldHalfSize: number,
    segments: number,
    heightFn: (x: number, z: number) => number
  ) {
    this.worldHalfSize = worldHalfSize;
    this.segments = segments;
    this.gridWidth = segments + 1;
    this.cellSize = (worldHalfSize * 2) / segments;
    this.heights = new Float32Array(this.gridWidth * this.gridWidth);

    for (let iz = 0; iz <= segments; iz++) {
      const z = -worldHalfSize + iz * this.cellSize;
      for (let ix = 0; ix <= segments; ix++) {
        const x = -worldHalfSize + ix * this.cellSize;
        this.heights[iz * this.gridWidth + ix] = heightFn(x, z);
      }
    }
  }

  /**
   * Exact barycentric height sample matching Three.js PlaneGeometry triangles (a,b,d) and (b,c,d).
   */
  sample(x: number, z: number): number {
    const gx = (x + this.worldHalfSize) / this.cellSize;
    const gz = (z + this.worldHalfSize) / this.cellSize;

    const ix = Math.max(0, Math.min(this.segments - 1, Math.floor(gx)));
    const iz = Math.max(0, Math.min(this.segments - 1, Math.floor(gz)));
    const fx = Math.max(0, Math.min(1, gx - ix));
    const fz = Math.max(0, Math.min(1, gz - iz));

    const gw = this.gridWidth;
    const hA = this.heights[iz * gw + ix]; // (0, 0)
    const hD = this.heights[iz * gw + (ix + 1)]; // (1, 0)
    const hB = this.heights[(iz + 1) * gw + ix]; // (0, 1)
    const hC = this.heights[(iz + 1) * gw + (ix + 1)]; // (1, 1)

    // Diagonal connects B (0,1) to D (1,0): fx + fz <= 1 is triangle (A, B, D)
    if (fx + fz <= 1) {
      return hA + fx * (hD - hA) + fz * (hB - hA);
    }
    return hC + (1 - fx) * (hB - hC) + (1 - fz) * (hD - hC);
  }

  /**
   * Returns approximate surface slope pitch along (dirX, dirZ) for orienting vehicles on hills.
   */
  sampleSlope(x: number, z: number, dirX: number, dirZ: number): number {
    const step = 1.5;
    const hAhead = this.sample(x + dirX * step, z + dirZ * step);
    const hBehind = this.sample(x - dirX * step, z - dirZ * step);
    return Math.atan2(hAhead - hBehind, step * 2);
  }

  /**
   * Returns unit surface normal at (x, z) via central differences.
   */
  sampleNormal(x: number, z: number): { x: number; y: number; z: number } {
    const eps = 1.0;
    const hx = (this.sample(x + eps, z) - this.sample(x - eps, z)) / (2 * eps);
    const hz = (this.sample(x, z + eps) - this.sample(x, z - eps)) / (2 * eps);
    const invLen = 1 / Math.hypot(hx, 1, hz);
    return { x: -hx * invLen, y: invLen, z: -hz * invLen };
  }
}
