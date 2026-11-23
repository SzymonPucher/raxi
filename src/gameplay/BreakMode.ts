import { BALANCE } from '../core/config/balance';

export interface BreakStartCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Pure Break Mode state (§8.5):
 * - Cannot start with a passenger on board, during Draft, or in last 5s of shift.
 * - Freezes shift timer while active.
 * - Ends with a 1s countdown ("Back to work").
 */
export class BreakMode {
  public active = false;
  public endingCountdown = 0;

  reset(): void {
    this.active = false;
    this.endingCountdown = 0;
  }

  canStart(params: {
    hasActivePassenger: boolean;
    inDraft: boolean;
    timeRemaining: number;
  }): BreakStartCheck {
    if (this.active) return { allowed: false, reason: 'Already on break' };
    if (params.hasActivePassenger) {
      return { allowed: false, reason: 'Drop off passenger first!' };
    }
    if (params.inDraft) {
      return { allowed: false, reason: 'Finish power draft first!' };
    }
    if (params.timeRemaining <= BALANCE.minTimeForBreak) {
      return { allowed: false, reason: 'Too little time left!' };
    }
    return { allowed: true };
  }

  start(): void {
    this.active = true;
    this.endingCountdown = 0;
  }

  beginExit(): void {
    if (!this.active) return;
    this.endingCountdown = BALANCE.breakExitCountdown;
  }

  /** Tick exit countdown. Returns true when break fully finishes and driving resumes. */
  tickExit(dt: number): boolean {
    if (this.endingCountdown <= 0) return false;
    this.endingCountdown = Math.max(0, this.endingCountdown - dt);
    if (this.endingCountdown <= 0) {
      this.active = false;
      return true;
    }
    return false;
  }
}
