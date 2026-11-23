export interface VehicleConfig {
  name: string;
  // Chassis dimensions (m)
  chassisWidth: number;
  chassisHeight: number;
  chassisLength: number;
  mass: number;
  comOffsetY: number;
  linearDamping: number;
  angularDamping: number;

  // Wheels & suspension
  wheelRadius: number;
  wheelWidth: number;
  wheelBaseHalfZ: number;
  trackHalfX: number;
  wheelMountY: number;
  suspensionRestLength: number;
  suspensionStiffness: number;
  suspensionDamping: number;
  maxSuspensionForce: number;

  // Longitudinal
  topSpeed: number; // m/s (45 ≈ 162 km/h)
  reverseTopSpeed: number; // m/s
  engineForce: number; // N
  brakeForce: number; // N
  coastDrag: number;
  driveType: 'AWD' | 'RWD';

  // Lateral & steering
  baseGrip: number; // 0..1 lateral velocity cancel factor
  handbrakeRearGrip: number; // 0..1
  maxSteerDegLow: number; // at 0 km/h
  maxSteerDegHigh: number; // at top speed
  steerSpeed: number; // rad/s smoothing

  // Arcade assists
  downforceCoeff: number;
  antiRollStrength: number;
  selfRightingAngleDeg: number;
  selfRightingTorque: number;
  airGravityMult: number;
  airPitchTorque: number;
  airYawTorque: number;
  driftYawAssist: number;
  driftThrottleBoost: number;
  maxCollisionAngVel: number;

  // Boost
  boostForceMult: number; // +40%
  boostTopSpeedMult: number; // +15%
}

export const YELLOW_CLASSIC_CONFIG: VehicleConfig = {
  name: 'Yellow Classic',
  chassisWidth: 1.9,
  chassisHeight: 1.35,
  chassisLength: 4.4,
  mass: 1200,
  comOffsetY: -0.4,
  linearDamping: 0.08,
  angularDamping: 2.2,

  wheelRadius: 0.36,
  wheelWidth: 0.26,
  wheelBaseHalfZ: 1.42,
  trackHalfX: 0.86,
  wheelMountY: -0.22,
  suspensionRestLength: 0.5,
  suspensionStiffness: 34000,
  suspensionDamping: 4600,
  maxSuspensionForce: 26000,

  topSpeed: 45,
  reverseTopSpeed: 12,
  engineForce: 15500,
  brakeForce: 21000,
  coastDrag: 0.14,
  driveType: 'AWD',

  baseGrip: 0.85,
  handbrakeRearGrip: 0.35,
  maxSteerDegLow: 35,
  maxSteerDegHigh: 8,
  steerSpeed: 8.5,

  downforceCoeff: 3.2,
  antiRollStrength: 2400,
  selfRightingAngleDeg: 50,
  selfRightingTorque: 6500,
  airGravityMult: 1.6,
  airPitchTorque: 1200,
  airYawTorque: 1400,
  driftYawAssist: 2.4,
  driftThrottleBoost: 1.15,
  maxCollisionAngVel: 2.8,

  boostForceMult: 1.4,
  boostTopSpeedMult: 1.15,
};
