import { Rng } from '../core/Rng';

/**
 * Tracks eligibility for the optional random special-audio fare:
 * - Cannot appear as the first fare of a shift.
 * - Cannot appear twice in a row.
 * - Otherwise has a 50% chance on pickup when enabled.
 */
export class SpecialFareTracker {
  public pickupsThisShift = 0;
  public lastWasSpecial = false;

  reset(): void {
    this.pickupsThisShift = 0;
    this.lastWasSpecial = false;
  }

  rollForPickup(enabled: boolean, rng: Rng | (() => number)): boolean {
    const isFirstFare = this.pickupsThisShift === 0;
    this.pickupsThisShift += 1;

    if (!enabled || isFirstFare || this.lastWasSpecial) {
      this.lastWasSpecial = false;
      return false;
    }

    const roll = typeof rng === 'function' ? rng() : rng.next();
    const chosen = roll < 0.5;
    this.lastWasSpecial = chosen;
    return chosen;
  }
}
