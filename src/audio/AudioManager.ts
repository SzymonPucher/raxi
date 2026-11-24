import { EngineSound } from './EngineSound';
import accident1Url from '../../audio/accident_1.mp3';
import accident2Url from '../../audio/accident_2.mp3';
import clientExitUrl from '../../audio/client_exit.mp3';
import pigUrl from '../../audio/pig.m4a';

type SpecialClipKey = 'accident1' | 'accident2' | 'clientExit';

export const PIG_GRUNT_URL = pigUrl;

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

  private gruntBuffer: AudioBuffer | null = null;
  private gruntLoadPromise: Promise<void> | null = null;
  private gruntSource: AudioBufferSourceNode | null = null;
  private gruntRequestSeq = 0;

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
    void this.preloadGruntSound();
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
      drifting?: boolean;
      condition: number;
      active: boolean;
    }
  ): void {
    if (this.hornCooldown > 0) this.hornCooldown -= dt;
    if (this.specialAccidentCooldown > 0) {
      this.specialAccidentCooldown = Math.max(0, this.specialAccidentCooldown - dt);
    }
    this.engine.update({ ...engineParams, ctx: this.ctx, dt });

    // Energetic 8-bit chiptune breakbeat sequencer (16th-note grid, 8 bars = 128 steps)
    if (this.musicPlaying && this.ctx && this.ctx.state === 'running' && this.musicGain) {
      const bpm = this.musicIntense ? 152 : 140;
      const stepDur = 60 / bpm / 4; // 16th notes
      this.musicTimer = Math.min(this.musicTimer + dt, stepDur * 2);
      if (this.musicTimer >= stepDur) {
        this.musicTimer -= stepDur;
        this.playChiptuneBreakbeatStep(this.musicStep, stepDur);
        this.musicStep = (this.musicStep + 1) % 128;
      }
    }
  }

  private playChiptuneBreakbeatStep(step: number, dur: number): void {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const bar = Math.floor(step / 16) % 4; // 4-bar minor/Phrygian rave cycle: Em -> Em -> C/D -> F/Em
    const stepInBar = step % 16;
    const isDrop = step >= 64;

    // E minor / E Phrygian note frequencies (Hz)
    const C2 = 65.41;
    const D2 = 73.42;
    const E2 = 82.41;
    const F2 = 87.31;
    const G2 = 98.0;
    const A2 = 110.0;
    const C3 = 130.81;
    const D3 = 146.83;
    const E3 = 164.81;
    const F3 = 174.61;
    const C4 = 261.63;
    const D4 = 293.66;
    const E4 = 329.63;
    const F4 = 349.23;
    const G4 = 392.0;
    const A4 = 440.0;
    const B4 = 493.88;
    const C5 = 523.25;
    const D5 = 587.33;
    const E5 = 659.25;
    const F5 = 698.46;
    const G5 = 783.99;
    const A5 = 880.0;
    const B5 = 987.77;
    const C6 = 1046.5;
    const D6 = 1174.66;
    const E6 = 1318.51;

    // 1. Gritty 8-bit syncopated rave bassline (square + detuned sawtooth through resonant lowpass)
    // Pattern codes: 0 = rest, 1 = root, 2 = octave punch, 3 = Phrygian tension note
    const bassPattern = [1, 0, 1, 2, 0, 1, 3, 0, 1, 0, 2, 0, 1, 0, 3, 2];
    const bassCode = bassPattern[stepInBar];
    if (bassCode > 0) {
      let bRoot = E2;
      let bOct = E3;
      let bTension = F2;
      if (bar === 1) {
        bRoot = E2;
        bOct = E3;
        bTension = G2;
      } else if (bar === 2) {
        if (stepInBar < 8) {
          bRoot = C2;
          bOct = C3;
          bTension = G2;
        } else {
          bRoot = D2;
          bOct = D3;
          bTension = A2;
        }
      } else if (bar === 3) {
        if (stepInBar < 8) {
          bRoot = F2;
          bOct = F3;
          bTension = C3;
        } else {
          bRoot = E2;
          bOct = E3;
          bTension = F2;
        }
      }

      const bFreq = bassCode === 1 ? bRoot : bassCode === 2 ? bOct : bTension;
      const bOsc = this.ctx.createOscillator();
      const bGrit = this.ctx.createOscillator();
      const filt = this.ctx.createBiquadFilter();
      const bGain = this.ctx.createGain();

      bOsc.type = 'square';
      bOsc.frequency.setValueAtTime(bFreq, now);
      bGrit.type = 'sawtooth';
      bGrit.frequency.setValueAtTime(bFreq * 1.005, now);

      filt.type = 'lowpass';
      filt.Q.value = 3.2;
      filt.frequency.setValueAtTime(this.musicIntense ? 1150 : 960, now);
      filt.frequency.exponentialRampToValueAtTime(240, now + dur * 1.35);

      bGain.gain.setValueAtTime(0.001, now);
      bGain.gain.linearRampToValueAtTime(0.105, now + 0.005);
      bGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 1.45);

      bOsc.connect(filt);
      bGrit.connect(filt);
      filt.connect(bGain);
      bGain.connect(this.musicGain);

      bOsc.start(now);
      bGrit.start(now);
      bOsc.stop(now + dur * 1.5);
      bGrit.stop(now + dur * 1.5);
    }

    // 2. Aggressive 8-bit square/pulse lead riff with dark Phrygian tension & octave punches (8 bars = 128 steps)
    const leadRiff: number[] = [
      // Bar 0 (Em / Phrygian hammer)
      E5, 0, E5, F5, 0, E5, E4, 0, G5, 0, F5, E5, 0, D5, E5, 0,
      // Bar 1 (syncopated octave stab + flat-2 menace)
      E5, 0, E4, E5, 0, F5, G5, 0, F5, 0, E5, D5, 0, B4, E5, F5,
      // Bar 2 (C -> D driving rave climb)
      G5, 0, G5, A5, 0, G5, E5, 0, A5, 0, G5, F5, 0, D5, F5, G5,
      // Bar 3 (F -> Em Phrygian turnaround)
      F5, 0, F5, G5, 0, F5, E5, 0, D5, 0, E5, F5, 0, E5, E4, 0,
      // Bar 4 (Drop: screaming octave punches)
      E5, E6, 0, F5, 0, E5, E4, E5, G5, 0, F5, E5, B5, 0, E5, 0,
      // Bar 5 (Drop: relentless 16th chiptune rave riff)
      E5, 0, E6, F5, 0, G5, F5, E5, B5, 0, A5, G5, F5, 0, E5, F5,
      // Bar 6 (Drop: high C -> D climax)
      C6, 0, G5, A5, 0, G5, E5, G5, D6, 0, A5, G5, F5, 0, A5, G5,
      // Bar 7 (Drop: Phrygian descent & tension build)
      F5, F5, 0, G5, A5, 0, F5, E5, E6, 0, D6, C6, B5, 0, G5, F5,
    ];
    const lFreq = leadRiff[step % leadRiff.length];
    if (lFreq > 0) {
      const lOsc = this.ctx.createOscillator();
      const lPunch = this.ctx.createOscillator();
      const lFilt = this.ctx.createBiquadFilter();
      const lGain = this.ctx.createGain();
      const punchGain = this.ctx.createGain();
      const lDur = dur * 1.45;
      const isOctaveAccent = stepInBar === 0 || stepInBar === 6 || stepInBar === 8 || stepInBar === 12;

      lOsc.type = 'square';
      lOsc.frequency.setValueAtTime(lFreq, now);

      // Pulse-detune or octave-punch layer for raw 8-bit rave bite
      lPunch.type = 'square';
      const punchFreq =
        isOctaveAccent && (isDrop || this.musicIntense)
          ? lFreq >= 880
            ? lFreq * 0.5
            : lFreq * 2
          : lFreq * 1.007;
      lPunch.frequency.setValueAtTime(punchFreq, now);
      punchGain.gain.setValueAtTime(isOctaveAccent ? 0.45 : 0.3, now);

      lFilt.type = 'lowpass';
      lFilt.frequency.setValueAtTime(this.musicIntense ? 5200 : 4200, now);
      lFilt.frequency.exponentialRampToValueAtTime(1500, now + lDur);

      const peak = this.musicIntense ? 0.068 : isDrop ? 0.06 : 0.052;
      lGain.gain.setValueAtTime(0.001, now);
      lGain.gain.linearRampToValueAtTime(peak, now + 0.004);
      lGain.gain.exponentialRampToValueAtTime(0.001, now + lDur);

      lOsc.connect(lFilt);
      lPunch.connect(punchGain);
      punchGain.connect(lFilt);
      lFilt.connect(lGain);
      lGain.connect(this.musicGain);

      lOsc.start(now);
      lPunch.start(now);
      lOsc.stop(now + lDur + 0.01);
      lPunch.stop(now + lDur + 0.01);
    }

    // 3. Rave Power-Chord Stabs (dark minor/Phrygian 8-bit stabs)
    const stabHit =
      (stepInBar === 0 && (bar === 0 || bar === 2)) ||
      (stepInBar === 6 && (bar === 1 || isDrop)) ||
      (stepInBar === 10 && (bar === 2 || isDrop)) ||
      (stepInBar === 12 && bar === 3 && (isDrop || this.musicIntense));
    if (stabHit) {
      let stabNotes: [number, number, number] = [E4, B4, E5];
      if (bar === 1) {
        stabNotes = [E4, G4, B4];
      } else if (bar === 2) {
        stabNotes = stepInBar < 8 ? [C4, G4, C5] : [D4, A4, D5];
      } else if (bar === 3) {
        stabNotes = stepInBar < 8 ? [F4, C5, F5] : [E4, B4, E5];
      }

      const sDur = dur * 1.85;
      const sFilt = this.ctx.createBiquadFilter();
      sFilt.type = 'lowpass';
      sFilt.Q.value = 2.2;
      sFilt.frequency.setValueAtTime(isDrop || this.musicIntense ? 3100 : 2500, now);
      sFilt.frequency.exponentialRampToValueAtTime(720, now + sDur);

      const sGain = this.ctx.createGain();
      sGain.gain.setValueAtTime(0.001, now);
      sGain.gain.linearRampToValueAtTime(isDrop || this.musicIntense ? 0.042 : 0.034, now + 0.006);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + sDur);

      sFilt.connect(sGain);
      sGain.connect(this.musicGain);

      for (const freq of stabNotes) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.connect(sFilt);
        osc.start(now);
        osc.stop(now + sDur + 0.015);
      }
    }

    // 4. 8-bit Rave Siren Accents (risers into drop + drop-down alerts)
    const isRisingSiren = step === 60 || step === 124;
    const isDropSiren = step === 64 || (this.musicIntense && step === 96);
    if (isRisingSiren || isDropSiren) {
      const sirenOsc = this.ctx.createOscillator();
      const sirenFilt = this.ctx.createBiquadFilter();
      const sirenGain = this.ctx.createGain();
      const sirenDur = dur * (isRisingSiren ? 3.8 : 3.0);

      sirenOsc.type = 'square';
      if (isRisingSiren) {
        sirenOsc.frequency.setValueAtTime(440, now);
        sirenOsc.frequency.exponentialRampToValueAtTime(1318.51, now + sirenDur);
      } else {
        sirenOsc.frequency.setValueAtTime(1318.51, now);
        sirenOsc.frequency.exponentialRampToValueAtTime(659.25, now + sirenDur);
      }

      sirenFilt.type = 'bandpass';
      sirenFilt.frequency.setValueAtTime(1350, now);
      sirenFilt.Q.value = 2.4;

      sirenGain.gain.setValueAtTime(0.001, now);
      sirenGain.gain.linearRampToValueAtTime(0.032, now + 0.015);
      sirenGain.gain.exponentialRampToValueAtTime(0.001, now + sirenDur);

      sirenOsc.connect(sirenFilt);
      sirenFilt.connect(sirenGain);
      sirenGain.connect(this.musicGain);

      sirenOsc.start(now);
      sirenOsc.stop(now + sirenDur + 0.015);
    }

    // 5. Punchy Syncopated Breakbeat Drums
    // Breakbeat Kick: driving syncopated hits on 0, 10, plus 6 / 2 / turnaround 14
    const kickHit =
      stepInBar === 0 ||
      stepInBar === 10 ||
      (stepInBar === 6 && (bar % 2 === 1 || isDrop || this.musicIntense)) ||
      (stepInBar === 2 && isDrop && bar % 2 === 0) ||
      (stepInBar === 14 && bar === 3);
    if (kickHit) {
      const kOsc = this.ctx.createOscillator();
      const kGain = this.ctx.createGain();
      kOsc.type = 'sine';
      kOsc.frequency.setValueAtTime(165, now);
      kOsc.frequency.exponentialRampToValueAtTime(38, now + 0.095);
      kGain.gain.setValueAtTime(0.18, now);
      kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.115);
      kOsc.connect(kGain);
      kGain.connect(this.musicGain);
      kOsc.start(now);
      kOsc.stop(now + 0.12);

      // 8-bit kick punch click
      const clickOsc = this.ctx.createOscillator();
      const clickGain = this.ctx.createGain();
      clickOsc.type = 'square';
      clickOsc.frequency.setValueAtTime(240, now);
      clickOsc.frequency.exponentialRampToValueAtTime(80, now + 0.018);
      clickGain.gain.setValueAtTime(0.055, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
      clickOsc.connect(clickGain);
      clickGain.connect(this.musicGain);
      clickOsc.start(now);
      clickOsc.stop(now + 0.022);
    }

    // Snappy 8-bit Breakbeat Snare (hard backbeat on 4 & 12 + ghost/fill snares)
    const isMainSnare = stepInBar === 4 || stepInBar === 12;
    const isFillSnare =
      (isDrop && bar === 3 && (stepInBar === 13 || stepInBar === 14 || stepInBar === 15)) ||
      (stepInBar === 7 && (bar % 2 === 1 || isDrop)) ||
      (stepInBar === 15 && (bar === 1 || bar === 3));
    if (isMainSnare) {
      this.playNoiseBurst(0.095, 2100, 0.105, this.musicGain, 'bandpass', 0, 1.1);
      const sOsc = this.ctx.createOscillator();
      const sGain = this.ctx.createGain();
      sOsc.type = 'triangle';
      sOsc.frequency.setValueAtTime(235, now);
      sOsc.frequency.exponentialRampToValueAtTime(110, now + 0.048);
      sGain.gain.setValueAtTime(0.07, now);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.052);
      sOsc.connect(sGain);
      sGain.connect(this.musicGain);
      sOsc.start(now);
      sOsc.stop(now + 0.056);
    } else if (isFillSnare) {
      this.playNoiseBurst(0.05, 2600, 0.055, this.musicGain, 'bandpass', 0, 1.4);
    }

    // Crisp 8-bit Hi-Hats (open off-beat sizzle + driving 8th/16th closed hats)
    if (stepInBar % 4 === 2) {
      this.playNoiseBurst(0.045, 7800, 0.042, this.musicGain, 'highpass');
    } else if (stepInBar % 4 === 0) {
      this.playNoiseBurst(0.022, 9000, 0.028, this.musicGain, 'highpass');
    } else if (isDrop || this.musicIntense) {
      this.playNoiseBurst(0.018, 9600, 0.022, this.musicGain, 'highpass');
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
    filterType: BiquadFilterType = 'bandpass',
    delay = 0,
    q?: number
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
    if (q !== undefined) {
      filt.Q.value = q;
    }
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime + delay;
    g.gain.setValueAtTime(gainPeak, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filt);
    filt.connect(g);
    g.connect(target);
    src.start(now);
    src.stop(now + duration + 0.01);
  }

  private preloadGruntSound(): Promise<void> {
    if (!this.ctx || typeof fetch === 'undefined') {
      return Promise.resolve();
    }
    if (this.gruntBuffer) {
      return Promise.resolve();
    }
    if (this.gruntLoadPromise) {
      return this.gruntLoadPromise;
    }
    const ctx = this.ctx;
    this.gruntLoadPromise = (async () => {
      try {
        const res = await fetch(PIG_GRUNT_URL);
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        this.gruntBuffer = await ctx.decodeAudioData(arr);
      } catch {
        // Ignore asset fetch/decode errors
      } finally {
        if (!this.gruntBuffer) {
          this.gruntLoadPromise = null;
        }
      }
    })();
    return this.gruntLoadPromise;
  }

  /**
   * Plays the pig grunt ("chrumknięcie") clip (`audio/pig.m4a`) when nitro ends.
   * Safe no-op when audio context or SFX bus is unavailable.
   */
  playGrunt(): void {
    if (!this.ctx || !this.sfxGain) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume?.().catch(() => {});
    }
    const reqSeq = ++this.gruntRequestSeq;
    const startBuffer = (buffer: AudioBuffer) => {
      if (!this.ctx || !this.sfxGain || reqSeq !== this.gruntRequestSeq) return;
      if (this.gruntSource) {
        try {
          this.gruntSource.stop();
        } catch {
          // Ignore if already stopped
        }
        this.gruntSource = null;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.sfxGain);
      src.onended = () => {
        if (this.gruntSource === src) {
          this.gruntSource = null;
        }
      };
      this.gruntSource = src;
      src.start();
    };

    if (this.gruntBuffer) {
      startBuffer(this.gruntBuffer);
      return;
    }
    void this.preloadGruntSound().then(() => {
      if (this.gruntBuffer) {
        startBuffer(this.gruntBuffer);
      }
    });
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
