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
 * Pure traffic-rule violation tracker (§9.5, §8.2a):
 * - Running a red light (0.35 * strictness)
 * - Changing lane without blinker on >= 0.8s (0.20 * strictness)
 * - Driving in oncoming lane > 1s (0.15 + 0.05/s)
 * - Speeding > 1.15x road limit > 1s (0.05/s)
 * - Auto-cancels blinker after lane change or turn; awards +5 style for turning with blinker
 */
export class RulesTracker {
  public fareViolations = 0;
  public totalViolations = 0;
  public checklist: RulesChecklist = { redLights: 0, blinkers: 0, speeding: 0, oncoming: 0 };

  private lastEdgeId: string | null = null;
  private lastEdgeDirX = 0;
  private lastEdgeDirZ = 1;
  private lastLaneIndex: number | null = null;
  private oncomingTimer = 0;
  private oncomingTriggered = false;
  private speedingTimer = 0;
  private speedingReportAccum = 0;
  private prevDistToAheadNode = Infinity;
  private prevAheadNodeId: string | null = null;
  private wasOutsideJunctionOnRed = false;
  private lastRedLightNodeId: string | null = null;
  private redLightCooldown = 0;
  private laneViolationCooldown = 0;

  resetShift(): void {
    this.totalViolations = 0;
    this.resetFare();
  }

  resetFare(): void {
    this.fareViolations = 0;
    this.checklist = { redLights: 0, blinkers: 0, speeding: 0, oncoming: 0 };
    this.lastEdgeId = null;
    this.lastLaneIndex = null;
    this.oncomingTimer = 0;
    this.oncomingTriggered = false;
    this.speedingTimer = 0;
    this.speedingReportAccum = 0;
    this.prevDistToAheadNode = Infinity;
    this.prevAheadNodeId = null;
    this.wasOutsideJunctionOnRed = false;
    this.lastRedLightNodeId = null;
    this.redLightCooldown = 0;
    this.laneViolationCooldown = 0;
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
    this.laneViolationCooldown = Math.max(0, this.laneViolationCooldown - sample.dt);

    const proj = sample.projection;
    if (!proj || proj.distFromCenter > proj.halfWidth + 4) {
      this.lastEdgeId = null;
      this.lastLaneIndex = null;
      this.oncomingTimer = 0;
      this.oncomingTriggered = false;
      this.speedingTimer = 0;
      return { violations, shouldCancelBlinker, blinkerTurnStyleBonus };
    }

    const strict = Math.max(0, sample.ruleStrictness);
    const inIntersectionZone = proj.distToNearestNode < 16.0;
    const alignedWithRoad = Math.abs(proj.headingDot) >= 0.72;

    // 1. Detect intersection transitions (edge changed)
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
      sample.speed > 4 &&
      this.laneViolationCooldown <= 0
    ) {
      // 2. Lane change on same road edge outside intersections
      // Account for travel direction along edge so left/right matches player's perspective
      const travelSign = proj.headingDot >= 0 ? 1 : -1;
      const movedRightFromDriverView = (proj.laneIndex - this.lastLaneIndex) * travelSign > 0;
      const expectedBlinker: BlinkerSide = movedRightFromDriverView ? 'right' : 'left';
      const hadProperBlinker =
        sample.blinker === expectedBlinker && sample.blinkerOnTime >= BALANCE.ruleBlinkerLeadTime;

      if (hadProperBlinker) {
        shouldCancelBlinker = true;
      } else if (strict > 0) {
        const pen = BALANCE.ruleNoBlinker * strict;
        this.recordViolation('noBlinker', pen, 'NO BLINKER!', violations);
        this.checklist.blinkers++;
        this.laneViolationCooldown = 2.0;
      }
    }

    this.lastEdgeId = proj.edge.id;
    this.lastEdgeDirX = proj.dirX;
    this.lastEdgeDirZ = proj.dirZ;
    this.lastLaneIndex = proj.laneIndex;

    // 3. Running a red light (§9.5: crossing stop line while red & not already inside junction when it turned)
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
            const pen = BALANCE.ruleRedLight * strict;
            this.recordViolation('redLight', pen, 'RAN RED LIGHT!', violations);
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

    // 4. Oncoming lane (> 1s)
    if (proj.isOncoming && sample.speed > 3) {
      this.oncomingTimer += sample.dt;
      if (this.oncomingTimer >= BALANCE.ruleOncomingGrace && strict > 0) {
        if (!this.oncomingTriggered) {
          this.oncomingTriggered = true;
          this.recordViolation('oncoming', BALANCE.ruleOncomingBase * strict, 'WRONG LANE!', violations);
          this.checklist.oncoming++;
        } else {
          // Continuous penalty
          violations.push({
            kind: 'oncoming',
            penalty: BALANCE.ruleOncomingPerSec * sample.dt * strict,
            label: '',
          });
        }
      }
    } else {
      this.oncomingTimer = 0;
      this.oncomingTriggered = false;
    }

    // 5. Speeding (> 1.15x road speed limit for > 1s)
    if (sample.speed > proj.edge.speedLimit * BALANCE.ruleSpeedingMult) {
      this.speedingTimer += sample.dt;
      if (this.speedingTimer >= BALANCE.ruleSpeedingGrace && strict > 0) {
        const pen = BALANCE.ruleSpeedingPerSec * sample.dt * strict;
        this.speedingReportAccum += sample.dt;
        if (this.speedingReportAccum >= 2.0) {
          this.speedingReportAccum = 0;
          this.recordViolation('speeding', pen, 'SPEEDING!', violations);
          this.checklist.speeding++;
        } else {
          violations.push({ kind: 'speeding', penalty: pen, label: '' });
        }
      }
    } else {
      this.speedingTimer = 0;
      this.speedingReportAccum = 0;
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
