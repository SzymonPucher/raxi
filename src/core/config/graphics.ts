export type QualityPresetName = 'low' | 'medium' | 'high';

export interface GraphicsPreset {
  name: QualityPresetName;
  label: string;
  shadows: boolean;
  shadowMapSize: number;
  shadowRange: number;
  resolutionScale: number;
  antialias: boolean;
  fogNear: number;
  fogFar: number;
  drawDistance: number;
  maxParticles: number;
  vignette: boolean;
}

export const GRAPHICS_PRESETS: Record<QualityPresetName, GraphicsPreset> = {
  low: {
    name: 'low',
    label: 'Low',
    shadows: false,
    shadowMapSize: 512,
    shadowRange: 80,
    resolutionScale: 0.75,
    antialias: false,
    fogNear: 140,
    fogFar: 420,
    drawDistance: 460,
    maxParticles: 120,
    vignette: false,
  },
  medium: {
    name: 'medium',
    label: 'Medium',
    shadows: true,
    shadowMapSize: 1024,
    shadowRange: 120,
    resolutionScale: 1.0,
    antialias: true,
    fogNear: 180,
    fogFar: 560,
    drawDistance: 620,
    maxParticles: 240,
    vignette: false,
  },
  high: {
    name: 'high',
    label: 'High',
    shadows: true,
    shadowMapSize: 2048,
    shadowRange: 150,
    resolutionScale: 1.0,
    antialias: true,
    fogNear: 220,
    fogFar: 680,
    drawDistance: 760,
    maxParticles: 400,
    vignette: true,
  },
};
