import { BALANCE } from '../core/config/balance';
import { Rng } from '../core/Rng';
import { computeDecay, computeTier, computeVPar } from './Scoring';

export type DifficultyEventKind = 'rushHour' | 'rain' | 'roadWorks';

export interface ActiveDifficultyEvent {
  kind: DifficultyEventKind;
  remaining: number;
  duration: number;
  blockedEdgeIds: string[];
}

/**
 * Tier scaling & dynamic city events starting at tier 3 (§9.6).
 */
export class Difficulty {
  public tier = 0;
  public activeEvent: ActiveDifficultyEvent | null = null;
  private eventCooldown = BALANCE.eventCooldown;

  reset(): void {
    this.tier = 0;
    this.activeEvent = null;
    this.eventCooldown = BALANCE.eventCooldown;
  }

  updateTier(totalDeliveries: number): void {
    this.tier = computeTier(totalDeliveries);
  }

  get decay(): number {
    return computeDecay(this.tier);
  }

  get vPar(): number {
    return computeVPar(this.tier);
  }

  get trafficDensityMultiplier(): number {
    const base = 1 + this.tier * BALANCE.tierTrafficScale;
    const rush = this.activeEvent?.kind === 'rushHour' ? BALANCE.rushHourTrafficMult : 1.0;
    return base * rush;
  }

  get rainGripMultiplier(): number {
    return this.activeEvent?.kind === 'rain' ? BALANCE.rainGripMult : 1.0;
  }

  get rainStyleMultiplier(): number {
    return this.activeEvent?.kind === 'rain' ? BALANCE.rainStyleMult : 1.0;
  }

  /**
   * Tick event timer. Returns started/ended event notifications.
   */
  tick(
    dt: number,
    rng: Rng,
    candidateRoadWorksEdges: string[]
  ): {
    started?: ActiveDifficultyEvent;
    ended?: ActiveDifficultyEvent;
  } {
    if (this.activeEvent) {
      this.activeEvent.remaining -= dt;
      if (this.activeEvent.remaining <= 0) {
        const ended = this.activeEvent;
        this.activeEvent = null;
        this.eventCooldown = BALANCE.eventCooldown;
        return { ended };
      }
      return {};
    }

    if (this.tier < BALANCE.eventStartTier) return {};

    this.eventCooldown -= dt;
    if (this.eventCooldown <= 0) {
      const kinds: DifficultyEventKind[] = ['rushHour', 'rain', 'roadWorks'];
      const kind = rng.pick(kinds);
      const blockedEdgeIds =
        kind === 'roadWorks' && candidateRoadWorksEdges.length > 0
          ? rng.shuffle(candidateRoadWorksEdges).slice(0, Math.min(4, candidateRoadWorksEdges.length))
          : [];
      const started: ActiveDifficultyEvent = {
        kind,
        remaining: BALANCE.eventDuration,
        duration: BALANCE.eventDuration,
        blockedEdgeIds,
      };
      this.activeEvent = started;
      return { started };
    }

    return {};
  }
}
