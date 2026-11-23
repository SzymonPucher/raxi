import { BALANCE } from '../core/config/balance';
import { Rng } from '../core/Rng';
import { PowerManager } from './PowerManager';
import { PowerRegistry, defaultPowerRegistry } from './PowerRegistry';
import { PowerDef, Rarity } from './PowerTypes';

export interface DraftOffer {
  cards: PowerDef[];
  curseCard?: PowerDef;
  draftNumber: number;
  tier: number;
}

/**
 * Pure seeded Power Draft generator (§10.2):
 * - Rarity weights shifted +3% from common per tier
 * - Synergy weighting x1.5 when sharing tags with owned powers
 * - Never duplicates cards or offers maxed-out powers
 * - First draft of shift ALWAYS includes at least one active ability
 * - From tier 2+, occasional 4th Devil's Deal cursed card
 */
export function generateDraftOffer(params: {
  rng: Rng;
  powerManager: PowerManager;
  tier: number;
  draftNumber: number; // 1-indexed (1 = first draft of shift)
  registry?: PowerRegistry;
}): DraftOffer {
  const registry = params.registry ?? defaultPowerRegistry;
  const numChoices = Math.max(1, Math.round(params.powerManager.stats.get('draft.choices')));
  const ownedTags = params.powerManager.getOwnedTags();

  const eligible = registry
    .all()
    .filter(
      (p) =>
        p.rarity !== 'cursed' &&
        !params.powerManager.isMaxed(p.id) &&
        (p.minTier ?? 0) <= params.tier
    );

  // Rarity weights by tier (§10.2)
  const shift = Math.min(40, params.tier * BALANCE.draftTierRarityShift);
  const rarityWeights: Record<Exclude<Rarity, 'cursed'>, number> = {
    common: Math.max(20, BALANCE.draftRarityBase.common - shift),
    uncommon: BALANCE.draftRarityBase.uncommon + shift * 0.45,
    rare: BALANCE.draftRarityBase.rare + shift * 0.38,
    legendary: BALANCE.draftRarityBase.legendary + shift * 0.17,
  };

  const chosen: PowerDef[] = [];
  const pickedIds = new Set<string>();

  const pickWeightedFrom = (pool: PowerDef[]): PowerDef | null => {
    const avail = pool.filter((p) => !pickedIds.has(p.id));
    if (avail.length === 0) return null;
    const weights = avail.map((p) => {
      const rKey = p.rarity as Exclude<Rarity, 'cursed'>;
      const sameRarityCount = Math.max(1, avail.filter((x) => x.rarity === p.rarity).length);
      let w = rarityWeights[rKey] / sameRarityCount;
      // Synergy weighting x1.5 if sharing any tag with owned powers
      if (p.tags.some((t) => ownedTags.has(t))) {
        w *= BALANCE.draftSynergyWeightMult;
      }
      return w;
    });
    return params.rng.weightedPick(avail, weights);
  };

  // Guarantee: first draft of a shift ALWAYS includes at least one active ability (§10.2)
  if (params.draftNumber === 1) {
    const activePool = eligible.filter((p) => Boolean(p.active));
    const firstActive = pickWeightedFrom(activePool);
    if (firstActive) {
      chosen.push(firstActive);
      pickedIds.add(firstActive.id);
    }
  }

  while (chosen.length < numChoices) {
    const next = pickWeightedFrom(eligible);
    if (!next) break;
    chosen.push(next);
    pickedIds.add(next.id);
  }

  // Shuffle order so guaranteed active isn't always slot 0
  const cards = params.rng.shuffle(chosen);

  // Occasional 4th Devil's Deal cursed card from tier 2 (§10.2)
  let curseCard: PowerDef | undefined;
  if (params.tier >= BALANCE.draftCurseMinTier && params.rng.chance(BALANCE.draftCurseChance)) {
    const cursedPool = registry
      .byRarity('cursed')
      .filter((p) => !params.powerManager.isMaxed(p.id) && (p.minTier ?? 0) <= params.tier);
    if (cursedPool.length > 0) {
      curseCard = params.rng.pick(cursedPool);
    }
  }

  return {
    cards,
    curseCard,
    draftNumber: params.draftNumber,
    tier: params.tier,
  };
}
