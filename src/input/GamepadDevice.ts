import { InputDevice, InputState } from './Actions';

/**
 * Controller-ready GamepadDevice (§4).
 * Polls standard W3C Gamepad API when a controller is connected; returns empty state otherwise.
 */
export class GamepadDevice implements InputDevice {
  private prevButtons: boolean[] = [];
  private readonly deadzone = 0.15;

  private applyDeadzone(v: number): number {
    const abs = Math.abs(v);
    if (abs < this.deadzone) return 0;
    const norm = (abs - this.deadzone) / (1 - this.deadzone);
    return Math.sign(v) * norm * norm;
  }

  poll(_dt: number): Partial<InputState> {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) {
      return {};
    }
    const pads = navigator.getGamepads();
    let pad: Gamepad | null = null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i]!.connected) {
        pad = pads[i];
        break;
      }
    }
    if (!pad) {
      this.prevButtons = [];
      return {};
    }

    const btn = (idx: number) => Boolean(pad!.buttons[idx]?.pressed);
    const val = (idx: number) => pad!.buttons[idx]?.value ?? 0;
    const edge = (idx: number) => btn(idx) && !this.prevButtons[idx];

    const state: Partial<InputState> = {
      throttle: val(7), // RT
      brake: val(6), // LT
      steer: this.applyDeadzone(pad.axes[0] ?? 0),
      handbrake: btn(0), // A / Cross
      boost: btn(1), // B / Circle
      ability1: edge(2) || edge(4), // X or LB
      ability2: edge(3) || edge(5), // Y or RB
      horn: btn(10), // L3
      lookBack: btn(11), // R3
      indicatorLeft: edge(14), // D-pad left
      indicatorRight: edge(15), // D-pad right
      shopBreak: edge(12), // D-pad up
      resetCar: btn(8), // Back / View
      pause: edge(9), // Start
      uiUp: edge(12),
      uiDown: edge(13),
      uiLeft: edge(14),
      uiRight: edge(15),
      uiConfirm: edge(0),
      uiBack: edge(1),
    };

    this.prevButtons = pad.buttons.map((b) => b.pressed);
    return state;
  }

  rumble(durationMs: number, strong = 0.5, weak = 0.3): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const actuator = (pad as unknown as { vibrationActuator?: { playEffect?: (...args: any[]) => Promise<void> } }).vibrationActuator;
      if (actuator?.playEffect) {
        actuator.playEffect('dual-rumble', {
          duration: durationMs,
          strongMagnitude: Math.min(1, Math.max(0, strong)),
          weakMagnitude: Math.min(1, Math.max(0, weak)),
        }).catch(() => {});
      }
      break;
    }
  }
}
