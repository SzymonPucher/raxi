import { GameEvents } from '../core/EventBus';
import { Rng } from '../core/Rng';
import { StatMod } from './StatSystem';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'cursed';
export type Tag = 'speed' | 'style' | 'safety' | 'time' | 'cash' | 'chaos' | 'handling';

export interface PowerCtx {
  addTime(seconds: number, reason?: string): void;
  subtractTime(seconds: number): void;
  addCash(amount: number): void;
  repairCar(pct: number): void;
  addStyle(points: number, label?: string): void;
  addStyleRating(ratingFraction: number, label?: string): void;
  activateStuntBoost(): void;
  showPopup(text: string, color?: string, big?: boolean): void;
  pushTrafficAround(radius: number, force: number): number;
  setGhost(enabled: boolean): void;
  setTimeScale(scale: number): void;
  setNitroActive(enabled: boolean): void;
  playNitroGrunt?(): void;
  hopCar(heightMeters: number): void;
  reduceActiveCooldowns(seconds: number): void;
  rng: Rng;
}

export type PowerHooks = Partial<{
  [E in keyof GameEvents]: (ctx: PowerCtx, ev: GameEvents[E], stacks: number) => void;
}>;

export interface PowerActiveDef {
  cooldown: number;
  duration: number;
  getDuration?(ctx: PowerCtx): number;
  onActivate(ctx: PowerCtx): void;
  onTick?(ctx: PowerCtx, dt: number): void;
  onEnd?(ctx: PowerCtx): void;
}

export interface PowerCurseDef {
  description: string;
  statMods?: StatMod[];
  hooks?: PowerHooks;
}

export interface PowerDef {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  tags: Tag[];
  maxStacks: number;
  icon: string;
  minTier?: number;
  statMods?: StatMod[];
  onAcquire?: (ctx: PowerCtx, newStacks: number) => void;
  curse?: PowerCurseDef;
  hooks?: PowerHooks;
  active?: PowerActiveDef;
}
