/**
 * Procedural 5-gear RPM engine synthesizer + boost turbine + tire screech + damage sputter (§12).
 */
export class EngineSound {
  private oscMain: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private boostOsc: OscillatorNode | null = null;
  private boostGain: GainNode | null = null;

  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;

  private started = false;
  private sputterPhase = 0;

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

    // Boost turbine layer
    this.boostOsc = ctx.createOscillator();
    this.boostOsc.type = 'sawtooth';
    this.boostOsc.frequency.value = 220;
    this.boostGain = ctx.createGain();
    this.boostGain.gain.value = 0;
    this.boostOsc.connect(this.boostGain);
    this.boostGain.connect(destination);
    this.boostOsc.start();

    // Tire screech noise loop
    const bufferSize = ctx.sampleRate * 1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
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
    if (!this.started || !params.ctx || !this.oscMain || !this.oscSub || !this.engineGain || !this.engineFilter || !this.boostGain || !this.boostOsc || !this.screechGain) {
      return;
    }
    const now = params.ctx.currentTime;
    if (!params.active) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      this.boostGain.gain.setTargetAtTime(0, now, 0.05);
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

    // Boost whine
    this.boostOsc.frequency.setTargetAtTime(260 + rpmNorm * 340, now, 0.05);
    this.boostGain.gain.setTargetAtTime(params.boosting ? 0.065 : 0, now, 0.05);

    // Tire screech proportional to slip amount
    const screechVol = params.slip > 0.35 && params.speed > 5 ? Math.min(0.11, (params.slip - 0.3) * 0.16) : 0;
    this.screechGain.gain.setTargetAtTime(screechVol, now, 0.04);
  }
}
