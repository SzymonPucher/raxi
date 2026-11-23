import { BALANCE } from '../core/config/balance';
import { Rng } from '../core/Rng';
import { MapDefinition, SidewalkSpot } from '../world/mapData';
import {
  ALL_PASSENGER_TYPE_IDS,
  PASSENGER_TYPES,
  PassengerTypeDef,
  PassengerTypeId,
  TripLengthCategory,
  classifyTripLength,
} from './Passenger';

export interface WaitingPassenger {
  id: string;
  type: PassengerTypeDef;
  x: number;
  y: number;
  z: number;
  pickupAddress: string;
  destX: number;
  destY: number;
  destZ: number;
  destName: string;
  routeLength: number;
  tripCategory: TripLengthCategory;
  age: number;
  maxAge: number;
  stopHoldTimer: number;
  exploded: boolean;
}

/**
 * Pure waiting-passenger pool manager (§8.2):
 * Keeps 6-10 waiting passengers within ~300 m of the player, expires after 60 s.
 */
export class PassengerSpawner {
  public waiting: WaitingPassenger[] = [];
  private seq = 1;

  reset(): void {
    this.waiting = [];
    this.seq = 1;
  }

  clearAll(): void {
    this.waiting = [];
  }

  /**
   * Maintain 6..9 waiting passengers near player; expire old or too-far ones.
   */
  update(params: {
    dt: number;
    playerX: number;
    playerZ: number;
    tier: number;
    map: MapDefinition;
    rng: Rng;
    celebrityChauffeurOwned: boolean;
    allowShortcuts: boolean;
    paused: boolean;
  }): void {
    if (params.paused) return;

    // Age & cull expired/far passengers
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const p = this.waiting[i];
      p.age += params.dt;
      const dist = Math.hypot(p.x - params.playerX, p.z - params.playerZ);
      if (p.exploded || p.age >= p.maxAge || dist > BALANCE.passengerSpawnRadiusMax + 90) {
        this.waiting.splice(i, 1);
      }
    }

    // Spawn up to maxWaitingPassengers
    let safetyIter = 0;
    while (this.waiting.length < BALANCE.maxWaitingPassengers && safetyIter < 24) {
      safetyIter++;
      const spawned = this.spawnOne(
        params.playerX,
        params.playerZ,
        params.tier,
        params.map,
        params.rng,
        params.celebrityChauffeurOwned,
        params.allowShortcuts
      );
      if (!spawned) break;
    }
  }

  /** Debug cheat: spawn a specific passenger type right ahead of the player. */
  spawnForcedType(
    typeId: PassengerTypeId,
    playerX: number,
    playerZ: number,
    tier: number,
    map: MapDefinition,
    rng: Rng,
    allowShortcuts: boolean
  ): WaitingPassenger | null {
    const spots = map.sidewalkSpots
      .map((s) => ({ s, d: Math.hypot(s.x - playerX, s.z - playerZ) }))
      .filter((o) => o.d >= 18 && o.d <= 140)
      .sort((a, b) => a.d - b.d);

    const pickup = spots[0]?.s ?? map.sidewalkSpots[0];
    return this.createWaitingAt(pickup, PASSENGER_TYPES[typeId], tier, map, rng, allowShortcuts);
  }

  private spawnOne(
    playerX: number,
    playerZ: number,
    tier: number,
    map: MapDefinition,
    rng: Rng,
    celebrityChauffeurOwned: boolean,
    allowShortcuts: boolean
  ): WaitingPassenger | null {
    // Pick candidate sidewalk spots within 70..300m (relax if outskirts)
    let candidates = map.sidewalkSpots.filter((s) => {
      const d = Math.hypot(s.x - playerX, s.z - playerZ);
      return (
        d >= BALANCE.passengerSpawnRadiusMin &&
        d <= BALANCE.passengerSpawnRadiusMax &&
        !this.waiting.some((w) => Math.hypot(w.x - s.x, w.z - s.z) < 35)
      );
    });

    if (candidates.length === 0) {
      candidates = map.sidewalkSpots.filter((s) => {
        const d = Math.hypot(s.x - playerX, s.z - playerZ);
        return d >= 35 && d <= 480 && !this.waiting.some((w) => Math.hypot(w.x - s.x, w.z - s.z) < 30);
      });
    }
    if (candidates.length === 0) return null;

    const pickup = rng.pick(candidates);
    const type = this.rollPassengerType(tier, rng, celebrityChauffeurOwned);
    return this.createWaitingAt(pickup, type, tier, map, rng, allowShortcuts);
  }

  private createWaitingAt(
    pickup: SidewalkSpot,
    type: PassengerTypeDef,
    tier: number,
    map: MapDefinition,
    rng: Rng,
    allowShortcuts: boolean
  ): WaitingPassenger | null {
    // Choose trip length category (higher tiers favor more medium/long trips §9.6)
    const longWeight = 20 + Math.min(35, tier * 6);
    const medWeight = 45;
    const shortWeight = Math.max(15, 35 - tier * 4);
    const desiredCat = rng.weightedPick<TripLengthCategory>(
      ['short', 'medium', 'long'],
      [shortWeight, medWeight, longWeight]
    );

    const minDist = desiredCat === 'short' ? 180 : desiredCat === 'medium' ? 460 : 900;
    const maxDist = desiredCat === 'short' ? 480 : desiredCat === 'medium' ? 1150 : 2200;

    // Prefer landmarks ~55% of the time for memorable destinations
    const destCandidates = map.sidewalkSpots.filter((s) => {
      const d = Math.hypot(s.x - pickup.x, s.z - pickup.z);
      return d >= minDist && d <= maxDist;
    });
    const fallback = map.sidewalkSpots.filter((s) => Math.hypot(s.x - pickup.x, s.z - pickup.z) >= 180);
    const pool = destCandidates.length > 0 ? destCandidates : fallback;
    if (pool.length === 0) return null;

    const landmarksInPool = pool.filter((s) => Boolean(s.landmarkId));
    const dest =
      landmarksInPool.length > 0 && rng.chance(0.6) ? rng.pick(landmarksInPool) : rng.pick(pool);

    const route = map.graph.findRouteBetweenPoints(pickup.x, pickup.z, dest.x, dest.z, {
      allowShortcuts,
    });
    const routeLength = Math.max(160, Math.round(route.totalLength));
    const tripCategory = classifyTripLength(routeLength);

    const wp: WaitingPassenger = {
      id: `pax_${this.seq++}`,
      type,
      x: pickup.x,
      y: pickup.y,
      z: pickup.z,
      pickupAddress: pickup.address,
      destX: dest.x,
      destY: dest.y,
      destZ: dest.z,
      destName: dest.address,
      routeLength,
      tripCategory,
      age: 0,
      maxAge: BALANCE.passengerExpireSeconds,
      stopHoldTimer: 0,
      exploded: false,
    };
    this.waiting.push(wp);
    return wp;
  }

  private rollPassengerType(
    tier: number,
    rng: Rng,
    celebrityChauffeurOwned: boolean
  ): PassengerTypeDef {
    const ids = ALL_PASSENGER_TYPE_IDS.filter((id) => PASSENGER_TYPES[id].minTier <= tier);
    const weights = ids.map((id) => {
      let w = PASSENGER_TYPES[id].spawnWeight;
      if (id === 'celebrity' && celebrityChauffeurOwned) {
        w *= 5; // Celebrity Chauffeur (#28)
      }
      return w;
    });
    const chosen = rng.weightedPick(ids, weights);
    return PASSENGER_TYPES[chosen];
  }

  removeById(id: string): void {
    const idx = this.waiting.findIndex((w) => w.id === id);
    if (idx >= 0) this.waiting.splice(idx, 1);
  }
}
