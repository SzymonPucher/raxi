export type GameState =
  | 'Boot'
  | 'MainMenu'
  | 'ShiftIntro'
  | 'Driving'
  | 'Paused'
  | 'Draft'
  | 'Break'
  | 'Shop'
  | 'BreakEnding'
  | 'ShiftEnding'
  | 'ShiftOver';

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface GameEvents {
  'state:change': { from: GameState; to: GameState };
  'shift:start': { seed: number };
  'shift:end': { score: number; deliveries: number; seed: number };
  'timer:bonus': { seconds: number; reason: string };
  'timer:zero': { prevented: boolean };

  'fare:pickup': {
    fareId: string;
    passengerType: string;
    destinationName: string;
    routeLength: number;
    pickupBonus: number;
  };
  'fare:delivered': {
    fareId: string;
    passengerType: string;
    destinationName: string;
    grade: Grade;
    quality: number;
    cash: number;
    tip: number;
    timeBonus: number;
    parTime: number;
    actualTime: number;
    deliveryNumber: number;
    perfectDrive: boolean;
  };
  'fare:expired': { fareId: string; passengerType: string };
  'fare:speech': { text: string; mood: 'happy' | 'angry' | 'panic' | 'neutral' };

  'style:event': { kind: string; points: number; combo: number; label: string };
  'style:driftTick': { dt: number; speed: number; slipDeg: number };
  'style:airTick': { dt: number; height: number };
  'style:jumpLand': { airtime: number; clean: boolean; dropHeight: number };
  'style:nearMiss': { relSpeed: number; distance: number };
  'style:comboBreak': { lostCombo: number };

  'safety:collision': {
    kind: 'traffic' | 'wall' | 'prop' | 'landing' | 'flip';
    impulse: number;
    penalty: number;
  };
  'safety:pedScare': { distance: number };
  'ped:exploded': { x: number; y: number; z: number; isChain: boolean; wasPassenger: boolean };

  'rule:violation': {
    kind: 'redLight' | 'noBlinker' | 'oncoming' | 'speeding';
    penalty: number;
    label: string;
  };
  'vehicle:blinker': { side: 'left' | 'right' | 'off' };
  'vehicle:horn': { loud: boolean };
  'vehicle:boost': { active: boolean };
  'vehicle:reset': { manual: boolean };

  'car:damaged': { amount: number; source: string; condition: number };
  'car:repaired': { amount: number; condition: number };

  'wallet:change': { wallet: number; score: number; delta: number };

  'draft:open': { tier: number; deliveryNumber: number };
  'draft:pick': { powerId: string; stacks: number };
  'draft:skip': { timeBonus: number };

  'break:start': Record<string, never>;
  'break:end': Record<string, never>;
  'shop:open': { garageName: string };
  'shop:close': Record<string, never>;
  'shop:purchase': { kind: 'power' | 'repair' | 'cleanse' | 'reroll'; cost: number; label: string };

  'power:activated': { powerId: string; slot: number; duration: number };
  'power:ended': { powerId: string; slot: number };

  'event:start': { kind: 'rushHour' | 'rain' | 'roadWorks'; duration: number };
  'event:end': { kind: 'rushHour' | 'rain' | 'roadWorks' };

  'ui:popup': { text: string; color?: string; big?: boolean };
  'camera:shake': { intensity: number; duration: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<keyof GameEvents, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  off<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of Array.from(set)) {
      handler(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
