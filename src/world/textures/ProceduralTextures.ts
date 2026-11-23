import * as THREE from 'three';

export interface CityTextures {
  asphalt2Lane: THREE.CanvasTexture;
  asphalt4Lane: THREE.CanvasTexture;
  shortcutPath: THREE.CanvasTexture;
  buildingAtlas: THREE.CanvasTexture;
  rampStripes: THREE.CanvasTexture;
}

function makeAsphalt(lanesPerDir: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Base dark warm asphalt with subtle grain
  ctx.fillStyle = '#383d42';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 650; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, y, 3, 3);
  }

  // Sidewalk curb borders on left/right edges
  ctx.fillStyle = '#9aa0a6';
  ctx.fillRect(0, 0, 12, 256);
  ctx.fillRect(244, 0, 12, 256);

  // White solid outer edge lines
  ctx.fillStyle = '#e8ecf0';
  ctx.fillRect(16, 0, 4, 256);
  ctx.fillRect(236, 0, 4, 256);

  // Double yellow centerline
  ctx.fillStyle = '#f5c418';
  ctx.fillRect(123, 0, 4, 256);
  ctx.fillRect(130, 0, 4, 256);

  // Dashed lane dividers for 2-lane-per-direction avenues/highways
  if (lanesPerDir >= 2) {
    ctx.fillStyle = '#e8ecf0';
    for (let y = 16; y < 256; y += 64) {
      ctx.fillRect(70, y, 4, 34);
      ctx.fillRect(182, y, 4, 34);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeShortcutTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#a89474';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#937e5d';
  for (let i = 0; i < 200; i++) {
    ctx.fillRect((i * 47) % 128, (i * 83) % 128, 4, 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBuildingWindowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Neutral white facade so vertex colors tint buildings per district cleanly!
  ctx.fillStyle = '#e8ecef';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle floor ledges
  ctx.fillStyle = '#cfd6dc';
  for (let y = 0; y < 256; y += 32) {
    ctx.fillRect(0, y, 256, 4);
  }

  // Stylized bright 2012-era reflective windows
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const wx = col * 32 + 6;
      const wy = row * 32 + 8;
      const lit = ((row * 7 + col * 13) % 5) === 0;
      ctx.fillStyle = lit ? '#8fd3ff' : '#3d5870';
      ctx.fillRect(wx, wy, 20, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(wx + 2, wy + 2, 7, 6);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRampStripesTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#1b1b1b';
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 0);
    ctx.lineTo(i + 144, 128);
    ctx.lineTo(i + 128, 128);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCityTextures(): CityTextures {
  return {
    asphalt2Lane: makeAsphalt(1),
    asphalt4Lane: makeAsphalt(2),
    shortcutPath: makeShortcutTexture(),
    buildingAtlas: makeBuildingWindowTexture(),
    rampStripes: makeRampStripesTexture(),
  };
}
