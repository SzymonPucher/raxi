import { InputDevice, InputState } from './Actions';

type HeldAction =
  | 'throttle'
  | 'brake'
  | 'handbrake'
  | 'boost'
  | 'ability1'
  | 'ability2'
  | 'horn'
  | 'resetCar';

type EdgeAction = 'indicatorLeft' | 'indicatorRight' | 'shopBreak' | 'pause';

/**
 * Multi-touch mobile driving controls overlay implementing `InputDevice`.
 * Activates automatically on touch-capable devices and stays hidden during menus/pause.
 */
export class TouchDevice implements InputDevice {
  private readonly root: HTMLDivElement | null = null;
  private readonly steerZone: HTMLDivElement | null = null;
  private readonly steerLeftBtn: HTMLDivElement | null = null;
  private readonly steerRightBtn: HTMLDivElement | null = null;

  private readonly activePointers = new Map<number, HeldAction>();
  private steerPointerId: number | null = null;
  private steerValue = 0;

  private readonly queuedEdges: Record<EdgeAction, boolean> = {
    indicatorLeft: false,
    indicatorRight: false,
    shopBreak: false,
    pause: false,
  };

  private hasTouch = false;
  private hudVisible = false;

  constructor() {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    this.hasTouch =
      'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;

    const root = document.createElement('div');
    root.className = 'touch-controls-layer';
    root.style.display = 'none';

    // Top-right/center compact utility row (Pause, Shop Break, Blinkers, Horn, Reset)
    const topBar = document.createElement('div');
    topBar.className = 'touch-util-row';
    topBar.append(
      this.makeEdgeBtn('◀', 'indicatorLeft', 'touch-btn-sm'),
      this.makeEdgeBtn('▶', 'indicatorRight', 'touch-btn-sm'),
      this.makeHeldBtn('📣', 'horn', 'touch-btn-sm'),
      this.makeEdgeBtn('🛒', 'shopBreak', 'touch-btn-sm'),
      this.makeHeldBtn('↺', 'resetCar', 'touch-btn-sm'),
      this.makeEdgeBtn('⏸', 'pause', 'touch-btn-sm')
    );

    // Bottom-left: continuous/tactile Left & Right steering pad
    const steerZone = document.createElement('div');
    steerZone.className = 'touch-steer-zone';
    const steerLeft = document.createElement('div');
    steerLeft.className = 'touch-steer-btn';
    steerLeft.textContent = '◀';
    const steerRight = document.createElement('div');
    steerRight.className = 'touch-steer-btn';
    steerRight.textContent = '▶';
    steerZone.append(steerLeft, steerRight);

    this.bindSteerZone(steerZone, steerLeft, steerRight);

    // Bottom-right: Pedals + Drift + Nitro + Powers (Q/E)
    const rightCluster = document.createElement('div');
    rightCluster.className = 'touch-right-cluster';

    const powerRow = document.createElement('div');
    powerRow.className = 'touch-power-row';
    powerRow.append(
      this.makeHeldBtn('Q', 'ability1', 'touch-btn-power'),
      this.makeHeldBtn('E', 'ability2', 'touch-btn-power'),
      this.makeHeldBtn('⚡', 'boost', 'touch-btn-nitro'),
      this.makeHeldBtn('DRIFT', 'handbrake', 'touch-btn-drift')
    );

    const pedalRow = document.createElement('div');
    pedalRow.className = 'touch-pedal-row';
    pedalRow.append(
      this.makeHeldBtn('BRAKE', 'brake', 'touch-btn-brake'),
      this.makeHeldBtn('GAS', 'throttle', 'touch-btn-gas')
    );

    rightCluster.append(powerRow, pedalRow);
    root.append(topBar, steerZone, rightCluster);
    document.body.appendChild(root);

    this.root = root;
    this.steerZone = steerZone;
    this.steerLeftBtn = steerLeft;
    this.steerRightBtn = steerRight;

    window.addEventListener('touchstart', this.onFirstTouch, { passive: true });
    this.syncVisibility();
  }

  private onFirstTouch = (): void => {
    if (!this.hasTouch) {
      this.hasTouch = true;
      this.syncVisibility();
    }
  };

  setVisible(visible: boolean): void {
    this.hudVisible = visible;
    if (!visible) {
      this.activePointers.clear();
      this.steerPointerId = null;
      this.steerValue = 0;
      this.steerLeftBtn?.classList.remove('active');
      this.steerRightBtn?.classList.remove('active');
    }
    this.syncVisibility();
  }

  private syncVisibility(): void {
    if (!this.root) return;
    this.root.style.display = this.hasTouch && this.hudVisible ? 'block' : 'none';
  }

  private bindSteerZone(zone: HTMLDivElement, leftBtn: HTMLDivElement, rightBtn: HTMLDivElement): void {
    const updateSteer = (clientX: number) => {
      const rect = zone.getBoundingClientRect();
      const norm = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      // Slight center deadzone + smooth ramp to full lock
      if (Math.abs(norm) < 0.12) {
        this.steerValue = 0;
      } else {
        this.steerValue = Math.max(-1, Math.min(1, norm * 1.35));
      }
      leftBtn.classList.toggle('active', this.steerValue < -0.1);
      rightBtn.classList.toggle('active', this.steerValue > 0.1);
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.hasTouch = true;
      this.steerPointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      updateSteer(e.clientX);
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.steerPointerId) return;
      e.preventDefault();
      updateSteer(e.clientX);
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.steerPointerId) return;
      this.steerPointerId = null;
      this.steerValue = 0;
      leftBtn.classList.remove('active');
      rightBtn.classList.remove('active');
    };

    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

  private makeHeldBtn(label: string, action: HeldAction, cls: string): HTMLDivElement {
    const btn = document.createElement('div');
    btn.className = `touch-btn ${cls}`;
    btn.textContent = label;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.hasTouch = true;
      btn.setPointerCapture(e.pointerId);
      this.activePointers.set(e.pointerId, action);
      btn.classList.add('active');
    });

    const release = (e: PointerEvent) => {
      if (this.activePointers.delete(e.pointerId)) {
        btn.classList.remove('active');
      }
    };

    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    return btn;
  }

  private makeEdgeBtn(label: string, action: EdgeAction, cls: string): HTMLDivElement {
    const btn = document.createElement('div');
    btn.className = `touch-btn ${cls}`;
    btn.textContent = label;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.hasTouch = true;
      this.queuedEdges[action] = true;
      btn.classList.add('active');
      setTimeout(() => btn.classList.remove('active'), 140);
    });

    return btn;
  }

  poll(): Partial<InputState> {
    let throttle = 0;
    let brake = 0;
    let handbrake = false;
    let boost = false;
    let ability1 = false;
    let ability2 = false;
    let horn = false;
    let resetCar = false;

    for (const action of this.activePointers.values()) {
      if (action === 'throttle') throttle = 1;
      else if (action === 'brake') brake = 1;
      else if (action === 'handbrake') handbrake = true;
      else if (action === 'boost') boost = true;
      else if (action === 'ability1') ability1 = true;
      else if (action === 'ability2') ability2 = true;
      else if (action === 'horn') horn = true;
      else if (action === 'resetCar') resetCar = true;
    }

    const indicatorLeft = this.queuedEdges.indicatorLeft;
    const indicatorRight = this.queuedEdges.indicatorRight;
    const shopBreak = this.queuedEdges.shopBreak;
    const pause = this.queuedEdges.pause;

    this.queuedEdges.indicatorLeft = false;
    this.queuedEdges.indicatorRight = false;
    this.queuedEdges.shopBreak = false;
    this.queuedEdges.pause = false;

    return {
      throttle,
      brake,
      steer: this.steerValue,
      handbrake,
      boost,
      ability1,
      ability2,
      horn,
      resetCar,
      indicatorLeft,
      indicatorRight,
      shopBreak,
      pause,
    };
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('touchstart', this.onFirstTouch);
    }
    this.root?.remove();
    void this.steerZone;
  }
}
