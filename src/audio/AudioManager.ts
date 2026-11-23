import { EngineSound } from './EngineSound';

/**
 * Pure Web Audio API sound & arcade music manager (§12).
 * Zero external files needed — instant startup and zero 404 errors.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  public readonly engine = new EngineSound();

  private masterVol = 0.8;
  private musicVol = 0.45;
  private sfxVol = 0.85;

  private musicPlaying = false;
  private musicIntense = false;
  private musicStep = 0;
  private musicTimer = 0;
  private hornCooldown = 0;

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
      this.engine.start(this.ctx, this.sfxGain);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.masterVol = Math.max(0, Math.min(1, master));
    this.musicVol = Math.max(0, Math.min(1, music));
    this.sfxVol = Math.max(0, Math.min(1, sfx));
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.masterVol, now, 0.03);
    this.musicGain.gain.setTargetAtTime(this.musicVol, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.sfxVol, now, 0.03);
  }

  setMusicState(playing: boolean, intense: boolean): void {
    this.musicPlaying = playing;
    this.musicIntense = intense;
  }

  update(
    dt: number,
    engineParams: {
      speed: number;
      throttle: number;
      slip: number;
      boosting: boolean;
      condition: number;
      active: boolean;
    }
  ): void {
    if (this.hornCooldown > 0) this.hornCooldown -= dt;
    this.engine.update({ ...engineParams, ctx: this.ctx, dt });

    // Upbeat arcade punk/funk synth loop sequencer (§12)
    if (this.musicPlaying && this.ctx && this.ctx.state === 'running' && this.musicGain) {
      const bpm = this.musicIntense ? 168 : 146;
      const stepDur = 60 / bpm / 2; // 8th notes
      this.musicTimer += dt;
      if (this.musicTimer >= stepDur) {
        this.musicTimer -= stepDur;
        this.playMusicStep(this.musicStep, stepDur);
        this.musicStep = (this.musicStep + 1) % 32;
      }
    }
  }

  private playMusicStep(step: number, dur: number): void {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;

    // Punchy punk/funk bassline in E minor / G major
    const bassNotes = [
      82.4, 82.4, 98.0, 110.0, 82.4, 82.4, 123.5, 110.0,
      98.0, 98.0, 110.0, 123.5, 110.0, 98.0, 82.4, 73.4,
      82.4, 82.4, 110.0, 123.5, 146.8, 123.5, 110.0, 98.0,
      130.8, 130.8, 146.8, 130.8, 123.5, 110.0, 98.0, 92.5,
    ];
    const leadPattern = [
      329.6, 0, 392.0, 0, 440.0, 392.0, 329.6, 0,
      493.9, 0, 440.0, 392.0, 329.6, 0, 293.7, 0,
      329.6, 392.0, 440.0, 493.9, 587.3, 0, 493.9, 440.0,
      523.3, 0, 493.9, 440.0, 392.0, 329.6, 293.7, 0,
    ];

    // Bass
    const bFreq = bassNotes[step % bassNotes.length];
    const bOsc = this.ctx.createOscillator();
    const bGain = this.ctx.createGain();
    bOsc.type = 'sawtooth';
    bOsc.frequency.setValueAtTime(bFreq, now);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(520, now);
    bGain.gain.setValueAtTime(0.11, now);
    bGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.9);
    bOsc.connect(filt);
    filt.connect(bGain);
    bGain.connect(this.musicGain);
    bOsc.start(now);
    bOsc.stop(now + dur);

    // Lead guitar/synth riff
    const lFreq = leadPattern[step % leadPattern.length];
    if (lFreq > 0) {
      const lOsc = this.ctx.createOscillator();
      const lGain = this.ctx.createGain();
      lOsc.type = 'square';
      lOsc.frequency.setValueAtTime(lFreq, now);
      lGain.gain.setValueAtTime(this.musicIntense ? 0.065 : 0.045, now);
      lGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.85);
      lOsc.connect(lGain);
      lGain.connect(this.musicGain);
      lOsc.start(now);
      lOsc.stop(now + dur);
    }

    // Kick on even beats, snare on 2 & 6; double-time hi-hat when intense (< 15s)
    if (step % 4 === 0 || (this.musicIntense && step % 2 === 0)) {
      const kOsc = this.ctx.createOscillator();
      const kGain = this.ctx.createGain();
      kOsc.type = 'sine';
      kOsc.frequency.setValueAtTime(140, now);
      kOsc.frequency.exponentialRampToValueAtTime(38, now + 0.09);
      kGain.gain.setValueAtTime(0.18, now);
      kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      kOsc.connect(kGain);
      kGain.connect(this.musicGain);
      kOsc.start(now);
      kOsc.stop(now + 0.11);
    }
    if (step % 4 === 2) {
      this.playNoiseBurst(0.06, 1800, 0.09, this.musicGain);
    }
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainPeak = 0.18,
    delay = 0
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freqStart), now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(gainPeak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  private playNoiseBurst(
    duration: number,
    filterFreq: number,
    gainPeak: number,
    dest?: AudioNode
  ): void {
    if (!this.ctx) return;
    const target = dest ?? this.sfxGain;
    if (!target) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(gainPeak, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filt);
    filt.connect(g);
    g.connect(target);
    src.start(now);
  }

  playClick(): void {
    this.playTone(720, 480, 0.05, 'triangle', 0.14);
  }

  playBlinkerTick(): void {
    this.playTone(950, 700, 0.025, 'square', 0.06);
  }

  playHorn(loud: boolean): void {
    if (this.hornCooldown > 0) return;
    this.hornCooldown = 0.32;
    const vol = loud ? 0.24 : 0.14;
    this.playTone(loud ? 280 : 380, loud ? 275 : 375, 0.28, 'sawtooth', vol);
    this.playTone(loud ? 350 : 475, loud ? 345 : 470, 0.28, 'sawtooth', vol * 0.85);
  }

  playImpact(intensity: 'light' | 'medium' | 'heavy'): void {
    const map = {
      light: { f: 140, d: 0.12, g: 0.14 },
      medium: { f: 110, d: 0.2, g: 0.24 },
      heavy: { f: 80, d: 0.32, g: 0.36 },
    }[intensity];
    this.playTone(map.f, 32, map.d, 'sawtooth', map.g);
    this.playNoiseBurst(map.d, 550, map.g * 0.8);
  }

  playLandingThump(): void {
    this.playTone(115, 42, 0.14, 'sine', 0.2);
  }

  playPedExplosion(): void {
    // Cartoon boom + confetti pop!
    this.playTone(130, 28, 0.42, 'sawtooth', 0.35);
    this.playNoiseBurst(0.35, 380, 0.3);
    this.playTone(620, 1280, 0.12, 'triangle', 0.16, 0.06);
    this.playTone(880, 1560, 0.1, 'triangle', 0.14, 0.12);
  }

  playNearMiss(): void {
    this.playNoiseBurst(0.18, 1200, 0.14);
    this.playTone(540, 260, 0.16, 'sine', 0.1);
  }

  playPickupChime(): void {
    this.playTone(523.3, 523.3, 0.1, 'triangle', 0.2, 0);
    this.playTone(659.3, 659.3, 0.1, 'triangle', 0.2, 0.08);
    this.playTone(784.0, 784.0, 0.16, 'triangle', 0.22, 0.16);
  }

  playDeliveryCashRegister(): void {
    this.playTone(880, 880, 0.08, 'square', 0.16, 0);
    this.playTone(1318.5, 1318.5, 0.22, 'triangle', 0.24, 0.07);
    this.playTone(1760, 1760, 0.18, 'sine', 0.18, 0.14);
  }

  playGradeStamp(grade: string): void {
    const base = grade === 'S' ? 880 : grade === 'A' ? 740 : grade === 'B' ? 587 : 330;
    this.playTone(base, base * 1.25, 0.18, 'sawtooth', 0.16);
  }

  playTimerTick(): void {
    this.playTone(1040, 880, 0.05, 'square', 0.14);
  }

  playDraftCardFlip(): void {
    this.playTone(440, 880, 0.12, 'triangle', 0.16);
  }

  playShopPurchase(): void {
    this.playTone(660, 990, 0.1, 'triangle', 0.2, 0);
    this.playTone(990, 1320, 0.14, 'triangle', 0.2, 0.08);
  }

  playRepairWrench(): void {
    for (let i = 0; i < 4; i++) {
      this.playTone(480 + i * 90, 620 + i * 80, 0.045, 'square', 0.12, i * 0.06);
    }
  }

  playSpeechBlip(mood: 'happy' | 'angry' | 'panic' | 'neutral'): void {
    const f = mood === 'happy' ? 560 : mood === 'angry' ? 230 : mood === 'panic' ? 680 : 410;
    this.playTone(f, f * 1.15, 0.05, 'triangle', 0.1, 0);
    this.playTone(f * 1.1, f * 0.9, 0.05, 'triangle', 0.1, 0.06);
  }
}
