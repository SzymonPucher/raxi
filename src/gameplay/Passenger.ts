export type PassengerTypeId =
  | 'regular'
  | 'businessman'
  | 'thrillSeeker'
  | 'grandma'
  | 'tourist'
  | 'celebrity'
  | 'lateGroom';

export type TripLengthCategory = 'short' | 'medium' | 'long';

export interface PassengerTypeDef {
  id: PassengerTypeId;
  name: string;
  emoji: string;
  shirtColor: number;
  weights: { speed: number; style: number; safety: number };
  ruleStrictness: number; // 0..1
  spawnWeight: number;
  minTier: number;
  parMult: number;
  patienceMult: number;
  pickupBonusMult: number;
  cashMult: number;
  deliveryTimeBonusMult: number;
  tagline: string;
  lines: {
    pickup: string[];
    happy: string[];
    angry: string[];
    ruleBreak: string[];
    panic: string[];
  };
}

export const PASSENGER_TYPES: Record<PassengerTypeId, PassengerTypeDef> = {
  regular: {
    id: 'regular',
    name: 'Regular',
    emoji: '🧑',
    shirtColor: 0x42a5f5,
    weights: { speed: 0.4, style: 0.3, safety: 0.3 },
    ruleStrictness: 0,
    spawnWeight: 40,
    minTier: 0,
    parMult: 1.0,
    patienceMult: 1.0,
    pickupBonusMult: 1.0,
    cashMult: 1.0,
    deliveryTimeBonusMult: 1.0,
    tagline: 'Balanced fare',
    lines: {
      pickup: ['Take me there quick!', 'Hey cabbie, let\'s roll!'],
      happy: ['Nice driving!', 'Sweet move!'],
      angry: ['Hey, watch it!', 'Ouch, my coffee!'],
      ruleBreak: ['Whoa there!'],
      panic: ['Hurry up, please!'],
    },
  },
  businessman: {
    id: 'businessman',
    name: 'Businessman',
    emoji: '💼',
    shirtColor: 0x37474f,
    weights: { speed: 0.7, style: 0.1, safety: 0.2 },
    ruleStrictness: 0,
    spawnWeight: 15,
    minTier: 0,
    parMult: 0.85,
    patienceMult: 0.9,
    pickupBonusMult: 1.0,
    cashMult: 1.35,
    deliveryTimeBonusMult: 1.0,
    tagline: 'Tight par, big tips',
    lines: {
      pickup: ['Step on it, I have a meeting!', 'Time is money, driver!'],
      happy: ['Now THAT is efficiency!', 'Good pace!'],
      angry: ['My suit! Watch the traffic!', 'Don\'t dent my briefcase!'],
      ruleBreak: ['Just get me there!'],
      panic: ['I\'m going to miss the merger!'],
    },
  },
  thrillSeeker: {
    id: 'thrillSeeker',
    name: 'Thrill-Seeker',
    emoji: '🤘',
    shirtColor: 0xff5722,
    weights: { speed: 0.3, style: 0.6, safety: 0.1 },
    ruleStrictness: 0,
    spawnWeight: 15,
    minTier: 0,
    parMult: 1.05,
    patienceMult: 1.1,
    pickupBonusMult: 1.0,
    cashMult: 1.15,
    deliveryTimeBonusMult: 1.0,
    tagline: 'Loves drifts & jumps',
    lines: {
      pickup: ['Show me some crazy drifts!', 'Hit every ramp you see!'],
      happy: ['WOOOOO!! AGAIN!', 'SICK DRIFT!!', 'AIRTIME BABY!'],
      angry: ['Haha okay maybe too hard!', 'Whoa!'],
      ruleBreak: ['Boring rules! Floor it!'],
      panic: ['Come on, spice it up!'],
    },
  },
  grandma: {
    id: 'grandma',
    name: 'Grandma',
    emoji: '👵',
    shirtColor: 0xba68c8,
    weights: { speed: 0.05, style: 0.0, safety: 0.95 },
    ruleStrictness: 1.0,
    spawnWeight: 10,
    minTier: 0,
    parMult: 2.5,
    patienceMult: 4.0,
    pickupBonusMult: 1.5,
    cashMult: 1.15,
    deliveryTimeBonusMult: 1.0,
    tagline: 'Obey traffic rules! Use Z/X blinkers!',
    lines: {
      pickup: ['Drive nicely, dearie. No rush!', 'Mind the signals and speed limit!'],
      happy: ['What a polite young driver!', 'Such smooth driving!'],
      angry: ['Oh heavens! My knitting!', 'Slow down, you maniac!'],
      ruleBreak: ['You didn\'t signal!', 'That light was RED!', 'Watch the speed limit, dear!'],
      panic: ['We should get there before tea time.'],
    },
  },
  tourist: {
    id: 'tourist',
    name: 'Tourist',
    emoji: '📸',
    shirtColor: 0x26c6da,
    weights: { speed: 0.1, style: 0.4, safety: 0.5 },
    ruleStrictness: 0.3,
    spawnWeight: 12,
    minTier: 0,
    parMult: 1.3,
    patienceMult: 1.4,
    pickupBonusMult: 1.1,
    cashMult: 1.1,
    deliveryTimeBonusMult: 1.0,
    tagline: 'Scenic, fun & safe',
    lines: {
      pickup: ['Ooh, show me the sights!', 'I want a fun ride, not a crash!'],
      happy: ['Awesome photo op!', 'So cool!'],
      angry: ['Careful! My camera!', 'Whoa, watch the curb!'],
      ruleBreak: ['Is that legal here?', 'Oops, mind the road!'],
      panic: ['My tour bus leaves soon!'],
    },
  },
  celebrity: {
    id: 'celebrity',
    name: 'Celebrity',
    emoji: '⭐',
    shirtColor: 0xffd54f,
    weights: { speed: 0.35, style: 0.35, safety: 0.3 },
    ruleStrictness: 0,
    spawnWeight: 3,
    minTier: 2,
    parMult: 0.95,
    patienceMult: 1.0,
    pickupBonusMult: 1.15,
    cashMult: 3.0,
    deliveryTimeBonusMult: 1.1,
    tagline: '3× CASH VIP!',
    lines: {
      pickup: ['Lose the paparazzi, darling!', 'VIP service, please!'],
      happy: ['Fabulous! Pure gold!', '5 stars already!'],
      angry: ['Do you know who I am?!', 'My hair!'],
      ruleBreak: ['I\'m famous, it\'s fine.'],
      panic: ['The red carpet won\'t wait!'],
    },
  },
  lateGroom: {
    id: 'lateGroom',
    name: 'Late Groom',
    emoji: '🤵',
    shirtColor: 0xeeeeee,
    weights: { speed: 1.0, style: 0.0, safety: 0.0 },
    ruleStrictness: 0,
    spawnWeight: 5,
    minTier: 0,
    parMult: 0.75,
    patienceMult: 0.85,
    pickupBonusMult: 1.2,
    cashMult: 1.2,
    deliveryTimeBonusMult: 1.6,
    tagline: 'MAX SPEED! Huge time bonus',
    lines: {
      pickup: ['THE WEDDING STARTS IN 2 MINUTES!', 'FLOOR IT! DON\'T STOP!'],
      happy: ['YES! FASTER!', 'WE MIGHT MAKE IT!'],
      angry: ['I DON\'T CARE, KEEP GOING!', 'DRIVE!!'],
      ruleBreak: ['FORGET THE LIGHTS!'],
      panic: ['SHE\'S GOING TO KILL ME!'],
    },
  },
};

export const ALL_PASSENGER_TYPE_IDS = Object.keys(PASSENGER_TYPES) as PassengerTypeId[];

export function classifyTripLength(meters: number): TripLengthCategory {
  if (meters < 500) return 'short';
  if (meters <= 1200) return 'medium';
  return 'long';
}

export function getTripColorHex(cat: TripLengthCategory): number {
  if (cat === 'short') return 0x2ecc71;
  if (cat === 'medium') return 0xf1c40f;
  return 0xe74c3c;
}
