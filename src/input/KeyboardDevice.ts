import { InputDevice, InputState } from './Actions';
import { DEFAULT_KEY_BINDINGS, KeyAction, KeyBindings, cloneBindings } from './bindings';

const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

export class KeyboardDevice implements InputDevice {
  private held = new Set<string>();
  private justPressed = new Set<string>();
  private bindings: KeyBindings;
  private steerValue = 0;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    // Ignore typing inside debug inputs
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (GAME_KEYS.has(e.code)) {
      e.preventDefault();
    }
    if (!this.held.has(e.code)) {
      this.justPressed.add(e.code);
    }
    this.held.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private readonly onBlur = () => {
    this.held.clear();
    this.justPressed.clear();
  };

  constructor(bindings?: KeyBindings) {
    this.bindings = bindings ? cloneBindings(bindings) : cloneBindings(DEFAULT_KEY_BINDINGS);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('blur', this.onBlur);
    }
  }

  setBindings(bindings: KeyBindings): void {
    this.bindings = cloneBindings(bindings);
  }

  private isHeld(action: KeyAction): boolean {
    const codes = this.bindings[action];
    for (let i = 0; i < codes.length; i++) {
      if (this.held.has(codes[i])) return true;
    }
    return false;
  }

  private isJustPressed(action: KeyAction): boolean {
    const codes = this.bindings[action];
    for (let i = 0; i < codes.length; i++) {
      if (this.justPressed.has(codes[i])) return true;
    }
    return false;
  }

  poll(dt: number): Partial<InputState> {
    const left = this.isHeld('steerLeft');
    const right = this.isHeld('steerRight');
    const targetSteer = (right ? 1 : 0) - (left ? 1 : 0);

    // Digital -> analog smoothed steering (§4): ramp ~6/s, return ~10/s, faster on reversal
    if (targetSteer === 0) {
      const rate = 10 * dt;
      if (Math.abs(this.steerValue) <= rate) {
        this.steerValue = 0;
      } else {
        this.steerValue -= Math.sign(this.steerValue) * rate;
      }
    } else {
      const reversing = Math.sign(targetSteer) !== Math.sign(this.steerValue) && this.steerValue !== 0;
      const rate = (reversing ? 14 : 6) * dt;
      this.steerValue += targetSteer * rate;
      this.steerValue = Math.max(-1, Math.min(1, this.steerValue));
    }

    const state: Partial<InputState> = {
      throttle: this.isHeld('throttle') ? 1 : 0,
      brake: this.isHeld('brake') ? 1 : 0,
      steer: this.steerValue,
      handbrake: this.isHeld('handbrake'),
      boost: this.isHeld('boost'),
      ability1: this.isJustPressed('ability1'),
      ability2: this.isJustPressed('ability2'),
      horn: this.isHeld('horn'),
      indicatorLeft: this.isJustPressed('indicatorLeft'),
      indicatorRight: this.isJustPressed('indicatorRight'),
      shopBreak: this.isJustPressed('shopBreak'),
      lookBack: this.isHeld('lookBack'),
      resetCar: this.isHeld('resetCar'),
      pause: this.isJustPressed('pause'),
      uiUp: this.isJustPressed('uiUp'),
      uiDown: this.isJustPressed('uiDown'),
      uiLeft: this.isJustPressed('uiLeft'),
      uiRight: this.isJustPressed('uiRight'),
      uiConfirm: this.isJustPressed('uiConfirm'),
      uiBack: this.isJustPressed('uiBack'),
      slot1: this.isJustPressed('slot1'),
      slot2: this.isJustPressed('slot2'),
      slot3: this.isJustPressed('slot3'),
      slot4: this.isJustPressed('slot4'),
    };

    this.justPressed.clear();
    return state;
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.onBlur);
    }
  }
}
