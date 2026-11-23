import './ui/styles.css';
import { Game } from './core/Game';
import { PhysicsWorld } from './physics/PhysicsWorld';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root') as HTMLElement | null;
  if (!canvas || !uiRoot) {
    throw new Error('Missing #game-canvas or #ui-root');
  }

  await PhysicsWorld.initRapier();
  new Game(canvas, uiRoot);
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap Raxi:', err);
  const root = document.getElementById('ui-root');
  if (root) {
    root.innerHTML = `<div style="padding:32px;color:#ff5252;font-family:sans-serif"><h2>RAXI Boot Error</h2><pre>${String(err)}</pre></div>`;
  }
});
