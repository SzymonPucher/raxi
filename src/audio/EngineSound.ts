/**
 * Procedural 5-gear RPM engine synthesizer + big-exhaust nitro rumble + tire screech + damage sputter (§12).
 */
export class EngineSound {
  private oscMain: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private boostOsc: OscillatorNode | null = null;
  private boostSubOsc: OscillatorNode | null = null;
  private boostFilter: BiquadFilterNode | null = null;
  private boostGain: GainNode | null = null;
  private boostNoiseFilter: BiquadFilterNode | null = null;
  private boostNoiseGain: GainNode | null = null;

  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;

  private started = false;
  private sputterPhase = 0;
  private boostBurblePhase = 0;
  private boostPunch = 0;
  private wasBoosting = false;

  start(ctx: AudioContext, destination: AudioNode): void {
    if (this.started) return;
    this.started = true;

    // Engine main oscillators
    this.oscMain = ctx.createOscillator();
    this.oscMain.type = 'sawtooth';
    this.oscMain.frequency.value = 58;

    this.oscSub = ctx.createOscillator();
    this.oscSub.type = 'triangle';
    this.oscSub.frequency.value = 29;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 260;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.oscMain.connect(this.engineFilter);
    this.oscSub.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(destination);

    this.oscMain.start();
    this.oscSub.start();

    // Shared 1-second looping noise buffer for tire screech & big-exhaust rumble
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 1));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Deep big-exhaust nitro roar/rumble layer (low sawtooth + sub triangle through warm lowpass)
    this.boostOsc = ctx.createOscillator();
    this.boostOsc.type = 'sawtooth';
    this.boostOsc.frequency.value = 72;

    this.boostSubOsc = ctx.createOscillator();
    this.boostSubOsc.type = 'triangle';
    this.boostSubOsc.frequency.value = 36;

    this.boostFilter = ctx.createBiquadFilter();
    this.boostFilter.type = 'lowpass';
    this.boostFilter.frequency.value = 185;
    this.boostFilter.Q.value = 2.4;

    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0;

    this.boostOsc.connect(this.boostFilter);
    this.boostSubOsc.connect(this.boostFilter);
    this.boostFilter.connect(this.boostGain);
    this.boostGain.connect(destination);

    this.boostOsc.start();
    this.boostSubOsc.start();

    // Lowpass-filtered exhaust rumble noise layer
    const boostNoise = ctx.createBufferSource();
    boostNoise.buffer = buffer;
    boostNoise.loop = true;

    this.boostNoiseFilter = ctx.createBiquadFilter();
    this.boostNoiseFilter.type = 'lowpass';
    this.boostNoiseFilter.frequency.value = 175;
    this.boostNoiseFilter.Q.value = 1.6;

    this.boostNoiseGain = ctx.createGain();
    this.boostNoiseGain.gain.value = 0;

    boostNoise.connect(this.boostNoiseFilter);
    this.boostNoiseFilter.connect(this.boostNoiseGain);
    this.boostNoiseGain.connect(destination);
    boostNoise.start();

    // Tire screech noise loop
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    this.screechFilter = ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.value = 1450;
    this.screechFilter.Q.value = 5.5;

    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;

    noise.connect(this.screechFilter);
    this.screechFilter.connect(this.screechGain);
    this.screechGain.connect(destination);
    noise.start();
  }

  update(params: {
    ctx: AudioContext | null;
    speed: number;
    throttle: number;
    slip: number;
    boosting: boolean;
    condition: number;
    active: boolean;
    dt: number;
  }): void {
    if (
      !this.started ||
      !params.ctx ||
      !this.oscMain ||
      !this.oscSub ||
      !this.engineGain ||
      !this.engineFilter ||
      !this.boostOsc ||
      !this.boostSubOsc ||
      !this.boostFilter ||
      !this.boostGain ||
      !this.boostNoiseFilter ||
      !this.boostNoiseGain ||
      !this.screechGain
    ) {
      return;
    }
    const now = params.ctx.currentTime;
    if (!params.active) {
      this.wasBoosting = false;
      this.boostPunch = 0;
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      this.boostGain.gain.setTargetAtTime(0, now, 0.05);
      this.boostNoiseGain.gain.setTargetAtTime(0, now, 0.05);
      this.screechGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    // Fake 5-gear RPM calculation
    const speedKmh = Math.abs(params.speed) * 3.6;
    const gearThresholds = [0, 32, 66, 102, 138, 220];
    let gear = 0;
    for (let g = 0; g < 5; g++) {
      if (speedKmh >= gearThresholds[g]) gear = g;
    }
    const gearMin = gearThresholds[gear];
    const gearMax = gearThresholds[gear + 1];
    const gearFrac = Math.max(0, Math.min(1, (speedKmh - gearMin) / Math.max(1, gearMax - gearMin)));
    const rpmNorm = Math.min(1, 0.22 + gearFrac * 0.72 + params.throttle * 0.14);

    const baseFreq = 52 + rpmNorm * 135;
    this.oscMain.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.oscSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(220 + rpmNorm * 750, now, 0.05);

    // Damage sputter when car condition < 45% (§8.6, §12)
    let sputter = 1.0;
    if (params.condition < 45) {
      this.sputterPhase += params.dt * (16 + (45 - params.condition) * 0.4);
      sputter = Math.sin(this.sputterPhase) > -0.35 ? 1.0 : 0.25;
    }

    const engVol = (0.05 + params.throttle * 0.05 + rpmNorm * 0.04) * sputter;
    this.engineGain.gain.setTargetAtTime(engVol, now, 0.05);

    // Deep big-exhaust nitro roar & rumble (~38-114 Hz + warm lowpass + burble & bass punch)
    if (params.boosting && !this.wasBoosting) {
      this.boostPunch = 1.0;
    }
    this.wasBoosting = params.boosting;

    if (params.boosting) {
      this.boostPunch = Math.max(0, this.boostPunch - params.dt * 4.2);
      this.boostBurblePhase += params.dt * (24 + rpmNorm * 14);
    } else {
      this.boostPunch = Math.max(0, this.boostPunch - params.dt * 8.0);
    }

    const burbleWave = Math.sin(this.boostBurblePhase) * Math.cos(this.boostBurblePhase * 0.47);
    const burbleGain = params.boosting ? 0.87 + 0.13 * burbleWave : 1.0;
    const burbleCutoff = params.boosting ? burbleWave * 28 : 0;

    const boostMainFreq = 66 + rpmNorm * 48; // ~76.6–114 Hz deep exhaust growl
    const boostSubFreq = boostMainFreq * 0.5; // ~38.3–57 Hz sub-bass chest rumble
    this.boostOsc.frequency.setTargetAtTime(boostMainFreq, now, 0.05);
    this.boostSubOsc.frequency.setTargetAtTime(boostSubFreq, now, 0.05);

    const boostFilterCutoff = Math.max(
      120,
      165 + rpmNorm * 145 + this.boostPunch * 75 + burbleCutoff
    );
    const boostNoiseCutoff = Math.max(
      110,
      145 + rpmNorm * 115 + this.boostPunch * 60 + burbleCutoff * 0.6
    );
    this.boostFilter.frequency.setTargetAtTime(boostFilterCutoff, now, 0.05);
    this.boostNoiseFilter.frequency.setTargetAtTime(boostNoiseCutoff, now, 0.05);

    const boostTimeConst = params.boosting ? 0.06 : 0.08;
    const boostToneVol = params.boosting ? (0.145 + this.boostPunch * 0.045) * burbleGain : 0;
    const boostRumbleVol = params.boosting ? (0.095 + this.boostPunch * 0.035) * burbleGain : 0;
    this.boostGain.gain.setTargetAtTime(boostToneVol, now, boostTimeConst);
    this.boostNoiseGain.gain.setTargetAtTime(boostRumbleVol, now, boostTimeConst);

    // Tire screech proportional to slip amount
    const screechVol = params.slip > 0.35 && params.speed > 5 ? Math.min(0.11, (params.slip - 0.3) * 0.16) : 0;
    this.screechGain.gain.setTargetAtTime(screechVol, now, 0.04);
  }
}
