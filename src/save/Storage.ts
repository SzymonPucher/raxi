import { QualityPresetName } from '../core/config/graphics';
import { DEFAULT_KEY_BINDINGS, KeyBindings, cloneBindings } from '../input/bindings';
import { MapId } from '../world/MapRegistry';

export interface GameSettings {
  masterVolume: number; // 0..1
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  graphicsPreset: QualityPresetName;
  resolutionScale: number; // 0.5..1.0
  cameraShake: boolean;
  speedUnits: 'kmh' | 'mph';
  showControls: boolean;
  navPointNearestPassenger: boolean;
  selectedMap: MapId;
}

export interface HighScoreEntry {
  score: number;
  deliveries: number;
  seed: number;
  date: string;
  timeSurvived: number;
  mapId?: MapId;
}

export interface PersistentStats {
  shifts: number;
  totalDeliveries: number;
  bestScore: number;
}

export interface SaveDataV1 {
  version: 1;
  settings: GameSettings;
  highScores: HighScoreEntry[];
  stats: PersistentStats;
  bindings: KeyBindings;
}

const STORAGE_KEY = 'raxi.v1';

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  musicVolume: 0.45,
  sfxVolume: 0.85,
  graphicsPreset: 'medium',
  resolutionScale: 1.0,
  cameraShake: true,
  speedUnits: 'kmh',
  showControls: true,
  navPointNearestPassenger: true,
  selectedMap: 'raxi_city',
};

export function createDefaultSave(): SaveDataV1 {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    highScores: [],
    stats: {
      shifts: 0,
      totalDeliveries: 0,
      bestScore: 0,
    },
    bindings: cloneBindings(DEFAULT_KEY_BINDINGS),
  };
}

export class Storage {
  private data: SaveDataV1;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveDataV1 {
    const def = createDefaultSave();
    if (typeof localStorage === 'undefined') return def;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return def;
      const parsed = JSON.parse(raw) as Partial<SaveDataV1>;
      if (!parsed || typeof parsed !== 'object') return def;

      const settings: GameSettings = {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings ?? {}),
      };
      if (!['low', 'medium', 'high'].includes(settings.graphicsPreset)) {
        settings.graphicsPreset = 'medium';
      }
      settings.selectedMap = sanitizeMapId(settings.selectedMap);
      settings.masterVolume = clamp01(settings.masterVolume);
      settings.musicVolume = clamp01(settings.musicVolume);
      settings.sfxVolume = clamp01(settings.sfxVolume);
      settings.resolutionScale = Math.max(0.5, Math.min(1.0, Number(settings.resolutionScale) || 1));

      const highScores = Array.isArray(parsed.highScores)
        ? parsed.highScores
            .filter(
              (h): h is HighScoreEntry =>
                Boolean(h) && typeof h.score === 'number' && Number.isFinite(h.score)
            )
            .map((h) => ({
              ...h,
              ...(h.mapId !== undefined ? { mapId: sanitizeMapId(h.mapId) } : {}),
            }))
            .slice(0, 10)
        : [];

      const stats: PersistentStats = {
        shifts: Number(parsed.stats?.shifts) || 0,
        totalDeliveries: Number(parsed.stats?.totalDeliveries) || 0,
        bestScore: Number(parsed.stats?.bestScore) || 0,
      };

      const bindings = {
        ...cloneBindings(DEFAULT_KEY_BINDINGS),
        ...(parsed.bindings ?? {}),
      };

      return {
        version: 1,
        settings,
        highScores,
        stats,
        bindings,
      };
    } catch {
      return def;
    }
  }

  save(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore storage quota errors
    }
  }

  get settings(): GameSettings {
    return this.data.settings;
  }

  updateSettings(patch: Partial<GameSettings>): void {
    Object.assign(this.data.settings, patch);
    this.save();
  }

  get highScores(): readonly HighScoreEntry[] {
    return this.data.highScores;
  }

  get stats(): PersistentStats {
    return this.data.stats;
  }

  get bindings(): KeyBindings {
    return this.data.bindings;
  }

  recordShift(entry: Omit<HighScoreEntry, 'date'>): { isNewBest: boolean; rank: number } {
    const score = Math.round(entry.score);
    const prevBest = this.data.stats.bestScore;
    this.data.stats.shifts += 1;
    this.data.stats.totalDeliveries += entry.deliveries;
    if (score > this.data.stats.bestScore) {
      this.data.stats.bestScore = score;
    }

    const fullEntry: HighScoreEntry = {
      score,
      deliveries: entry.deliveries,
      seed: entry.seed,
      timeSurvived: Math.round(entry.timeSurvived),
      date: new Date().toISOString().slice(0, 10),
      ...(entry.mapId ? { mapId: sanitizeMapId(entry.mapId) } : {}),
    };

    this.data.highScores.push(fullEntry);
    this.data.highScores.sort((a, b) => b.score - a.score);
    this.data.highScores = this.data.highScores.slice(0, 10);
    const rank = this.data.highScores.indexOf(fullEntry) + 1;
    this.save();

    return { isNewBest: score > prevBest && score > 0, rank };
  }
}

function clamp01(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.8;
  return Math.max(0, Math.min(1, n));
}

function sanitizeMapId(v: unknown): MapId {
  return v === 'mikolow' ? 'mikolow' : 'raxi_city';
}
