import { describe, expect, it } from 'vitest';
import { AudioManager } from '../src/audio/AudioManager';
import { Rng } from '../src/core/Rng';
import { createActiveFare } from '../src/gameplay/Fare';
import { PASSENGER_TYPES } from '../src/gameplay/Passenger';
import { Shift } from '../src/gameplay/Shift';
import { SpecialFareTracker } from '../src/gameplay/SpecialFareTracker';
import { DEFAULT_SETTINGS, Storage } from '../src/save/Storage';

describe('SpecialFareTracker & settings', () => {
  it('is disabled by default in DEFAULT_SETTINGS', () => {
    expect(DEFAULT_SETTINGS.specialFareSounds).toBe(false);
    const storage = new Storage();
    expect(storage.settings.specialFareSounds).toBe(false);
  });

  it('never picks the special fare when feature is disabled', () => {
    const tracker = new SpecialFareTracker();
    for (let i = 0; i < 10; i++) {
      expect(tracker.rollForPickup(false, () => 0.0)).toBe(false);
    }
  });

  it('cannot appear as the first fare of a shift', () => {
    const tracker = new SpecialFareTracker();
    expect(tracker.rollForPickup(true, () => 0.0)).toBe(false);
    expect(tracker.rollForPickup(true, () => 0.0)).toBe(true);
  });

  it('cannot appear twice in a row even when subsequent rolls succeed', () => {
    const tracker = new SpecialFareTracker();
    // 1st fare: ineligible
    expect(tracker.rollForPickup(true, () => 0.1)).toBe(false);
    // 2nd fare: eligible & succeeds
    expect(tracker.rollForPickup(true, () => 0.1)).toBe(true);
    // 3rd fare: ineligible because previous was special
    expect(tracker.rollForPickup(true, () => 0.1)).toBe(false);
    // 4th fare: eligible again & succeeds
    expect(tracker.rollForPickup(true, () => 0.1)).toBe(true);
  });

  it('picks special fare roughly 50% of the time on eligible pickups', () => {
    const rng = new Rng(98765);
    const tracker = new SpecialFareTracker();
    // Consume first fare
    expect(tracker.rollForPickup(true, rng)).toBe(false);

    let eligible = 0;
    let picked = 0;
    for (let i = 0; i < 2000; i++) {
      const wasPrevSpecial = tracker.lastWasSpecial;
      const res = tracker.rollForPickup(true, rng);
      if (wasPrevSpecial) {
        expect(res).toBe(false);
      } else {
        eligible++;
        if (res) picked++;
      }
    }
    const rate = picked / eligible;
    expect(rate).toBeGreaterThan(0.44);
    expect(rate).toBeLessThan(0.56);
  });

  it('resets state across shifts', () => {
    const shift = new Shift();
    shift.reset(100);
    expect(shift.specialFare.rollForPickup(true, () => 0.0)).toBe(false);
    expect(shift.specialFare.rollForPickup(true, () => 0.0)).toBe(true);

    shift.reset(101);
    expect(shift.specialFare.rollForPickup(true, () => 0.0)).toBe(false);
    expect(shift.specialFare.rollForPickup(true, () => 0.0)).toBe(true);
  });

  it('defaults ActiveFare.hasSpecialAudio to false and preserves true when passed', () => {
    const baseParams = {
      id: 'pax_1',
      passenger: PASSENGER_TYPES.regular,
      destinationName: 'Downtown',
      destinationX: 0,
      destinationY: 0,
      destinationZ: 100,
      tripCategory: 'short' as const,
      routeLength: 200,
      tier: 0,
      patienceStatMult: 1,
    };
    expect(createActiveFare(baseParams).hasSpecialAudio).toBe(false);
    expect(createActiveFare({ ...baseParams, hasSpecialAudio: true }).hasSpecialAudio).toBe(true);
  });
});

describe('AudioManager special fare clips', () => {
  it('selects accident_1 or accident_2, enforces cooldown, and plays client_exit when enabled', () => {
    const audio = new AudioManager();
    const played: string[] = [];

    const bufA1 = { tag: 'accident1' } as unknown as AudioBuffer;
    const bufA2 = { tag: 'accident2' } as unknown as AudioBuffer;
    const bufExit = { tag: 'clientExit' } as unknown as AudioBuffer;

    const fakeCtx = {
      state: 'running',
      currentTime: 0,
      sampleRate: 44100,
      resume: async () => {},
      createBufferSource: () => {
        const src: any = {
          buffer: null,
          connect: () => {},
          start: () => {
            played.push(src.buffer.tag);
          },
          stop: () => {},
          onended: null,
        };
        return src;
      },
    };
    const fakeGain = { gain: { setTargetAtTime: () => {} } };

    // Inject mock Web Audio state for unit testing without browser DOM
    const priv = audio as any;
    priv.ctx = fakeCtx;
    priv.sfxGain = fakeGain;
    priv.specialBuffers = {
      accident1: bufA1,
      accident2: bufA2,
      clientExit: bufExit,
    };

    // Disabled by default -> plays nothing
    audio.playSpecialAccident(() => 0.1);
    audio.playSpecialClientExit();
    expect(played).toEqual([]);

    // Enable feature
    audio.setSpecialSoundsEnabled(true);
    audio.playSpecialAccident(() => 0.1);
    expect(played).toEqual(['accident1']);

    // Cooldown prevents immediate double-trigger
    audio.playSpecialAccident(() => 0.9);
    expect(played).toEqual(['accident1']);

    // Advance dt past 0.45s cooldown -> plays accident2
    audio.update(0.5, {
      speed: 0,
      throttle: 0,
      slip: 0,
      boosting: false,
      condition: 100,
      active: true,
    });
    audio.playSpecialAccident(() => 0.9);
    expect(played).toEqual(['accident1', 'accident2']);

    // Destination exit clip
    audio.playSpecialClientExit();
    expect(played).toEqual(['accident1', 'accident2', 'clientExit']);
  });
});
