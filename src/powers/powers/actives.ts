import { PowerDef } from '../PowerTypes';

export const ACTIVE_POWERS: PowerDef[] = [
  {
    id: 'nitro_tank',
    name: 'Nitro Tank',
    description: 'Active: 3 s nitro boost (+40% accel, +15% top speed). 12 s cooldown.',
    rarity: 'uncommon',
    tags: ['speed'],
    maxStacks: 1,
    icon: '💨',
    active: {
      cooldown: 12,
      duration: 3,
      onActivate(ctx) {
        ctx.setNitroActive(true);
        ctx.showPopup('NITRO BOOST!', '#00e5ff');
      },
      onEnd(ctx) {
        ctx.setNitroActive(false);
      },
    },
  },
  {
    id: 'hydraulics',
    name: 'Hydraulics',
    description: 'Active: Hop 4 m into the air anywhere! 6 s cooldown.',
    rarity: 'uncommon',
    tags: ['style'],
    maxStacks: 1,
    icon: '🦘',
    active: {
      cooldown: 6,
      duration: 0.25,
      onActivate(ctx) {
        ctx.hopCar(4.0);
        ctx.showPopup('HYDRAULIC HOP!', '#ffd600');
      },
    },
  },
  {
    id: 'ghost_cab',
    name: 'Ghost Cab',
    description: 'Active: 4 s phase through traffic, props & pedestrians with zero damage. 25 s cooldown.',
    rarity: 'rare',
    tags: ['safety', 'chaos'],
    maxStacks: 1,
    icon: '👻',
    active: {
      cooldown: 25,
      duration: 4,
      onActivate(ctx) {
        ctx.setGhost(true);
        ctx.showPopup('GHOST CAB!', '#b388ff');
      },
      onEnd(ctx) {
        ctx.setGhost(false);
      },
    },
  },
  {
    id: 'shockwave',
    name: 'Shockwave',
    description: 'Active: Blast all traffic within 25 m away (+30 style per car). 18 s cooldown.',
    rarity: 'rare',
    tags: ['chaos', 'style'],
    maxStacks: 1,
    icon: '🌊',
    active: {
      cooldown: 18,
      duration: 0.35,
      onActivate(ctx) {
        const hitCount = ctx.pushTrafficAround(25, 36);
        if (hitCount > 0) {
          ctx.addStyle(hitCount * 30, `SHOCKWAVE ×${hitCount}`);
        } else {
          ctx.showPopup('SHOCKWAVE!', '#00e5ff');
        }
      },
    },
  },
  {
    id: 'flux_capacitor',
    name: 'Flux Capacitor',
    description: 'Active: 4 s bullet time — world & timer slow to 40%. 30 s cooldown.',
    rarity: 'legendary',
    tags: ['time'],
    maxStacks: 1,
    icon: '⚡',
    active: {
      cooldown: 30,
      duration: 4,
      onActivate(ctx) {
        ctx.setTimeScale(0.4);
        ctx.showPopup('BULLET TIME!', '#00e5ff', true);
      },
      onEnd(ctx) {
        ctx.setTimeScale(1.0);
      },
    },
  },
];
