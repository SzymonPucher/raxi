import { EngineSound } from './EngineSound';
import accident1Url from '../../audio/accident_1.mp3';
import accident2Url from '../../audio/accident_2.mp3';
import clientExitUrl from '../../audio/client_exit.mp3';

type SpecialClipKey = 'accident1' | 'accident2' | 'clientExit';

const SPECIAL_CLIP_URLS: Record<SpecialClipKey, string> = {
  accident1: accident1Url,
  accident2: accident2Url,
  clientExit: clientExitUrl,
};

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
  private noiseBuffer: AudioBuffer | null = null;

  private specialSoundsEnabled = false;
  private specialBuffers: Record<SpecialClipKey, AudioBuffer | null> = {
    accident1: null,
    accident2: null,
    clientExit: null,
  };
  private specialLoadPromise: Promise<void> | null = null;
  private specialVoiceSource: AudioBufferSourceNode | null = null;
  private specialAccidentCooldown = 0;
  private specialRequestSeq = 0;

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      // Pre-generate 1 second of white noise for crisp percussion & SFX
      const noiseLen = Math.max(1, this.ctx.sampleRate);
      this.noiseBuffer = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
      const ch = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) ch[i] = Math.random() * 2 - 1;

      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
      this.engine.start(this.ctx, this.sfxGain);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.specialSoundsEnabled) {
      void this.preloadSpecialSounds();
    }
  }

  setSpecialSoundsEnabled(enabled: boolean): void {
    this.specialSoundsEnabled = enabled;
    if (enabled) {
      if (this.ctx) {
        void this.preloadSpecialSounds();
      }
    } else {
      this.stopSpecialSounds();
    }
  }

  stopSpecialSounds(): void {
    this.specialRequestSeq += 1;
    this.specialAccidentCooldown = 0;
    if (this.specialVoiceSource) {
      try {
        this.specialVoiceSource.stop();
      } catch {
        // Ignore if already stopped
      }
      this.specialVoiceSource = null;
    }
  }

  private preloadSpecialSounds(): Promise<void> {
    if (!this.ctx || typeof fetch === 'undefined') {
      return Promise.resolve();
    }
    if (this.specialLoadPromise) {
      return this.specialLoadPromise;
    }
    const ctx = this.ctx;
    const keys: SpecialClipKey[] = ['accident1', 'accident2', 'clientExit'];
    this.specialLoadPromise = Promise.all(
      keys.map(async (key) => {
        try {
          const res = await fetch(SPECIAL_CLIP_URLS[key]);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          this.specialBuffers[key] = await ctx.decodeAudioData(arr);
        } catch {
          // Ignore asset fetch/decode errors
        }
      })
    ).then(() => undefined);
    return this.specialLoadPromise;
  }

  private playSpecialClip(key: SpecialClipKey): void {
    if (!this.specialSoundsEnabled || !this.ctx || !this.sfxGain) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    const reqSeq = ++this.specialRequestSeq;
    const startBuffer = (buffer: AudioBuffer) => {
      if (!this.specialSoundsEnabled || !this.ctx || !this.sfxGain || reqSeq !== this.specialRequestSeq) {
        return;
      }
      if (this.specialVoiceSource) {
        try {
          this.specialVoiceSource.stop();
        } catch {
          // Ignore if already stopped
        }
        this.specialVoiceSource = null;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.sfxGain);
      src.onended = () => {
        if (this.specialVoiceSource === src) {
          this.specialVoiceSource = null;
        }
      };
      this.specialVoiceSource = src;
      src.start();
    };

    const existing = this.specialBuffers[key];
    if (existing) {
      startBuffer(existing);
      return;
    }
    void this.preloadSpecialSounds().then(() => {
      const loaded = this.specialBuffers[key];
      if (loaded) startBuffer(loaded);
    });
  }

  playSpecialAccident(randomUnit?: () => number): void {
    if (!this.specialSoundsEnabled || this.specialAccidentCooldown > 0) return;
    this.specialAccidentCooldown = 0.45;
    const r = randomUnit ? randomUnit() : Math.random();
    this.playSpecialClip(r < 0.5 ? 'accident1' : 'accident2');
  }

  playSpecialClientExit(): void {
    if (!this.specialSoundsEnabled) return;
    this.playSpecialClip('clientExit');
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
    if (this.specialAccidentCooldown > 0) {
      this.specialAccidentCooldown = Math.max(0, this.specialAccidentCooldown - dt);
    }
    this.engine.update({ ...engineParams, ctx: this.ctx, dt });

    // Upbeat synth-pop / dance-pop loop sequencer (16th-note grid, 8 bars = 128 steps)
    if (this.musicPlaying && this.ctx && this.ctx.state === 'running' && this.musicGain) {
      const bpm = this.musicIntense ? 132 : 120;
      const stepDur = 60 / bpm / 4; // 16th notes
      this.musicTimer = Math.min(this.musicTimer + dt, stepDur * 2);
      if (this.musicTimer >= stepDur) {
        this.musicTimer -= stepDur;
        this.playPopMusicStep(this.musicStep, stepDur);
        this.musicStep = (this.musicStep + 1) % 128;
      }
    }
  }

  private playPopMusicStep(step: number, dur: number): void {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const bar = Math.floor(step / 16) % 4; // 0: C, 1: G, 2: Am, 3: F (I-V-vi-IV pop progression)
    const stepInBar = step % 16;
    const isChorus = step >= 64;

    // Chord progression: C -> G -> Am -> F
    const bassRoots = [65.41, 98.0, 110.0, 87.31]; // C2, G2, A2, F2
    const chords: [number, number, number][] = [
      [261.63, 329.63, 392.0], // C4, E4, G4
      [246.94, 293.66, 392.0], // B3, D4, G4
      [261.63, 329.63, 440.0], // C4, E4, A4
      [261.63, 349.23, 440.0], // C4, F4, A4
    ];

    // 1. Bouncy octave-pop synth bass (syncopated dance-pop pattern)
    const bassPattern = [1, 0, 0, 2, 0, 0, 2, 0, 1, 0, 2, 0, 0, 1, 2, 0];
    const bassMult = bassPattern[stepInBar];
    if (bassMult > 0) {
      const bFreq = bassRoots[bar] * bassMult;
      const bOsc = this.ctx.createOscillator();
      const bSub = this.ctx.createOscillator();
      const filt = this.ctx.createBiquadFilter();
      const bGain = this.ctx.createGain();

      bOsc.type = 'sawtooth';
      bOsc.frequency.setValueAtTime(bFreq, now);
      bSub.type = 'sine';
      bSub.frequency.setValueAtTime(bFreq, now);

      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(900, now);
      filt.frequency.exponentialRampToValueAtTime(260, now + dur * 1.4);

      bGain.gain.setValueAtTime(0.001, now);
      bGain.gain.linearRampToValueAtTime(0.11, now + 0.008);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 1.6);

      bOsc.connect(filt);
      bSub.connect(filt);
      filt.connect(bGain);
      bGain.connect(this.musicGain);

      bOsc.start(now);
      bSub.start(now);
      bOsc.stop(now + dur * 1.65);
      bSub.stop(now + dur * 1.65);
    }

    // 2. Warm pop synth chord stabs (syncopated tropical/dance-pop rhythm)
    const chordHit =
      stepInBar === 0 ||
      stepInBar === 6 ||
      stepInBar === 12 ||
      (isChorus && (stepInBar === 3 || stepInBar === 10));
    if (chordHit) {
      const chord = chords[bar];
      const cDur = dur * (stepInBar === 0 ? 3.2 : 2.1);
      const cFilt = this.ctx.createBiquadFilter();
      cFilt.type = 'lowpass';
      cFilt.frequency.setValueAtTime(isChorus ? 2200 : 1650, now);

      const cGain = this.ctx.createGain();
      cGain.gain.setValueAtTime(0.001, now);
      cGain.gain.linearRampToValueAtTime(isChorus ? 0.045 : 0.036, now + 0.012);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + cDur);

      cFilt.connect(cGain);
      cGain.connect(this.musicGain);

      for (const freq of chord) {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.connect(cFilt);
        osc.start(now);
        osc.stop(now + cDur + 0.02);
      }
    }

    // 3. Catchy pop synth pluck melody (8-bar verse + chorus hook in C major)
    const melody: number[] = [
      // Bar 1 (C): E5 - G5 - E5 - D5 - C5
      659.25, 0, 0, 783.99, 0, 0, 659.25, 0, 587.33, 0, 523.25, 0, 0, 659.25, 0, 0,
      // Bar 2 (G): D5 - G5 - D5 - B4
      587.33, 0, 0, 783.99, 0, 0, 587.33, 0, 493.88, 0, 587.33, 0, 0, 0, 0, 0,
      // Bar 3 (Am): C5 - E5 - A5 - G5 - E5
      523.25, 0, 659.25, 0, 880.0, 0, 783.99, 0, 659.25, 0, 523.25, 0, 659.25, 0, 0, 0,
      // Bar 4 (F): F5 - E5 - D5 - C5 - D5
      698.46, 0, 0, 659.25, 0, 0, 587.33, 0, 523.25, 0, 0, 587.33, 0, 0, 659.25, 0,
      // Bar 5 (C chorus): G5 - A5 - G5 - E5 - C5
      783.99, 0, 880.0, 0, 783.99, 0, 659.25, 0, 523.25, 0, 659.25, 0, 783.99, 0, 0, 0,
      // Bar 6 (G chorus): G5 - B5 - A5 - G5 - D5
      783.99, 0, 987.77, 0, 880.0, 0, 783.99, 0, 587.33, 0, 783.99, 0, 659.25, 0, 0, 0,
      // Bar 7 (Am chorus): A5 - C6 - A5 - G5 - E5
      880.0, 0, 1046.5, 0, 880.0, 0, 783.99, 0, 659.25, 0, 783.99, 0, 880.0, 0, 0, 0,
      // Bar 8 (F chorus turnaround): F5 - G5 - A5 - G5 - E5 - D5
      698.46, 0, 783.99, 0, 880.0, 0, 783.99, 0, 659.25, 0, 587.33, 0, 523.25, 0, 587.33, 0,
    ];
    const lFreq = melody[step % melody.length];
    if (lFreq > 0) {
      const lOsc = this.ctx.createOscillator();
      const lShimmer = this.ctx.createOscillator();
      const lFilt = this.ctx.createBiquadFilter();
      const lGain = this.ctx.createGain();
      const lDur = dur * 1.9;

      lOsc.type = 'triangle';
      lOsc.frequency.setValueAtTime(lFreq, now);
      lShimmer.type = 'sine';
      lShimmer.frequency.setValueAtTime(lFreq * 2, now);

      lFilt.type = 'lowpass';
      lFilt.frequency.setValueAtTime(4200, now);
      lFilt.frequency.exponentialRampToValueAtTime(1400, now + lDur);

      const peak = this.musicIntense ? 0.07 : isChorus ? 0.062 : 0.05;
      lGain.gain.setValueAtTime(0.001, now);
      lGain.gain.linearRampToValueAtTime(peak, now + 0.008);
      lGain.gain.exponentialRampToValueAtTime(0.001, now + lDur);

      const shimmerGain = this.ctx.createGain();
      shimmerGain.gain.setValueAtTime(0.28, now);

      lOsc.connect(lFilt);
      lShimmer.connect(shimmerGain);
      shimmerGain.connect(lFilt);
      lFilt.connect(lGain);
      lGain.connect(this.musicGain);

      lOsc.start(now);
      lShimmer.start(now);
      lOsc.stop(now + lDur + 0.01);
      lShimmer.stop(now + lDur + 0.01);
    }

    // 4. Pop Drum Groove: Four-on-the-floor kick + crisp clap/snare on 2 & 4 + crisp hi-hats
    if (stepInBar % 4 === 0 || (bar === 3 && stepInBar === 14)) {
      const kOsc = this.ctx.createOscillator();
      const kGain = this.ctx.createGain();
      kOsc.type = 'sine';
      kOsc.frequency.setValueAtTime(125, now);
      kOsc.frequency.exponentialRampToValueAtTime(42, now + 0.095);
      kGain.gain.setValueAtTime(0.17, now);
      kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      kOsc.connect(kGain);
      kGain.connect(this.musicGain);
      kOsc.start(now);
      kOsc.stop(now + 0.12);
    }

    // Crisp pop clap/snare on beats 2 & 4 (steps 4 and 12)
    if (stepInBar === 4 || stepInBar === 12) {
      this.playNoiseBurst(0.085, 1900, 0.09, this.musicGain, 'bandpass');
      const sOsc = this.ctx.createOscillator();
      const sGain = this.ctx.createGain();
      sOsc.type = 'triangle';
      sOsc.frequency.setValueAtTime(195, now);
      sOsc.frequency.exponentialRampToValueAtTime(115, now + 0.045);
      sGain.gain.setValueAtTime(0.06, now);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      sOsc.connect(sGain);
      sGain.connect(this.musicGain);
      sOsc.start(now);
      sOsc.stop(now + 0.055);
    }

    // Crisp off-beat pop hi-hats (plus 16th-note shaker hats when intense or in chorus)
    if (stepInBar % 4 === 2) {
      this.playNoiseBurst(0.04, 7500, 0.045, this.musicGain, 'highpass');
    } else if (this.musicIntense || (isChorus && stepInBar % 2 === 1)) {
      this.playNoiseBurst(0.025, 8500, 0.024, this.musicGain, 'highpass');
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
    dest?: AudioNode,
    filterType: BiquadFilterType = 'bandpass'
  ): void {
    if (!this.ctx) return;
    const target = dest ?? this.sfxGain;
    if (!target) return;
    let buf = this.noiseBuffer;
    if (!buf) {
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(gainPeak, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filt);
    filt.connect(g);
    g.connect(target);
    src.start(now);
    src.stop(now + duration + 0.01);
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
