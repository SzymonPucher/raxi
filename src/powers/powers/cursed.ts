import { PowerDef } from '../PowerTypes';

/**
 * Cursed ("Devil's Deal") powers (§10.3 #30-32).
 * Upside and `curse` downside are strictly separated so Garage Cleanse disables only `curse`.
 */
export const CURSED_POWERS: PowerDef[] = [
  {
    id: 'glass_cannon',
    name: 'Glass Cannon Engine',
    description: '+25% top speed & acceleration.',
    rarity: 'cursed',
    tags: ['speed', 'chaos'],
    maxStacks: 1,
    minTier: 2,
    icon: '💀',
    statMods: [
      { stat: 'car.topSpeed', mul: 0.25 },
      { stat: 'car.accel', mul: 0.25 },
    ],
    curse: {
      description: 'CURSE: Every crash costs 2 s of timer and +50% car damage taken.',
      statMods: [{ stat: 'car.damageTaken', mul: 0.5 }],
      hooks: {
        'safety:collision': (ctx, ev) => {
          if (ev.kind === 'traffic' || ev.kind === 'wall') {
            ctx.subtractTime(2);
            ctx.showPopup('GLASS CANNON −2s!', '#ff3d00');
          }
        },
      },
    },
  },
  {
    id: 'daredevil_license',
    name: 'Daredevil License',
    description: 'Style points ×2 and style weight +0.3 for all passengers.',
    rarity: 'cursed',
    tags: ['style', 'chaos'],
    maxStacks: 1,
    minTier: 2,
    icon: '😈',
    statMods: [{ stat: 'style.mult', mul: 1.0 }],
    curse: {
      description: 'CURSE: Safety rating is always 0.',
    },
  },
  {
    id: 'lone_wolf',
    name: 'Lone Wolf',
    description: 'Pickup & delivery time bonuses +30%.',
    rarity: 'cursed',
    tags: ['time'],
    maxStacks: 1,
    minTier: 2,
    icon: '🐺',
    statMods: [
      { stat: 'timer.pickupMult', mul: 0.3 },
      { stat: 'timer.deliveryMult', mul: 0.3 },
    ],
    curse: {
      description: 'CURSE: Minimap is disabled for the rest of the shift.',
    },
  },
];
