import { BALANCE } from '../core/config/balance';
import { BlinkerSide } from '../vehicle/ArcadeVehicle';
import { RoadProjection } from '../world/RoadGraph';

export type RuleViolationKind = 'redLight' | 'noBlinker' | 'oncoming' | 'speeding';

export interface RuleViolationEvent {
  kind: RuleViolationKind;
  penalty: number;
  label: string;
}

export interface RulesSample {
  dt: number;
  speed: number;
  projection: RoadProjection | null;
  blinker: BlinkerSide;
  blinkerOnTime: number;
  /** Whether the upcoming intersection traffic light is RED for the player's axis */
  upcomingLightRed: boolean;
  ruleStrictness: number;
}

export interface RulesChecklist {
  redLights: number;
  blinkers: number;
  speeding: number;
  oncoming: number;
}

/**
 * Pure traffic-rule tracker (§9.5, §8.2a):
 * - Running a red light (tracked for checklist/warnings; does not reduce safety score)
 * - Auto-cancels blinker after lane change or turn; awards +5 style for turning with blinker
 * - Lack of blinker, wrong lane, and speeding are not tracked.
 */
export class RulesTracker {
  public fareViolations = 0;
  public totalViolations = 0;
  public checklist: RulesChecklist = { redLights: 0, blinkers: 0, speeding: 0, oncoming: 0 };

  private lastEdgeId: string | null = null;
  private lastEdgeDirX = 0;
  private lastEdgeDirZ = 1;
  private lastLaneIndex: number | null = null;
  private prevDistToAheadNode = Infinity;
  private prevAheadNodeId: string | null = null;
  private wasOutsideJunctionOnRed = false;
  private lastRedLightNodeId: string | null = null;
  private redLightCooldown = 0;

  resetShift(): void {
    this.totalViolations = 0;
    this.resetFare();
  }

  resetFare(): void {
    this.fareViolations = 0;
    this.checklist = { redLights: 0, blinkers: 0, speeding: 0, oncoming: 0 };
    this.lastEdgeId = null;
    this.lastLaneIndex = null;
    this.prevDistToAheadNode = Infinity;
    this.prevAheadNodeId = null;
    this.wasOutsideJunctionOnRed = false;
    this.lastRedLightNodeId = null;
    this.redLightCooldown = 0;
  }

  update(sample: RulesSample): {
    violations: RuleViolationEvent[];
    shouldCancelBlinker: boolean;
    blinkerTurnStyleBonus: boolean;
  } {
    const violations: RuleViolationEvent[] = [];
    let shouldCancelBlinker = false;
    let blinkerTurnStyleBonus = false;

    this.redLightCooldown = Math.max(0, this.redLightCooldown - sample.dt);

    const proj = sample.projection;
    if (!proj || proj.distFromCenter > proj.halfWidth + 4) {
      this.lastEdgeId = null;
      this.lastLaneIndex = null;
      return { violations, shouldCancelBlinker, blinkerTurnStyleBonus };
    }

    const strict = Math.max(0, sample.ruleStrictness);
    const inIntersectionZone = proj.distToNearestNode < 16.0;
    const alignedWithRoad = Math.abs(proj.headingDot) >= 0.72;

    // 1. Detect intersection transitions (auto-cancel blinker & award style bonus if signaled)
    if (this.lastEdgeId !== null && this.lastEdgeId !== proj.edge.id) {
      const axisDot = Math.abs(this.lastEdgeDirX * proj.dirX + this.lastEdgeDirZ * proj.dirZ);
      const actuallyTurned = axisDot < 0.85;
      if (actuallyTurned && sample.blinker !== 'off') {
        shouldCancelBlinker = true;
        blinkerTurnStyleBonus = true;
      }
      this.lastLaneIndex = proj.laneIndex;
    } else if (
      !inIntersectionZone &&
      alignedWithRoad &&
      this.lastEdgeId === proj.edge.id &&
      this.lastLaneIndex !== null &&
      this.lastLaneIndex !== proj.laneIndex &&
      sample.speed > 4
    ) {
      // Auto-cancel blinker after signaled lane change; unsignaled lane changes are not penalized
      const travelSign = proj.headingDot >= 0 ? 1 : -1;
      const movedRightFromDriverView = (proj.laneIndex - this.lastLaneIndex) * travelSign > 0;
      const expectedBlinker: BlinkerSide = movedRightFromDriverView ? 'right' : 'left';
      if (sample.blinker === expectedBlinker && sample.blinkerOnTime >= BALANCE.ruleBlinkerLeadTime) {
        shouldCancelBlinker = true;
      }
    }

    this.lastEdgeId = proj.edge.id;
    this.lastEdgeDirX = proj.dirX;
    this.lastEdgeDirZ = proj.dirZ;
    this.lastLaneIndex = proj.laneIndex;

    // 2. Running a red light (only tracked for warning/checklist; penalty is 0 so only collisions reduce score)
    const stopLineDist = 11.5;
    if (proj.aheadNode.hasTrafficLight && sample.speed > 2.5) {
      if (this.prevAheadNodeId !== proj.aheadNode.id) {
        this.wasOutsideJunctionOnRed = proj.distToAheadNode > stopLineDist && sample.upcomingLightRed;
        this.prevAheadNodeId = proj.aheadNode.id;
      } else {
        if (proj.distToAheadNode > stopLineDist) {
          this.wasOutsideJunctionOnRed = sample.upcomingLightRed;
        } else if (
          this.prevDistToAheadNode > stopLineDist &&
          proj.distToAheadNode <= stopLineDist &&
          sample.upcomingLightRed &&
          this.wasOutsideJunctionOnRed &&
          this.redLightCooldown <= 0 &&
          this.lastRedLightNodeId !== proj.aheadNode.id
        ) {
          if (strict > 0) {
            this.recordViolation('redLight', 0, 'RAN RED LIGHT!', violations);
            this.checklist.redLights++;
          }
          this.lastRedLightNodeId = proj.aheadNode.id;
          this.redLightCooldown = 3.0;
        }
      }
      this.prevDistToAheadNode = proj.distToAheadNode;
    } else {
      this.prevDistToAheadNode = Infinity;
    }

    return { violations, shouldCancelBlinker, blinkerTurnStyleBonus };
  }

  private recordViolation(
    kind: RuleViolationKind,
    penalty: number,
    label: string,
    out: RuleViolationEvent[]
  ): void {
    this.fareViolations += 1;
    this.totalViolations += 1;
    out.push({ kind, penalty, label });
  }
}
