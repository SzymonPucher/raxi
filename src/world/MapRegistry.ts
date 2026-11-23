import { createMapDefinition, MapDefinition, MapId } from './mapData';
import { createMikolowMapDefinition } from './maps/mikolowData';

export type { MapId } from './mapData';

export interface MapMeta {
  id: MapId;
  name: string;
  subtitle: string;
  description: string;
}

export const AVAILABLE_MAPS: readonly MapMeta[] = [
  {
    id: 'raxi_city',
    name: 'Raxi City',
    subtitle: 'Classic Arcade City',
    description: 'Grid downtown, ring highway, harbor docks, and outskirts stunt terrain.',
  },
  {
    id: 'mikolow',
    name: 'Mikołów, Poland',
    subtitle: 'Real Silesian Town • Hills, Rynek & Planty',
    description:
      'Authentic Upper Silesian town with historic Rynek, Bazylika św. Wojciecha, rolling hills, rail corridor, and Park Duże Planty.',
  },
] as const;

export function getMapMeta(id: MapId): MapMeta {
  return AVAILABLE_MAPS.find((m) => m.id === id) ?? AVAILABLE_MAPS[0];
}

export function createMapById(id: MapId): MapDefinition {
  if (id === 'mikolow') {
    return createMikolowMapDefinition();
  }
  return createMapDefinition();
}
