import * as THREE from 'three';
import { BALANCE } from '../core/config/balance';
import { Rng } from '../core/Rng';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { ArcadeVehicle } from '../vehicle/ArcadeVehicle';
import { MapDefinition } from '../world/mapData';
import { RoadEdge } from '../world/RoadGraph';
import { TrafficCar, TrafficTurnCurve, pickTrafficKindForPoolIndex } from './TrafficCar';
import { TrafficLights } from './TrafficLights';

export interface NearMissHit {
  relSpeed: number;
  distance: number;
}

/** Dedicated cyclist pool size added on top of BALANCE.trafficMaxCount so cyclists never crowd out cars. */
export const CYCLIST_POOL_COUNT = 10;

/**
 * Computes the right-edge lateral lane offset for a cyclist on a road edge:
 * always farther to the right (closer to the curb) than regular car lanes while staying on asphalt.
 */
export function computeCyclistLaneOffset(
  edge: Pick<RoadEdge, 'width' | 'lanesPerDir' | 'isOneWay' | 'isRoundabout'>
): number {
  const halfW = edge.width * 0.5;
  const maxLane = Math.max(1, edge.lanesPerDir);
  const laneW = halfW / maxLane;
  const curbMargin = Math.min(0.85, Math.max(0.45, laneW * 0.25));
  return Math.max(0.5, halfW - curbMargin);
}

/** Computes a regular motor vehicle's lateral lane offset for a given lane index. */
export function computeCarLaneOffset(
  edge: Pick<RoadEdge, 'width' | 'lanesPerDir' | 'isOneWay'>,
  laneIdx: number
): number {
  const maxLane = Math.max(1, edge.lanesPerDir);
  const clampedIdx = Math.max(0, Math.min(maxLane - 1, laneIdx));
  const laneW = (edge.width * 0.5) / maxLane;
  if (edge.isOneWay && maxLane === 1) {
    return 0;
  }
  if (edge.isOneWay && maxLane > 1) {
    return (clampedIdx - (maxLane - 1) * 0.5) * laneW;
  }
  return (clampedIdx + 0.5) * laneW;
}

function getTurnMargin(edgeLength: number, isRoundabout = false): number {
  return isRoundabout ? Math.min(2.8, edgeLength * 0.22) : Math.min(10.5, edgeLength * 0.28);
}

function sampleBezier(
  p0x: number,
  p0z: number,
  p1x: number,
  p1z: number,
  p2x: number,
  p2z: number,
  u: number
): { x: number; z: number; tx: number; tz: number } {
  const omt = 1 - u;
  const x = omt * omt * p0x + 2 * omt * u * p1x + u * u * p2x;
  const z = omt * omt * p0z + 2 * omt * u * p1z + u * u * p2z;
  const tx = 2 * omt * (p1x - p0x) + 2 * u * (p2x - p1x);
  const tz = 2 * omt * (p1z - p0z) + 2 * u * (p2z - p1z);
  return { x, z, tx, tz };
}

function computeBezierArcLength(
  p0x: number,
  p0z: number,
  p1x: number,
  p1z: number,
  p2x: number,
  p2z: number
): number {
  const steps = 10;
  let total = 0;
  let prevX = p0x;
  let prevZ = p0z;
  for (let s = 1; s <= steps; s++) {
    const pt = sampleBezier(p0x, p0z, p1x, p1z, p2x, p2z, s / steps);
    total += Math.hypot(pt.x - prevX, pt.z - prevZ);
    prevX = pt.x;
    prevZ = pt.z;
  }
  return Math.max(1.0, total);
}

/**
 * Pooled traffic manager (§7.1):
 * - 34..60 active cars around the player (scales with tier, Rush Hour, and traffic.density)
 * - Smooth quadratic Bezier turns through intersections (left, right, straight, U-turns at dead ends)
 * - Red-light stopping without despawning; stuck despawn only when truly gridlocked & out of close view
 * - Knocked dynamic physics on collision or Shockwave
 * - Horn reaction (stronger with Loud Horn)
 * - Near-miss detection
 */
export class TrafficManager {
  public readonly group = new THREE.Group();
  public readonly cars: TrafficCar[] = [];
  public readonly cyclists: TrafficCar[] = [];
  private readonly allTraffic: TrafficCar[] = [];
  private readonly carById = new Map<number, TrafficCar>();
  private readonly candidateEdges: RoadEdge[];
  private readonly cyclistCandidateEdges: RoadEdge[];
  private spawnCooldown = 0;
  private cyclistSpawnCooldown = 0;

  constructor(
    private readonly map: MapDefinition,
    physics: PhysicsWorld,
    private readonly lights: TrafficLights
  ) {
    this.candidateEdges = map.graph.edges.filter((e) => !e.isShortcut && e.length >= 45);
    const nonHighwayEdges = this.candidateEdges.filter((e) => e.roadType !== 'highway');
    this.cyclistCandidateEdges = nonHighwayEdges.length > 0 ? nonHighwayEdges : this.candidateEdges;

    for (let i = 0; i < BALANCE.trafficMaxCount; i++) {
      const car = new TrafficCar(i + 1, pickTrafficKindForPoolIndex(i), physics);
      this.cars.push(car);
      this.allTraffic.push(car);
      this.carById.set(car.id, car);
      this.group.add(car.mesh);
    }

    for (let i = 0; i < CYCLIST_POOL_COUNT; i++) {
      const cyclist = new TrafficCar(BALANCE.trafficMaxCount + i + 1, 'cyclist', physics);
      this.cyclists.push(cyclist);
      this.allTraffic.push(cyclist);
      this.carById.set(cyclist.id, cyclist);
      this.group.add(cyclist.mesh);
    }
  }

  reset(): void {
    for (const c of this.allTraffic) {
      c.despawn();
    }
    this.spawnCooldown = 0;
    this.cyclistSpawnCooldown = 0;
  }

  getCarById(id: number): TrafficCar | undefined {
    return this.carById.get(id);
  }

  /**
   * Pre-impact pass run before physics.step(): switches any kinematic traffic car that is
   * about to touch the player into a dynamic rigid body so Rapier never treats it as an
   * infinite-mass battering ram that catapults the player away.
   */
  preparePlayerCollisions(player: ArcadeVehicle): void {
    if (player.isGhost) return;
    const px = player.currPosition.x;
    const py = player.currPosition.y;
    const pz = player.currPosition.z;
    const pSpeed = player.speed;
    const lookahead = Math.min(2.2, pSpeed * 0.045);

    for (let i = 0; i < this.allTraffic.length; i++) {
      const c = this.allTraffic[i];
      if (!c.active || c.knocked) continue;
      if (Math.abs(c.y - py) > 2.6) continue;
      const dx = c.x - px;
      const dz = c.z - pz;
      const distSq = dx * dx + dz * dz;

      if (c.isCyclist) {
        // Keep cyclists upright during clean near-misses; wake dynamic when impact is imminent
        if (distSq <= 2.3 * 2.3) {
          c.wakeDynamicForCollision();
          continue;
        }
        const vx = player.velocity.x - c.dirX * c.speed;
        const vz = player.velocity.z - c.dirZ * c.speed;
        const vSq = vx * vx + vz * vz;
        if (vSq > 0.25) {
          const tClosest = Math.max(0, Math.min(0.15, (dx * vx + dz * vz) / vSq));
          const cx = dx - vx * tClosest;
          const cz = dz - vz * tClosest;
          if (cx * cx + cz * cz <= 1.85 * 1.85) {
            c.wakeDynamicForCollision();
          }
        }
        continue;
      }

      const reach = (c.spec.l + 4.4) * 0.5 + 0.9 + lookahead;
      if (distSq <= reach * reach) {
        c.wakeDynamicForCollision();
      }
    }
  }

  knockCarById(id: number, playerVel: THREE.Vector3, bulldozer: boolean): void {
    const car = this.carById.get(id);
    if (!car || !car.active) return;
    const mult = bulldozer ? 1.85 : 1.15;
    const speed = Math.max(12, playerVel.length());
    const dir = playerVel.lengthSq() > 1 ? playerVel.clone().normalize() : new THREE.Vector3(0, 0, -1);
    car.knock(dir.x * speed * mult, 4.5 + speed * 0.16, dir.z * speed * mult);
  }

  /** Shockwave (#24): blast all traffic within radius away. Returns count of blasted cars. */
  pushTrafficAround(x: number, z: number, radius: number, force: number): number {
    let count = 0;
    const r2 = radius * radius;
    for (const c of this.allTraffic) {
      if (!c.active) continue;
      const dx = c.x - x;
      const dz = c.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const falloff = 1 - (d / radius) * 0.45;
        c.knock(nx * force * falloff, 8 + 6 * falloff, nz * force * falloff);
        count++;
      }
    }
    return count;
  }

  /** Horn reaction (§7.1 + Loud Horn #10): cars & cyclists ahead swerve aside. */
  reactToHorn(px: number, pz: number, fwdX: number, fwdZ: number, loud: boolean): void {
    const range = loud ? 58 : 30;
    const carSwerveMag = loud ? 4.4 : 2.1;
    const cyclistSwerveMag = loud ? 1.05 : 0.6;
    for (const c of this.allTraffic) {
      if (!c.active || c.knocked) continue;
      const dx = c.x - px;
      const dz = c.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > range || dist < 1) continue;
      const dot = (dx * fwdX + dz * fwdZ) / dist;
      if (dot > 0.35) {
        c.swerveOffset = c.isCyclist ? cyclistSwerveMag : carSwerveMag;
        c.swerveTimer = loud ? 3.5 : 2.0;
      }
    }
  }

  update(
    dt: number,
    player: ArcadeVehicle,
    targetCount: number,
    rng: Rng,
    detectNearMisses: boolean
  ): NearMissHit[] {
    const nearMisses: NearMissHit[] = [];
    const px = player.currPosition.x;
    const pz = player.currPosition.z;
    const clampedTarget = Math.max(10, Math.min(BALANCE.trafficMaxCount, Math.round(targetCount)));

    let activeCount = 0;
    for (const c of this.cars) {
      if (c.active) activeCount++;
    }

    // Spawn motor vehicles up to targetCount
    this.spawnCooldown -= dt;
    if (activeCount < clampedTarget && this.spawnCooldown <= 0) {
      const toSpawn = Math.min(3, clampedTarget - activeCount);
      for (let s = 0; s < toSpawn; s++) {
        this.trySpawnCar(px, pz, rng);
      }
      this.spawnCooldown = 0.25;
    }

    // Spawn cyclists independently so they never crowd out regular traffic cars
    let activeCyclistCount = 0;
    for (const c of this.cyclists) {
      if (c.active) activeCyclistCount++;
    }
    const targetCyclists = Math.max(
      4,
      Math.min(
        this.cyclists.length,
        Math.round((clampedTarget / BALANCE.trafficMaxCount) * this.cyclists.length)
      )
    );
    this.cyclistSpawnCooldown -= dt;
    if (activeCyclistCount < targetCyclists && this.cyclistSpawnCooldown <= 0) {
      const toSpawn = Math.min(2, targetCyclists - activeCyclistCount);
      for (let s = 0; s < toSpawn; s++) {
        this.trySpawnCyclist(px, pz, rng);
      }
      this.cyclistSpawnCooldown = 0.35;
    }

    const despawnSq = BALANCE.trafficDespawnDist * BALANCE.trafficDespawnDist;

    for (let i = 0; i < this.allTraffic.length; i++) {
      const c = this.allTraffic[i];
      if (!c.active) continue;

      if (c.nearMissCooldown > 0) c.nearMissCooldown -= dt;

      if (c.knocked) {
        c.knockedTimer += dt;
        const t = c.body.translation();
        const r = c.body.rotation();
        c.x = t.x;
        c.y = t.y;
        c.z = t.z;
        c.mesh.position.set(t.x, t.y, t.z);
        c.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        const distSq = (t.x - px) ** 2 + (t.z - pz) ** 2;
        if (c.knockedTimer >= BALANCE.trafficKnockedDespawnTime || distSq > despawnSq || t.y < -20) {
          c.despawn();
        }
        continue;
      }

      // Despawn when far out of range
      const distPlayerSq = (c.x - px) ** 2 + (c.z - pz) ** 2;
      if (distPlayerSq > despawnSq) {
        c.despawn();
        continue;
      }

      // Horn swerve decay
      if (c.swerveTimer > 0) {
        c.swerveTimer -= dt;
        if (c.swerveTimer <= 0) c.swerveOffset = 0;
      }

      // Compute current heading basis for braking/yielding checks
      let dirX = c.dirX;
      let dirZ = c.dirZ;
      let desiredSpeed = c.isCyclist ? c.cruiseSpeed : 12;
      let waitingAtRedLight = false;

      if (c.turn) {
        if (c.isCyclist) {
          desiredSpeed = c.turn.isSharpTurn
            ? Math.min(c.cruiseSpeed * 0.75, 4.8)
            : Math.min(c.cruiseSpeed, c.turn.nextEdge.speedLimit * 0.6);
        } else {
          desiredSpeed = c.turn.isSharpTurn
            ? Math.min(c.turn.nextEdge.speedLimit * 0.7, 9.0)
            : c.turn.nextEdge.speedLimit * 0.85;
        }
      } else {
        const edge = c.edge;
        if (!edge || edge.blocked) {
          // Only despawn blocked-road traffic if out of immediate sight, else U-turn cleanly
          if (distPlayerSq > 50 * 50 || !edge) {
            c.despawn();
            continue;
          }
          c.forward = !c.forward;
          c.progress = Math.max(1, edge.length - c.progress);
        }

        const curEdge = c.edge!;
        const fromN = this.map.graph.getNode(c.forward ? curEdge.from : curEdge.to)!;
        const toN = this.map.graph.getNode(c.forward ? curEdge.to : curEdge.from)!;
        const dx = toN.x - fromN.x;
        const dz = toN.z - fromN.z;
        const len = Math.max(0.01, Math.hypot(dx, dz));
        dirX = dx / len;
        dirZ = dz / len;

        desiredSpeed = c.isCyclist
          ? Math.min(c.cruiseSpeed, curEdge.speedLimit * 0.6)
          : curEdge.speedLimit * 0.85;
        const turnMargin = getTurnMargin(len, curEdge.isRoundabout);
        const distToStopLine = len - turnMargin - c.progress;

        // Yield to circulating traffic when entering a roundabout
        if (!curEdge.isRoundabout && distToStopLine > -1.0 && distToStopLine < 11.0) {
          const toAdj = this.map.graph.adjacency.get(toN.id) ?? [];
          const rbEdge = toAdj.find((a) => a.edge.isRoundabout);
          if (rbEdge?.edge.roundaboutId) {
            const rbId = rbEdge.edge.roundaboutId;
            let mustYield = false;
            for (let j = 0; j < this.allTraffic.length; j++) {
              if (i === j) continue;
              const o = this.allTraffic[j];
              if (!o.active || o.knocked) continue;
              const inSameRb =
                o.edge?.roundaboutId === rbId || o.turn?.nextEdge.roundaboutId === rbId;
              if (!inSameRb) continue;
              const toNodeX = toN.x - o.x;
              const toNodeZ = toN.z - o.z;
              const distToEntry = Math.hypot(toNodeX, toNodeZ);
              if (distToEntry < 18.0 && toNodeX * o.dirX + toNodeZ * o.dirZ > 0) {
                mustYield = true;
                break;
              }
            }
            if (mustYield) {
              desiredSpeed = Math.min(desiredSpeed, Math.max(0, (distToStopLine - 1.2) * 1.1));
              if (distToStopLine <= 2.4) {
                desiredSpeed = 0;
              }
            }
          }
        }

        // Stop neatly BEFORE the intersection stop line on a red light (never inside a roundabout)
        if (
          !curEdge.isRoundabout &&
          toN.hasTrafficLight &&
          distToStopLine > -1.0 &&
          distToStopLine < 14.0 &&
          this.lights.isRedForDirection(toN.id, dirX, dirZ)
        ) {
          desiredSpeed = Math.min(desiredSpeed, Math.max(0, (distToStopLine - 1.5) * 1.1));
          if (distToStopLine <= 3.0) {
            desiredSpeed = 0;
            waitingAtRedLight = true;
          }
        }
      }

      const rightX = -dirZ;
      const rightZ = dirX;

      // Brake for another traffic vehicle directly ahead along current heading
      const lookAheadDist = c.isCyclist ? 10 : 16;
      for (let j = 0; j < this.allTraffic.length; j++) {
        if (i === j) continue;
        const o = this.allTraffic[j];
        if (!o.active || o.knocked) continue;
        const ox = o.x - c.x;
        const oz = o.z - c.z;
        const ahead = ox * dirX + oz * dirZ;
        if (ahead > 1.2 && ahead < lookAheadDist) {
          const lat = Math.abs(ox * rightX + oz * rightZ);
          const latLimit =
            c.isCyclist || o.isCyclist ? (c.spec.w + o.spec.w) * 0.5 + 0.35 : 2.25;
          if (lat < latLimit) {
            // Check if the other vehicle is moving in roughly the same or crossing direction
            const headDot = o.dirX * dirX + o.dirZ * dirZ;
            if (headDot > -0.4) {
              const safeGap = (c.spec.l + o.spec.l) * 0.5 + (c.isCyclist ? 1.8 : 2.4);
              desiredSpeed = Math.min(desiredSpeed, Math.max(0, (ahead - safeGap) * 1.5));
            }
          }
        }
      }

      // Brake gently if player is directly in front
      const pdx = px - c.x;
      const pdz = pz - c.z;
      const pAhead = pdx * dirX + pdz * dirZ;
      if (pAhead > 1.5 && pAhead < 14) {
        const pLat = Math.abs(pdx * rightX + pdz * rightZ);
        if (pLat < (c.isCyclist ? 1.7 : 2.3)) {
          desiredSpeed = Math.min(desiredSpeed, 0);
        }
      }

      // Smooth accel / braking
      const accelRate = c.isCyclist ? 4.2 : 6.8;
      const brakeRate = c.isCyclist ? 11.0 : 15.0;
      const rate = desiredSpeed > c.speed ? accelRate : brakeRate;
      c.speed += Math.sign(desiredSpeed - c.speed) * Math.min(Math.abs(desiredSpeed - c.speed), rate * dt);

      // Stuck timeout: NEVER despawn while waiting at a red light, and only despawn gridlocked cars far from player!
      if (c.speed < 0.6 && !waitingAtRedLight) {
        c.stuckTimer += dt;
        if (c.stuckTimer >= BALANCE.trafficStuckTimeout + 10 && distPlayerSq > 65 * 65) {
          c.despawn();
          continue;
        }
      } else {
        c.stuckTimer = 0;
      }

      let nx = c.x;
      let ny = c.y;
      let nz = c.z;
      let nyaw = c.yaw;
      let moveDirX = dirX;
      let moveDirZ = dirZ;

      if (c.turn) {
        // Follow smooth quadratic Bezier curve through the intersection!
        const turn = c.turn;
        turn.distTraveled += c.speed * dt;
        const u = Math.min(1, turn.distTraveled / turn.arcLength);
        const pt = sampleBezier(turn.p0x, turn.p0z, turn.p1x, turn.p1z, turn.p2x, turn.p2z, u);
        const tLen = Math.hypot(pt.tx, pt.tz);
        if (tLen > 0.001) {
          moveDirX = pt.tx / tLen;
          moveDirZ = pt.tz / tLen;
        }
        nx = pt.x;
        nz = pt.z;
        ny = this.map.heightMap.sample(nx, nz) + c.spec.h * 0.5 + 0.04;
        nyaw = Math.atan2(-moveDirX, -moveDirZ);

        if (u >= 1) {
          // Seamlessly hand off onto the outgoing road edge with zero jump!
          c.edge = turn.nextEdge;
          c.forward = turn.nextForward;
          c.laneOffset = turn.nextLaneOffset;
          c.progress = turn.nextStartProgress;
          c.turn = null;
        }
      } else {
        const edge = c.edge!;
        const fromN = this.map.graph.getNode(c.forward ? edge.from : edge.to)!;
        const toN = this.map.graph.getNode(c.forward ? edge.to : edge.from)!;
        const dx = toN.x - fromN.x;
        const dz = toN.z - fromN.z;
        const len = Math.max(0.01, Math.hypot(dx, dz));
        const turnMargin = getTurnMargin(len, edge.isRoundabout);

        c.progress += c.speed * dt;

        // Reached intersection entry -> start smooth Bezier turn/crossing curve!
        if (c.progress >= len - turnMargin) {
          const turnCurve = this.createIntersectionTurn(c, edge, fromN, toN, len, turnMargin, rng);
          c.turn = turnCurve;
          const pt = sampleBezier(
            turnCurve.p0x,
            turnCurve.p0z,
            turnCurve.p1x,
            turnCurve.p1z,
            turnCurve.p2x,
            turnCurve.p2z,
            0
          );
          nx = pt.x;
          nz = pt.z;
          ny = this.map.heightMap.sample(nx, nz) + c.spec.h * 0.5 + 0.04;
          const tLen = Math.hypot(pt.tx, pt.tz);
          if (tLen > 0.001) {
            moveDirX = pt.tx / tLen;
            moveDirZ = pt.tz / tLen;
          } else {
            moveDirX = dx / len;
            moveDirZ = dz / len;
          }
          nyaw = Math.atan2(-moveDirX, -moveDirZ);
        } else {
          const tFrac = Math.max(0, Math.min(1, c.progress / len));
          if (edge.isRoundabout && edge.roundaboutCenter) {
            const cx = edge.roundaboutCenter.x;
            const cz = edge.roundaboutCenter.z;
            const a0 = Math.atan2(fromN.z - cz, fromN.x - cx);
            const r0 = Math.hypot(fromN.x - cx, fromN.z - cz);
            const a1 = Math.atan2(toN.z - cz, toN.x - cx);
            const r1 = Math.hypot(toN.x - cx, toN.z - cz);
            let da = a1 - a0;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            const ang = a0 + da * tFrac;
            const rad = r0 + (r1 - r0) * tFrac + c.laneOffset + c.swerveOffset;
            nx = cx + Math.cos(ang) * rad;
            nz = cz + Math.sin(ang) * rad;
            const sign = da >= 0 ? 1 : -1;
            const tx = -Math.sin(ang) * sign;
            const tz = Math.cos(ang) * sign;
            const tLen = Math.max(0.001, Math.hypot(tx, tz));
            moveDirX = tx / tLen;
            moveDirZ = tz / tLen;
            ny = this.map.heightMap.sample(nx, nz) + c.spec.h * 0.5 + 0.04;
            nyaw = Math.atan2(-moveDirX, -moveDirZ);
          } else {
            moveDirX = dx / len;
            moveDirZ = dz / len;
            const rx = -moveDirZ;
            const rz = moveDirX;
            const lat = c.laneOffset + c.swerveOffset;
            nx = fromN.x + dx * tFrac + rx * lat;
            nz = fromN.z + dz * tFrac + rz * lat;
            ny = this.map.heightMap.sample(nx, nz) + c.spec.h * 0.5 + 0.04;
            nyaw = Math.atan2(-moveDirX, -moveDirZ);
          }
        }
      }

      const slopePitch = this.map.heightMap.sampleSlope(nx, nz, moveDirX, moveDirZ);
      c.setKinematicPose(nx, ny, nz, nyaw, slopePitch);
      c.updateAnimation(dt);

      // Near miss check (§9.4)
      if (detectNearMisses && c.nearMissCooldown <= 0 && !player.isGhost) {
        const halfSumX = (c.spec.w + 1.9) * 0.5;
        const halfSumZ = (c.spec.l + 4.4) * 0.5;
        const dist = Math.hypot(px - nx, pz - nz);
        const clearance = dist - Math.min(halfSumX, halfSumZ);
        if (clearance > 0.1 && clearance <= BALANCE.styleNearMissRadius + 1.4) {
          const tvx = moveDirX * c.speed;
          const tvz = moveDirZ * c.speed;
          const relSpeed = Math.hypot(player.velocity.x - tvx, player.velocity.z - tvz);
          if (relSpeed >= BALANCE.styleNearMissRelSpeed) {
            c.nearMissCooldown = 3.0;
            nearMisses.push({ relSpeed, distance: clearance });
          }
        }
      }
    }

    return nearMisses;
  }

  /**
   * Builds a smooth C1-continuous quadratic Bezier curve from the incoming stop line
   * to the outgoing road lane (supports straight crossings, right/left turns, and dead-end U-turns).
   */
  private createIntersectionTurn(
    c: TrafficCar,
    edge: RoadEdge,
    fromN: { x: number; y: number; z: number; id: string },
    toN: { x: number; y: number; z: number; id: string },
    edgeLen: number,
    inMargin: number,
    rng: Rng
  ): TrafficTurnCurve {
    const d0x = (toN.x - fromN.x) / edgeLen;
    const d0z = (toN.z - fromN.z) / edgeLen;
    const r0x = -d0z;
    const r0z = d0x;

    // Entry point right at the stop line on the incoming lane
    const lat0 = c.laneOffset + c.swerveOffset * 0.35;
    const p0x = toN.x - d0x * inMargin + r0x * lat0;
    const p0z = toN.z - d0z * inMargin + r0z * lat0;
    const y0 = fromN.y + (toN.y - fromN.y) * ((edgeLen - inMargin) / edgeLen);

    const adj = this.map.graph.adjacency.get(toN.id) ?? [];
    const options = adj.filter(
      (a) => a.edge.id !== edge.id && !a.edge.isShortcut && !a.edge.blocked
    );

    let nextEdge: RoadEdge;
    let nextForward: boolean;

    if (options.length === 0) {
      // Dead end (e.g. riverbank): perform a smooth U-turn back onto the opposite lane instead of disappearing!
      nextEdge = edge;
      nextForward = !c.forward;
      c.roundaboutEntryEdgeId = null;
      c.roundaboutSteps = 0;
    } else if (edge.isRoundabout) {
      const filtered =
        c.roundaboutEntryEdgeId && options.length > 1
          ? options.filter((o) => o.edge.id !== c.roundaboutEntryEdgeId)
          : options;
      const ringOpts = filtered.filter((o) => o.edge.isRoundabout);
      const exitOpts = filtered.filter((o) => !o.edge.isRoundabout);

      let pick: { to: string; edge: RoadEdge };
      if (
        exitOpts.length > 0 &&
        (c.roundaboutSteps >= 4 || ringOpts.length === 0 || (c.roundaboutSteps >= 1 && rng.chance(0.45)))
      ) {
        pick = rng.pick(exitOpts);
        c.roundaboutEntryEdgeId = null;
        c.roundaboutSteps = 0;
      } else if (ringOpts.length > 0) {
        pick = ringOpts[0];
        c.roundaboutSteps++;
      } else {
        pick = rng.pick(filtered);
        c.roundaboutEntryEdgeId = null;
        c.roundaboutSteps = 0;
      }
      nextEdge = pick.edge;
      nextForward = pick.edge.from === toN.id;
    } else {
      // Weight choices nicely: ~50% straight when available, ~50% left/right turns
      // Cyclists prefer non-highway streets when available
      const candidateOptions = c.isCyclist
        ? (() => {
            const nonHighway = options.filter((o) => o.edge.roadType !== 'highway');
            return nonHighway.length > 0 ? nonHighway : options;
          })()
        : options;
      const weights = candidateOptions.map((opt) => {
        const destN = this.map.graph.getNode(opt.to)!;
        const ndx = destN.x - toN.x;
        const ndz = destN.z - toN.z;
        const nlen = Math.max(0.01, Math.hypot(ndx, ndz));
        const dot = (ndx / nlen) * d0x + (ndz / nlen) * d0z;
        return dot > 0.7 ? 1.8 : 1.0;
      });
      const pick = rng.weightedPick(candidateOptions, weights);
      nextEdge = pick.edge;
      nextForward = pick.edge.from === toN.id;
      if (nextEdge.isRoundabout) {
        c.roundaboutEntryEdgeId = edge.id;
        c.roundaboutSteps = 0;
      }
    }

    const outFrom = this.map.graph.getNode(nextForward ? nextEdge.from : nextEdge.to)!;
    const outTo = this.map.graph.getNode(nextForward ? nextEdge.to : nextEdge.from)!;
    const odx = outTo.x - outFrom.x;
    const odz = outTo.z - outFrom.z;
    const olen = Math.max(0.01, Math.hypot(odx, odz));
    const d2x = odx / olen;
    const d2z = odz / olen;
    const r2x = -d2z;
    const r2z = d2x;

    const maxLane = Math.max(1, nextEdge.lanesPerDir);
    const laneW = (nextEdge.width * 0.5) / maxLane;
    // Cyclists stay near the right edge of the lane; cars keep same lane index
    let nextLaneOffset: number;
    if (c.isCyclist) {
      nextLaneOffset = computeCyclistLaneOffset(nextEdge);
    } else if (nextEdge.isOneWay && maxLane === 1) {
      nextLaneOffset = 0;
    } else if (nextEdge.isOneWay && maxLane > 1) {
      const idx = Math.min(maxLane - 1, Math.floor(Math.abs(c.laneOffset) / Math.max(1.5, laneW)));
      nextLaneOffset = (idx - (maxLane - 1) * 0.5) * laneW;
    } else {
      const desiredLaneIdx = Math.min(maxLane - 1, Math.floor(c.laneOffset / Math.max(1.5, laneW)));
      nextLaneOffset = (desiredLaneIdx + 0.5) * laneW;
    }
    const outMargin = getTurnMargin(olen, nextEdge.isRoundabout);

    const p2x = outFrom.x + d2x * outMargin + r2x * nextLaneOffset;
    const p2z = outFrom.z + d2z * outMargin + r2z * nextLaneOffset;
    const y2 = outFrom.y + (outTo.y - outFrom.y) * (outMargin / olen);

    const dot = d0x * d2x + d0z * d2z;
    let p1x: number;
    let p1z: number;
    let isSharpTurn = false;

    if (dot > 0.85) {
      // Straight crossing
      p1x = (p0x + p2x) * 0.5;
      p1z = (p0z + p2z) * 0.5;
    } else if (dot < -0.75) {
      // Smooth U-turn arc around the dead-end node
      p1x = (p0x + p2x) * 0.5 + d0x * 7.5;
      p1z = (p0z + p2z) * 0.5 + d0z * 7.5;
      isSharpTurn = true;
    } else {
      // Exact ray intersection of incoming & outgoing lane lines for natural right/left turn arcs!
      isSharpTurn = true;
      const det = d0z * d2x - d0x * d2z;
      if (Math.abs(det) > 0.08) {
        const sRaw = ((p2x - p0x) * -d2z - (p2z - p0z) * -d2x) / det;
        const s = Math.max(2.5, Math.min(inMargin * 1.55, sRaw));
        p1x = p0x + d0x * s;
        p1z = p0z + d0z * s;
      } else {
        p1x = toN.x;
        p1z = toN.z;
      }
    }

    const arcLength = computeBezierArcLength(p0x, p0z, p1x, p1z, p2x, p2z);
    return {
      p0x,
      p0z,
      p1x,
      p1z,
      p2x,
      p2z,
      y0,
      y2,
      arcLength,
      distTraveled: 0,
      isSharpTurn,
      nextEdge,
      nextForward,
      nextLaneOffset,
      nextStartProgress: outMargin,
    };
  }

  private trySpawnCar(px: number, pz: number, rng: Rng): void {
    const inactive = this.cars.filter((c) => !c.active);
    if (inactive.length === 0) return;
    const slot = rng.pick(inactive);

    for (let attempt = 0; attempt < 16; attempt++) {
      const edge = rng.pick(this.candidateEdges);
      if (edge.blocked) continue;
      const a = this.map.graph.getNode(edge.from)!;
      const b = this.map.graph.getNode(edge.to)!;
      const mx = (a.x + b.x) * 0.5;
      const mz = (a.z + b.z) * 0.5;
      const d = Math.hypot(mx - px, mz - pz);
      if (d < BALANCE.trafficSpawnMin || d > BALANCE.trafficSpawnMax) continue;

      const forward = edge.isOneWay ? true : rng.chance(0.5);
      const fromN = forward ? a : b;
      const toN = forward ? b : a;
      const dx = toN.x - fromN.x;
      const dz = toN.z - fromN.z;
      const len = Math.max(1, Math.hypot(dx, dz));
      const margin = getTurnMargin(len, edge.isRoundabout);
      const tMin = Math.min(0.4, (margin + 4) / len);
      const tMax = Math.max(tMin + 0.05, 1 - (margin + 6) / len);
      const t = rng.range(tMin, tMax);
      const maxLane = Math.max(1, edge.lanesPerDir);
      const laneOffset = computeCarLaneOffset(edge, rng.int(0, maxLane - 1));
      const dirX = dx / len;
      const dirZ = dz / len;
      const sx = fromN.x + dx * t - dirZ * laneOffset;
      const sz = fromN.z + dz * t + dirX * laneOffset;
      const sy = this.map.heightMap.sample(sx, sz) + slot.spec.h * 0.5 + 0.04;

      if (
        this.allTraffic.some(
          (o) => o.active && Math.hypot(o.x - sx, o.z - sz) < (o.isCyclist ? 8 : 13)
        )
      ) {
        continue;
      }

      slot.spawnOnEdge(edge, forward, t * len, laneOffset, sx, sy, sz, Math.atan2(-dirX, -dirZ));
      return;
    }
  }

  private trySpawnCyclist(px: number, pz: number, rng: Rng): void {
    const inactive = this.cyclists.filter((c) => !c.active);
    if (inactive.length === 0) return;
    const slot = rng.pick(inactive);

    for (let attempt = 0; attempt < 16; attempt++) {
      const edge = rng.pick(this.cyclistCandidateEdges);
      if (edge.blocked) continue;
      const a = this.map.graph.getNode(edge.from)!;
      const b = this.map.graph.getNode(edge.to)!;
      const mx = (a.x + b.x) * 0.5;
      const mz = (a.z + b.z) * 0.5;
      const d = Math.hypot(mx - px, mz - pz);
      if (d < BALANCE.trafficSpawnMin || d > BALANCE.trafficSpawnMax) continue;

      const forward = edge.isOneWay ? true : rng.chance(0.5);
      const fromN = forward ? a : b;
      const toN = forward ? b : a;
      const dx = toN.x - fromN.x;
      const dz = toN.z - fromN.z;
      const len = Math.max(1, Math.hypot(dx, dz));
      const margin = getTurnMargin(len, edge.isRoundabout);
      const tMin = Math.min(0.4, (margin + 4) / len);
      const tMax = Math.max(tMin + 0.05, 1 - (margin + 6) / len);
      const t = rng.range(tMin, tMax);
      const laneOffset = computeCyclistLaneOffset(edge);
      const dirX = dx / len;
      const dirZ = dz / len;
      const sx = fromN.x + dx * t - dirZ * laneOffset;
      const sz = fromN.z + dz * t + dirX * laneOffset;
      const sy = this.map.heightMap.sample(sx, sz) + slot.spec.h * 0.5 + 0.04;

      if (this.allTraffic.some((o) => o.active && Math.hypot(o.x - sx, o.z - sz) < 9)) {
        continue;
      }

      slot.spawnOnEdge(edge, forward, t * len, laneOffset, sx, sy, sz, Math.atan2(-dirX, -dirZ));
      return;
    }
  }
}
