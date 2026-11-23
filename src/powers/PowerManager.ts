import { BALANCE } from '../core/config/balance';
import { GameEvents } from '../core/EventBus';
import { PowerRegistry, defaultPowerRegistry } from './PowerRegistry';
import { PowerCtx, PowerDef, Tag } from './PowerTypes';
import { StatSystem } from './StatSystem';

export interface OwnedPower {
  def: PowerDef;
  stacks: number;
  cleansed: boolean; // For cursed powers: true when Garage Cleanse disabled `curse`
}

export interface ActiveSlotState {
  powerId: string;
  def: PowerDef;
  cooldownRemaining: number;
  activeRemaining: number;
  isActive: boolean;
}

/**
 * Manages owned powers, stacks, active ability slots (max 2), curse cleansing,
 * StatSystem synchronization, and EventBus hook dispatch (§10).
 */
export class PowerManager {
  private owned = new Map<string, OwnedPower>();
  public activeSlots: Array<ActiveSlotState | null> = [null, null];
  public secondShiftConsumed = false;

  constructor(
    public readonly stats: StatSystem,
    public readonly registry: PowerRegistry = defaultPowerRegistry
  ) {}

  reset(): void {
    this.owned.clear();
    this.activeSlots = [null, null];
    this.secondShiftConsumed = false;
    this.stats.clearSources();
  }

  getOwnedList(): OwnedPower[] {
    return Array.from(this.owned.values());
  }

  getStacks(powerId: string): number {
    return this.owned.get(powerId)?.stacks ?? 0;
  }

  has(powerId: string): boolean {
    return this.getStacks(powerId) > 0;
  }

  isCurseActive(powerId: string): boolean {
    const o = this.owned.get(powerId);
    return Boolean(o && o.def.curse && !o.cleansed);
  }

  getOwnedCursedUncleansed(): OwnedPower[] {
    return this.getOwnedList().filter((o) => Boolean(o.def.curse && !o.cleansed));
  }

  getOwnedTags(): Set<Tag> {
    const tags = new Set<Tag>();
    for (const o of this.owned.values()) {
      for (const t of o.def.tags) tags.add(t);
    }
    return tags;
  }

  isMaxed(powerId: string): boolean {
    const def = this.registry.get(powerId);
    if (!def) return true;
    return this.getStacks(powerId) >= def.maxStacks;
  }

  needsActiveSlotReplacement(powerId: string): boolean {
    const def = this.registry.get(powerId);
    if (!def?.active) return false;
    if (this.activeSlots.some((s) => s?.powerId === powerId)) return false;
    return this.activeSlots.every((s) => s !== null);
  }

  acquire(
    powerId: string,
    ctx?: PowerCtx,
    replaceSlotIndex?: number
  ): { ok: boolean; stacks: number; error?: string } {
    const def = this.registry.get(powerId);
    if (!def) return { ok: false, stacks: 0, error: `Unknown power ${powerId}` };

    const existing = this.owned.get(powerId);
    if (existing && existing.stacks >= def.maxStacks) {
      return { ok: false, stacks: existing.stacks, error: 'Already maxed' };
    }

    // Active ability slot assignment (max 2)
    if (def.active && !this.activeSlots.some((s) => s?.powerId === powerId)) {
      let slotIdx = this.activeSlots.findIndex((s) => s === null);
      if (slotIdx === -1) {
        slotIdx =
          replaceSlotIndex !== undefined && replaceSlotIndex >= 0 && replaceSlotIndex < BALANCE.maxActiveSlots
            ? replaceSlotIndex
            : 0;
        const replaced = this.activeSlots[slotIdx];
        if (replaced) {
          if (replaced.isActive && ctx) {
            replaced.def.active?.onEnd?.(ctx);
          }
          this.owned.delete(replaced.powerId);
          this.stats.removeSource(`power:${replaced.powerId}`);
        }
      }
      this.activeSlots[slotIdx] = {
        powerId: def.id,
        def,
        cooldownRemaining: 0,
        activeRemaining: 0,
        isActive: false,
      };
    }

    const newStacks = (existing?.stacks ?? 0) + 1;
    const entry: OwnedPower = existing
      ? { ...existing, stacks: newStacks }
      : { def, stacks: newStacks, cleansed: false };
    this.owned.set(powerId, entry);

    this.syncStatsFor(entry);
    if (ctx && def.onAcquire) {
      def.onAcquire(ctx, newStacks);
    }
    return { ok: true, stacks: newStacks };
  }

  /** Garage Cleanse (§8.7, §10.1): disables curse downside while preserving upside. */
  cleanseCurse(powerId: string): boolean {
    const entry = this.owned.get(powerId);
    if (!entry || !entry.def.curse || entry.cleansed) return false;
    entry.cleansed = true;
    this.syncStatsFor(entry);
    return true;
  }

  private syncStatsFor(entry: OwnedPower): void {
    const upsideMods = entry.def.statMods ?? [];
    const curseMods = !entry.cleansed && entry.def.curse?.statMods ? entry.def.curse.statMods : [];
    const combined = [...upsideMods, ...curseMods];
    this.stats.setSource(`power:${entry.def.id}`, combined, entry.stacks);
  }

  /** Dispatch a GameEvent to all owned powers' hooks (and active curse hooks). */
  dispatch<E extends keyof GameEvents>(event: E, payload: GameEvents[E], ctx: PowerCtx): void {
    for (const entry of this.owned.values()) {
      const hook = entry.def.hooks?.[event];
      if (hook) {
        hook(ctx, payload, entry.stacks);
      }
      if (!entry.cleansed && entry.def.curse?.hooks?.[event]) {
        entry.def.curse.hooks[event]!(ctx, payload, entry.stacks);
      }
    }
  }

  /** Try activating slot 0 (Q) or slot 1 (E), or Nitro via Shift key. */
  tryActivateSlot(slotIndex: number, ctx: PowerCtx): { activated: boolean; powerId?: string; duration?: number } {
    const slot = this.activeSlots[slotIndex];
    if (!slot || !slot.def.active) return { activated: false };
    if (slot.isActive || slot.cooldownRemaining > 0) return { activated: false };

    slot.isActive = true;
    slot.activeRemaining = slot.def.active.duration;
    slot.cooldownRemaining = slot.def.active.cooldown * this.stats.get('ability.cooldownMult');
    slot.def.active.onActivate(ctx);
    return { activated: true, powerId: slot.powerId, duration: slot.def.active.duration };
  }

  /** Find nitro slot if Shift boost is pressed. */
  tryActivateNitroByBoostKey(ctx: PowerCtx): boolean {
    const idx = this.activeSlots.findIndex((s) => s?.powerId === 'nitro_tank');
    if (idx < 0) return false;
    return this.tryActivateSlot(idx, ctx).activated;
  }

  reduceAllCooldowns(seconds: number): void {
    for (const slot of this.activeSlots) {
      if (slot && !slot.isActive && slot.cooldownRemaining > 0) {
        slot.cooldownRemaining = Math.max(0, slot.cooldownRemaining - seconds);
      }
    }
  }

  /** Tick active abilities & cooldowns (use realDt so bullet time lasts 4 real seconds). */
  tick(dt: number, ctx: PowerCtx, frozen: boolean): void {
    if (frozen) return;
    for (const slot of this.activeSlots) {
      if (!slot || !slot.def.active) continue;
      if (slot.isActive) {
        slot.def.active.onTick?.(ctx, dt);
        slot.activeRemaining -= dt;
        if (slot.activeRemaining <= 0) {
          slot.isActive = false;
          slot.activeRemaining = 0;
          slot.def.active.onEnd?.(ctx);
        }
      } else if (slot.cooldownRemaining > 0) {
        slot.cooldownRemaining = Math.max(0, slot.cooldownRemaining - dt);
      }
    }
  }

  /** Second Shift (#25): called when timer hits 0. Returns seconds restored (20) or 0. */
  tryTriggerSecondShift(): number {
    if (this.has('second_shift') && !this.secondShiftConsumed) {
      this.secondShiftConsumed = true;
      return 20;
    }
    return 0;
  }
}
