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
  handbrakeRearGrip: number; // 0..1 rear grip scale in drift mode
  maxSteerDegLow: number; // at 0 km/h
  maxSteerDegHigh: number; // at top speed
  steerSpeed: number; // rad/s smoothing

  // Drift mode (Space) tuning
  driftMaxSteerDegLow: number;
  driftMaxSteerDegHigh: number;
  driftTargetSlipDeg: number;
  driftCarveAssist: number;
  driftRollLevelingStrength: number;
  driftExitBoostMult: number;
  driftExitBoostDuration: number;

  // Normal turning suspension roll tuning (visible suspension without 2-wheeling)
  normalRollLeverArm: number; // m below COM for lateral force in normal turns
  normalMaxRollDeg: number; // soft roll ceiling to keep all 4 wheels planted

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
  wheelMountY: -0.12,
  suspensionRestLength: 0.54,
  suspensionStiffness: 13800,
  suspensionDamping: 2450,
  maxSuspensionForce: 28000,

  topSpeed: 45,
  reverseTopSpeed: 12,
  engineForce: 15500,
  brakeForce: 21000,
  coastDrag: 0.14,
  driveType: 'AWD',

  baseGrip: 0.85,
  handbrakeRearGrip: 0.35,
  maxSteerDegLow: 33,
  maxSteerDegHigh: 7.5,
  steerSpeed: 8.5,

  driftMaxSteerDegLow: 26,
  driftMaxSteerDegHigh: 10,
  driftTargetSlipDeg: 32,
  driftCarveAssist: 1.15,
  driftRollLevelingStrength: 32000,
  driftExitBoostMult: 1.24,
  driftExitBoostDuration: 0.5,

  normalRollLeverArm: 0.52,
  normalMaxRollDeg: 7.5,

  downforceCoeff: 3.6,
  antiRollStrength: 2400,
  selfRightingAngleDeg: 24,
  selfRightingTorque: 7500,
  airGravityMult: 1.6,
  airPitchTorque: 1200,
  airYawTorque: 1400,
  driftYawAssist: 3.6,
  driftThrottleBoost: 1.22,
  maxCollisionAngVel: 2.8,

  boostForceMult: 1.4,
  boostTopSpeedMult: 1.15,
};
