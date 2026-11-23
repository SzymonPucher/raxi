export const CG = {
  PLAYER: 1 << 0,
  TRAFFIC: 1 << 1,
  STATIC_WORLD: 1 << 2,
  PROPS_BREAKABLE: 1 << 3,
  PEDESTRIAN: 1 << 4,
  ZONE_SENSOR: 1 << 5,
  GROUND: 1 << 6,
} as const;

export const ALL_GROUPS = 0xffff;

/**
 * Rapier encodes collision groups as (membership << 16) | filter.
 */
export function makeCollisionGroups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export const PLAYER_NORMAL_FILTER =
  CG.TRAFFIC | CG.STATIC_WORLD | CG.PROPS_BREAKABLE | CG.PEDESTRIAN | CG.ZONE_SENSOR | CG.GROUND;

export const PLAYER_GHOST_FILTER = CG.STATIC_WORLD | CG.ZONE_SENSOR | CG.GROUND;

export const WORLD_WHEEL_RAY_FILTER = CG.GROUND | CG.STATIC_WORLD;
export const CAMERA_RAY_FILTER = CG.STATIC_WORLD | CG.GROUND;
