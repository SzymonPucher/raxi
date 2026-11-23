import { PowerDef } from './PowerTypes';
import { ACTIVE_POWERS } from './powers/actives';
import { CURSED_POWERS } from './powers/cursed';
import { STAT_POWERS } from './powers/stats';
import { TRIGGER_POWERS } from './powers/triggers';

export const ALL_POWERS: readonly PowerDef[] = [
  ...STAT_POWERS,
  ...TRIGGER_POWERS,
  ...ACTIVE_POWERS,
  ...CURSED_POWERS,
];

export class PowerRegistry {
  private readonly map = new Map<string, PowerDef>();

  constructor(defs: readonly PowerDef[] = ALL_POWERS) {
    for (const def of defs) {
      if (this.map.has(def.id)) {
        throw new Error(`Duplicate PowerDef id: ${def.id}`);
      }
      this.map.set(def.id, def);
    }
  }

  get(id: string): PowerDef | undefined {
    return this.map.get(id);
  }

  all(): PowerDef[] {
    return Array.from(this.map.values());
  }

  byRarity(rarity: PowerDef['rarity']): PowerDef[] {
    return this.all().filter((p) => p.rarity === rarity);
  }
}

export const defaultPowerRegistry = new PowerRegistry();
