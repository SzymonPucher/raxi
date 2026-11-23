import { BALANCE } from '../../core/config/balance';
import { PowerDef } from '../PowerTypes';

export const TRIGGER_POWERS: PowerDef[] = [
  {
    id: 'coffee_thermos',
    name: 'Coffee Thermos',
    description: '+8 s right now, and +1 s on every delivery per stack.',
    rarity: 'common',
    tags: ['time'],
    maxStacks: 3,
    icon: '☕',
    onAcquire(ctx) {
      ctx.addTime(8, 'Coffee Thermos');
    },
    hooks: {
      'fare:delivered': (ctx, _ev, stacks) => {
        ctx.addTime(1 * stacks, 'Coffee Thermos');
      },
    },
  },
  {
    id: 'drift_king',
    name: 'Drift King',
    description: 'Drifting cuts ability cooldowns 2× and adds +0.25 s timer per drift second.',
    rarity: 'uncommon',
    tags: ['style', 'time'],
    maxStacks: 1,
    icon: '🔥',
    hooks: {
      'style:driftTick': (ctx, ev) => {
        ctx.reduceActiveCooldowns(ev.dt); // extra 1x on top of base 1x = 2x cooldown speed
        ctx.addTime(0.25 * ev.dt, '');
      },
    },
  },
  {
    id: 'frequent_flyer',
    name: 'Frequent Flyer',
    description: '+1 s timer per second of airtime.',
    rarity: 'uncommon',
    tags: ['style', 'time'],
    maxStacks: 1,
    icon: '✈️',
    hooks: {
      'style:airTick': (ctx, ev) => {
        ctx.addTime(1.0 * ev.dt, '');
      },
    },
  },
  {
    id: 'rush_hour_hero',
    name: 'Rush Hour Hero',
    description: 'Near misses grant +0.5 s timer and double near-miss style.',
    rarity: 'uncommon',
    tags: ['style', 'time'],
    maxStacks: 1,
    icon: '⚡',
    hooks: {
      'style:nearMiss': (ctx) => {
        ctx.addTime(0.5, 'Near Miss');
        ctx.addStyleRating(BALANCE.styleNearMissRatingBonus, 'RUSH HERO');
      },
    },
  },
  {
    id: 'time_bank',
    name: 'Time Bank',
    description: 'Seconds delivered under par time are added to your timer at 50%.',
    rarity: 'rare',
    tags: ['time', 'speed'],
    maxStacks: 1,
    icon: '🏦',
    hooks: {
      'fare:delivered': (ctx, ev) => {
        const saved = ev.parTime - ev.actualTime;
        if (saved > 0.5) {
          const bonus = Math.round(saved * 0.5 * 10) / 10;
          ctx.addTime(bonus, 'Time Bank');
          ctx.showPopup(`TIME BANK +${bonus.toFixed(1)}s`, '#00e5ff');
        }
      },
    },
  },
  {
    id: 'second_shift',
    name: 'Second Shift',
    description: 'First time the timer hits 0, restore +20 s (consumed).',
    rarity: 'rare',
    tags: ['time'],
    maxStacks: 1,
    icon: '⏳',
  },
  {
    id: 'stunt_show',
    name: 'Stunt Show',
    description: 'Each jump grants ×1.5 style for 5 s (stacks up to ×3).',
    rarity: 'rare',
    tags: ['style'],
    maxStacks: 1,
    icon: '🎪',
    hooks: {
      'style:jumpLand': (ctx) => {
        ctx.activateStuntBoost();
        ctx.showPopup('STUNT SHOW ×1.5!', '#ffea00');
      },
    },
  },
];
