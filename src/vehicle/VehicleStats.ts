import { YELLOW_CLASSIC_CONFIG, VehicleConfig } from '../core/config/vehicle';
import { StatSystem } from '../powers/StatSystem';

export interface EffectiveVehicleStats {
  topSpeed: number;
  reverseTopSpeed: number;
  engineForce: number;
  brakeForce: number;
  grip: number;
  handbrakeGrip: number;
  steerMult: number;
  mass: number;
  boostForceMult: number;
  boostTopSpeedMult: number;
}

export class VehicleStats {
  public config: VehicleConfig = { ...YELLOW_CLASSIC_CONFIG };
  public perfMult = 1.0; // From CarCondition
  public rainGripMult = 1.0; // From Rain event

  constructor(private readonly stats: StatSystem) {}

  getEffective(boosting: boolean): EffectiveVehicleStats {
    const topSpeedBase = this.stats.get('car.topSpeed') * this.perfMult;
    const accelMult = this.stats.get('car.accel') * this.perfMult;
    const boostForce = this.stats.get('car.boostForce');
    const boostTopMult = boosting ? this.config.boostTopSpeedMult : 1.0;
    const boostAccMult = boosting ? boostForce : 1.0;

    return {
      topSpeed: topSpeedBase * boostTopMult,
      reverseTopSpeed: this.config.reverseTopSpeed * Math.max(0.7, this.perfMult),
      engineForce: this.config.engineForce * accelMult * boostAccMult,
      brakeForce: this.config.brakeForce,
      grip: Math.min(0.98, this.stats.get('car.grip') * this.rainGripMult),
      handbrakeGrip: Math.min(0.95, this.stats.get('car.handbrakeGrip') * this.rainGripMult),
      steerMult: this.stats.get('car.steer'),
      mass: this.stats.get('car.mass'),
      boostForceMult: boostForce,
      boostTopSpeedMult: this.config.boostTopSpeedMult,
    };
  }
}
