import { describe, expect, it, vi } from 'vitest';
import { AudioManager, PIG_GRUNT_URL } from '../src/audio/AudioManager';
import { EngineSound } from '../src/audio/EngineSound';

interface ParamCall {
  method: 'setValueAtTime' | 'linearRampToValueAtTime' | 'exponentialRampToValueAtTime' | 'setTargetAtTime';
  value: number;
  time: number;
  timeConstant?: number;
}

class FakeAudioParam {
  public value: number;
  public calls: ParamCall[] = [];

  constructor(initial = 0) {
    this.value = initial;
  }

  setValueAtTime(value: number, time: number): void {
    expect(Number.isFinite(value)).toBe(true);
    expect(Number.isFinite(time)).toBe(true);
    this.value = value;
    this.calls.push({ method: 'setValueAtTime', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    expect(Number.isFinite(value)).toBe(true);
    expect(Number.isFinite(time)).toBe(true);
    this.value = value;
    this.calls.push({ method: 'linearRampToValueAtTime', value, time });
  }

  exponentialRampToValueAtTime(value: number, time: number): void {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
    expect(Number.isFinite(time)).toBe(true);
    this.value = value;
    this.calls.push({ method: 'exponentialRampToValueAtTime', value, time });
  }

  setTargetAtTime(value: number, time: number, timeConstant: number): void {
    expect(Number.isFinite(value)).toBe(true);
    expect(Number.isFinite(time)).toBe(true);
    expect(timeConstant).toBeGreaterThan(0);
    this.value = value;
    this.calls.push({ method: 'setTargetAtTime', value, time, timeConstant });
  }
}

class FakeNode {
  public connectedTo: unknown[] = [];

  connect(dest: unknown): void {
    this.connectedTo.push(dest);
  }
}

class FakeGainNode extends FakeNode {
  public gain = new FakeAudioParam(1);
}

class FakeBiquadFilterNode extends FakeNode {
  public type: BiquadFilterType = 'lowpass';
  public frequency = new FakeAudioParam(350);
  public Q = new FakeAudioParam(1);
}

class FakeOscillatorNode extends FakeNode {
  public type: OscillatorType = 'sine';
  public frequency = new FakeAudioParam(440);
  public startedAt: number | null = null;
  public stoppedAt: number | null = null;

  start(when = 0): void {
    this.startedAt = when;
  }

  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

class FakeBufferSourceNode extends FakeNode {
  public buffer: AudioBuffer | null = null;
  public loop = false;
  public startedAt: number | null = null;
  public stoppedAt: number | null = null;
  public onended: (() => void) | null = null;

  start(when = 0): void {
    this.startedAt = when;
  }

  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

function createFakeAudioContext() {
  const oscillators: FakeOscillatorNode[] = [];
  const filters: FakeBiquadFilterNode[] = [];
  const gains: FakeGainNode[] = [];
  const bufferSources: FakeBufferSourceNode[] = [];
  const destination = new FakeNode();

  const ctx = {
    state: 'running' as AudioContextState,
    currentTime: 1.0,
    sampleRate: 44100,
    destination,
    resume: async () => {
      ctx.state = 'running';
    },
    createOscillator: () => {
      const node = new FakeOscillatorNode();
      oscillators.push(node);
      return node;
    },
    createBiquadFilter: () => {
      const node = new FakeBiquadFilterNode();
      filters.push(node);
      return node;
    },
    createGain: () => {
      const node = new FakeGainNode();
      gains.push(node);
      return node;
    },
    createBuffer: (_channels: number, length: number, sampleRate: number) => {
      const data = new Float32Array(length);
      return {
        length,
        sampleRate,
        numberOfChannels: 1,
        getChannelData: () => data,
      } as unknown as AudioBuffer;
    },
    createBufferSource: () => {
      const node = new FakeBufferSourceNode();
      bufferSources.push(node);
      return node;
    },
  };

  return {
    ctx: ctx as unknown as AudioContext,
    rawCtx: ctx,
    destination: destination as unknown as AudioNode,
    oscillators,
    filters,
    gains,
    bufferSources,
  };
}

describe('EngineSound', () => {
  it('safely no-ops when update is called before start or with null AudioContext', () => {
    const engine = new EngineSound();
    expect(() =>
      engine.update({
        ctx: null,
        speed: 30,
        throttle: 1,
        slip: 0.5,
        boosting: true,
        condition: 100,
        active: true,
        dt: 0.016,
      })
    ).not.toThrow();

    const fake = createFakeAudioContext();
    engine.start(fake.ctx, fake.destination);
    expect(() =>
      engine.update({
        ctx: null,
        speed: 30,
        throttle: 1,
        slip: 0.5,
        boosting: true,
        condition: 100,
        active: true,
        dt: 0.016,
      })
    ).not.toThrow();
  });

  it('sets up deep big-exhaust lowpass-filtered boost oscillators and rumble noise', () => {
    const fake = createFakeAudioContext();
    const engine = new EngineSound();
    engine.start(fake.ctx, fake.destination);
    // Calling start twice must be idempotent
    const oscCountAfterStart = fake.oscillators.length;
    engine.start(fake.ctx, fake.destination);
    expect(fake.oscillators.length).toBe(oscCountAfterStart);

    // Expect 4 oscillators: engine main + engine sub + boost main (sawtooth) + boost sub (triangle)
    expect(fake.oscillators.length).toBe(4);
    const boostOsc = fake.oscillators[2];
    const boostSubOsc = fake.oscillators[3];
    expect(boostOsc.type).toBe('sawtooth');
    expect(boostSubOsc.type).toBe('triangle');
    expect(boostOsc.frequency.value).toBeLessThanOrEqual(120);
    expect(boostSubOsc.frequency.value).toBeLessThanOrEqual(65);

    // Expect warm lowpass filter for boost oscillators and lowpass filter for boost rumble noise
    const lowpassFilters = fake.filters.filter((f) => f.type === 'lowpass');
    expect(lowpassFilters.length).toBe(3); // engineFilter, boostFilter, boostNoiseFilter
    const boostFilter = lowpassFilters[1];
    const boostNoiseFilter = lowpassFilters[2];

    expect(boostOsc.connectedTo).toContain(boostFilter);
    expect(boostSubOsc.connectedTo).toContain(boostFilter);

    // Two looping noise sources: boost rumble noise + tire screech
    expect(fake.bufferSources.length).toBe(2);
    expect(fake.bufferSources[0].loop).toBe(true);
    expect(fake.bufferSources[0].connectedTo).toContain(boostNoiseFilter);
    expect(fake.bufferSources[0].startedAt).not.toBeNull();
  });

  it('engages deep low-frequency nitro roar when boosting and fades cleanly to 0 when off or inactive', () => {
    const fake = createFakeAudioContext();
    const engine = new EngineSound();
    engine.start(fake.ctx, fake.destination);

    const boostOsc = fake.oscillators[2];
    const boostSubOsc = fake.oscillators[3];
    const boostFilter = fake.filters[1];
    const boostNoiseFilter = fake.filters[2];
    const boostGain = fake.gains[1];
    const boostNoiseGain = fake.gains[2];
    const engineGain = fake.gains[0];
    const screechGain = fake.gains[3];

    // Engage boost at high speed
    engine.update({
      ctx: fake.ctx,
      speed: 45, // ~162 km/h
      throttle: 1,
      slip: 0.1,
      boosting: true,
      condition: 100,
      active: true,
      dt: 0.016,
    });

    // Verify frequencies stay deep (no high-pitched whine)
    expect(boostOsc.frequency.value).toBeGreaterThanOrEqual(50);
    expect(boostOsc.frequency.value).toBeLessThanOrEqual(120);
    expect(boostSubOsc.frequency.value).toBeGreaterThanOrEqual(30);
    expect(boostSubOsc.frequency.value).toBeLessThanOrEqual(65);
    expect(boostFilter.frequency.value).toBeLessThan(450);
    expect(boostNoiseFilter.frequency.value).toBeLessThan(400);

    // Both boost tone and rumble noise gains engage smoothly above 0
    expect(boostGain.gain.value).toBeGreaterThan(0.08);
    expect(boostNoiseGain.gain.value).toBeGreaterThan(0.05);

    const punchGain = boostGain.gain.value;

    // Advance several frames while boosting -> punch decays & burble modulates smoothly
    for (let i = 0; i < 15; i++) {
      fake.rawCtx.currentTime += 0.02;
      engine.update({
        ctx: fake.ctx,
        speed: 45,
        throttle: 1,
        slip: 0.1,
        boosting: true,
        condition: 100,
        active: true,
        dt: 0.02,
      });
    }
    expect(boostGain.gain.value).toBeGreaterThan(0.08);
    expect(boostGain.gain.value).toBeLessThan(punchGain);

    // Stop boosting -> fades cleanly to 0
    fake.rawCtx.currentTime += 0.02;
    engine.update({
      ctx: fake.ctx,
      speed: 45,
      throttle: 0.8,
      slip: 0.1,
      boosting: false,
      condition: 100,
      active: true,
      dt: 0.02,
    });
    expect(boostGain.gain.value).toBe(0);
    expect(boostNoiseGain.gain.value).toBe(0);

    // Re-engage boost then deactivate engine -> all channels fade cleanly to 0
    fake.rawCtx.currentTime += 0.02;
    engine.update({
      ctx: fake.ctx,
      speed: 35,
      throttle: 1,
      slip: 0.8,
      boosting: true,
      condition: 30,
      active: true,
      dt: 0.02,
    });
    expect(boostGain.gain.value).toBeGreaterThan(0);

    fake.rawCtx.currentTime += 0.02;
    engine.update({
      ctx: fake.ctx,
      speed: 35,
      throttle: 1,
      slip: 0.8,
      boosting: true,
      condition: 30,
      active: false,
      dt: 0.02,
    });
    expect(engineGain.gain.value).toBe(0);
    expect(boostGain.gain.value).toBe(0);
    expect(boostNoiseGain.gain.value).toBe(0);
    expect(screechGain.gain.value).toBe(0);
  });
});

describe('AudioManager playGrunt & 8-bit chiptune breakbeat music', () => {
  it('safely no-ops in headless Node when AudioContext is absent or uninitialized', () => {
    const audio = new AudioManager();
    expect(() => audio.unlock()).not.toThrow();
    expect(() => audio.playGrunt()).not.toThrow();
    expect(() => audio.setMusicState(true, false)).not.toThrow();
    expect(() => audio.setVolumes(0.7, 0.5, 0.9)).not.toThrow();
    expect(() =>
      audio.update(0.2, {
        speed: 20,
        throttle: 0.7,
        slip: 0.2,
        boosting: true,
        condition: 90,
        active: true,
      })
    ).not.toThrow();
  });

  it('loads and plays audio/pig.m4a through sfxGain when playGrunt is called', async () => {
    expect(PIG_GRUNT_URL).toContain('pig.m4a');

    const fake = createFakeAudioContext();
    const audio = new AudioManager();
    const sfxGain = fake.ctx.createGain() as unknown as FakeGainNode;
    const decodedBuf = fake.ctx.createBuffer(1, 22050, 44100);
    const decodeAudioData = vi.fn(async () => decodedBuf);
    (fake.rawCtx as unknown as { decodeAudioData: typeof decodeAudioData }).decodeAudioData =
      decodeAudioData;

    const priv = audio as any;
    priv.ctx = fake.ctx;
    priv.sfxGain = sfxGain;

    const origFetch = globalThis.fetch;
    const mockFetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16),
    }));
    (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

    try {
      // First play triggers lazy fetch + decode of pig.m4a and plays it
      audio.playGrunt();
      await vi.waitFor(() => {
        expect(fake.bufferSources.length).toBe(1);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(PIG_GRUNT_URL);
      expect(decodeAudioData).toHaveBeenCalledTimes(1);
      expect(fake.bufferSources[0].buffer).toBe(decodedBuf);
      expect(fake.bufferSources[0].connectedTo).toContain(sfxGain);
      expect(fake.bufferSources[0].startedAt).not.toBeNull();
      expect(fake.oscillators.length).toBe(0);

      // Second play reuses cached buffer without refetching and stops previous source
      audio.playGrunt();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(fake.bufferSources.length).toBe(2);
      expect(fake.bufferSources[0].stoppedAt).not.toBeNull();
      expect(fake.bufferSources[1].buffer).toBe(decodedBuf);
      expect(fake.bufferSources[1].connectedTo).toContain(sfxGain);
      expect(fake.bufferSources[1].startedAt).not.toBeNull();
    } finally {
      (globalThis as unknown as { fetch: typeof origFetch }).fetch = origFetch;
    }
  });

  it('steps the 8-bit Prodigy Omen-style breakbeat sequencer at 140/152 BPM across all 128 steps', () => {
    const fake = createFakeAudioContext();
    const audio = new AudioManager();
    const musicGain = fake.ctx.createGain() as unknown as FakeGainNode;
    const sfxGain = fake.ctx.createGain() as unknown as FakeGainNode;

    const priv = audio as any;
    priv.ctx = fake.ctx;
    priv.musicGain = musicGain;
    priv.sfxGain = sfxGain;
    priv.noiseBuffer = fake.ctx.createBuffer(1, 44100, 44100);

    const idleEngine = {
      speed: 0,
      throttle: 0,
      slip: 0,
      boosting: false,
      condition: 100,
      active: false,
    };

    // Music stopped -> should not step or create nodes
    audio.setMusicState(false, false);
    audio.update(0.15, idleEngine);
    expect(priv.musicStep).toBe(0);
    expect(fake.oscillators.length).toBe(0);

    // Normal tempo: 140 BPM -> stepDur = 60 / 140 / 4 ~= 0.10714s
    audio.setMusicState(true, false);
    audio.update(0.1, idleEngine);
    expect(priv.musicStep).toBe(0); // 0.10s < 0.10714s
    audio.update(0.01, idleEngine);
    expect(priv.musicStep).toBe(1); // 0.11s >= 0.10714s

    // Intense tempo: 152 BPM -> stepDur = 60 / 152 / 4 ~= 0.09868s
    priv.musicTimer = 0;
    audio.setMusicState(true, true);
    audio.update(0.1, idleEngine);
    expect(priv.musicStep).toBe(2); // 0.10s >= 0.09868s

    // Step through the remaining 126 steps to cover the full 128-step (8-bar) cycle and wrap to 0
    for (let i = 0; i < 126; i++) {
      fake.rawCtx.currentTime += 0.1;
      audio.update(0.1, idleEngine);
    }
    expect(priv.musicStep).toBe(0);

    // Verify 8-bit chiptune & breakbeat characteristics were synthesized
    const squareOscs = fake.oscillators.filter((o) => o.type === 'square');
    const sawOscs = fake.oscillators.filter((o) => o.type === 'sawtooth');
    const sineOscs = fake.oscillators.filter((o) => o.type === 'sine');
    expect(squareOscs.length).toBeGreaterThan(60); // 8-bit lead + bass + kick clicks + sirens
    expect(sawOscs.length).toBeGreaterThan(40); // bass grit + rave stabs
    expect(sineOscs.length).toBeGreaterThan(15); // breakbeat kicks

    // Verify bandpass (snare + rave sirens) and highpass (hi-hats) filters were used
    const bandpassFilters = fake.filters.filter((f) => f.type === 'bandpass');
    const highpassFilters = fake.filters.filter((f) => f.type === 'highpass');
    expect(bandpassFilters.length).toBeGreaterThan(15);
    expect(highpassFilters.length).toBeGreaterThan(40);

    // Every created oscillator must be started and stopped cleanly
    for (const osc of fake.oscillators) {
      expect(osc.startedAt).not.toBeNull();
      expect(osc.stoppedAt).not.toBeNull();
      expect(osc.stoppedAt!).toBeGreaterThan(osc.startedAt!);
    }
  });
});
