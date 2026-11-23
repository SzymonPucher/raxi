import { BALANCE } from '../core/config/balance';

export interface DriftSample {
  groundedWheels: number;
  leftGrounded: number;
  rightGrounded: number;
  speed: number;
  forwardSpeed: number;
  lateralSpeed: number;
  yawRate: number;
  altitude: number;
  posY: number;
  dt: number;
}

export interface DriftEventsOut {
  isDrifting: boolean;
  slipDeg: number;
  driftDuration: number;
  isAirborne: boolean;
  airtime: number;
  landed?: {
    airtime: number;
    dropHeight: number;
    clean: boolean;
    bigJump: boolean;
    spun360: boolean;
  };
  twoWheelAwarded: boolean;
}

export class DriftDetector {
  public isDrifting = false;
  public slipDeg = 0;
  public currentDriftTime = 0;
  public longestDrift = 0;

  public isAirborne = false;
  public currentAirtime = 0;
  public maxAirtime = 0;
  private peakAirY = 0;
  private airYawAccum = 0;

  private twoWheelTimer = 0;
  private twoWheelCooldown = 0;

  reset(): void {
    this.isDrifting = false;
    this.slipDeg = 0;
    this.currentDriftTime = 0;
    this.longestDrift = 0;
    this.isAirborne = false;
    this.currentAirtime = 0;
    this.maxAirtime = 0;
    this.peakAirY = 0;
    this.airYawAccum = 0;
    this.twoWheelTimer = 0;
    this.twoWheelCooldown = 0;
  }

  update(sample: DriftSample): DriftEventsOut {
    const {
      groundedWheels,
      leftGrounded,
      rightGrounded,
      speed,
      forwardSpeed,
      lateralSpeed,
      yawRate,
      posY,
      dt,
    } = sample;

    const out: DriftEventsOut = {
      isDrifting: false,
      slipDeg: 0,
      driftDuration: 0,
      isAirborne: false,
      airtime: 0,
      twoWheelAwarded: false,
    };

    // Slip angle
    const absFwd = Math.max(1.0, Math.abs(forwardSpeed));
    const slipRad = Math.atan2(Math.abs(lateralSpeed), absFwd);
    const slipDeg = (slipRad * 180) / Math.PI;
    this.slipDeg = slipDeg;
    out.slipDeg = slipDeg;

    // Drifting detection
    const driftingNow =
      groundedWheels >= 2 &&
      speed >= BALANCE.styleDriftMinSpeed &&
      slipDeg >= BALANCE.styleDriftMinSlipDeg &&
      forwardSpeed > 2;

    if (driftingNow) {
      this.isDrifting = true;
      this.currentDriftTime += dt;
      if (this.currentDriftTime > this.longestDrift) {
        this.longestDrift = this.currentDriftTime;
      }
    } else {
      this.isDrifting = false;
      this.currentDriftTime = 0;
    }
    out.isDrifting = this.isDrifting;
    out.driftDuration = this.currentDriftTime;

    // Airtime detection
    if (groundedWheels === 0) {
      if (!this.isAirborne) {
        this.isAirborne = true;
        this.currentAirtime = 0;
        this.peakAirY = posY;
        this.airYawAccum = 0;
      }
      this.currentAirtime += dt;
      if (posY > this.peakAirY) this.peakAirY = posY;
      this.airYawAccum += Math.abs(yawRate) * dt;
      if (this.currentAirtime > this.maxAirtime) {
        this.maxAirtime = this.currentAirtime;
      }
      out.isAirborne = true;
      out.airtime = this.currentAirtime;
    } else if (this.isAirborne) {
      const dropHeight = Math.max(0, this.peakAirY - posY);
      const airtime = this.currentAirtime;
      if (airtime >= BALANCE.styleAirMinDuration) {
        out.landed = {
          airtime,
          dropHeight,
          clean: groundedWheels >= 3 && dropHeight < 5.0,
          bigJump: airtime >= 1.1 || dropHeight >= 3.2,
          spun360: this.airYawAccum >= Math.PI * 1.65,
        };
      }
      this.isAirborne = false;
      this.currentAirtime = 0;
      this.airYawAccum = 0;
    }

    // Two-wheel driving detection (both left OR both right wheels airborne while moving)
    this.twoWheelCooldown = Math.max(0, this.twoWheelCooldown - dt);
    const onTwoWheels =
      groundedWheels === 2 &&
      ((leftGrounded === 2 && rightGrounded === 0) || (rightGrounded === 2 && leftGrounded === 0)) &&
      speed > 10;

    if (onTwoWheels) {
      this.twoWheelTimer += dt;
      if (this.twoWheelTimer >= 0.45 && this.twoWheelCooldown <= 0) {
        out.twoWheelAwarded = true;
        this.twoWheelCooldown = 3.0;
      }
    } else {
      this.twoWheelTimer = 0;
    }

    return out;
  }
}
