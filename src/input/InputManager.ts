import { InputDevice, InputState, createEmptyInputState } from './Actions';
import { GamepadDevice } from './GamepadDevice';
import { KeyboardDevice } from './KeyboardDevice';
import { KeyBindings } from './bindings';

export class InputManager {
  public readonly keyboard: KeyboardDevice;
  public readonly gamepad: GamepadDevice;
  private readonly devices: InputDevice[];
  private current: InputState = createEmptyInputState();

  constructor(bindings?: KeyBindings) {
    this.keyboard = new KeyboardDevice(bindings);
    this.gamepad = new GamepadDevice();
    this.devices = [this.keyboard, this.gamepad];
  }

  update(dt: number): InputState {
    const merged = createEmptyInputState();
    for (const dev of this.devices) {
      const partial = dev.poll(dt);
      if (partial.throttle !== undefined && Math.abs(partial.throttle) > Math.abs(merged.throttle)) {
        merged.throttle = partial.throttle;
      }
      if (partial.brake !== undefined && Math.abs(partial.brake) > Math.abs(merged.brake)) {
        merged.brake = partial.brake;
      }
      if (partial.steer !== undefined && Math.abs(partial.steer) > Math.abs(merged.steer)) {
        merged.steer = partial.steer;
      }
      merged.handbrake = merged.handbrake || Boolean(partial.handbrake);
      merged.boost = merged.boost || Boolean(partial.boost);
      merged.ability1 = merged.ability1 || Boolean(partial.ability1);
      merged.ability2 = merged.ability2 || Boolean(partial.ability2);
      merged.horn = merged.horn || Boolean(partial.horn);
      merged.indicatorLeft = merged.indicatorLeft || Boolean(partial.indicatorLeft);
      merged.indicatorRight = merged.indicatorRight || Boolean(partial.indicatorRight);
      merged.shopBreak = merged.shopBreak || Boolean(partial.shopBreak);
      merged.lookBack = merged.lookBack || Boolean(partial.lookBack);
      merged.resetCar = merged.resetCar || Boolean(partial.resetCar);
      merged.pause = merged.pause || Boolean(partial.pause);
      merged.uiUp = merged.uiUp || Boolean(partial.uiUp);
      merged.uiDown = merged.uiDown || Boolean(partial.uiDown);
      merged.uiLeft = merged.uiLeft || Boolean(partial.uiLeft);
      merged.uiRight = merged.uiRight || Boolean(partial.uiRight);
      merged.uiConfirm = merged.uiConfirm || Boolean(partial.uiConfirm);
      merged.uiBack = merged.uiBack || Boolean(partial.uiBack);
      merged.slot1 = merged.slot1 || Boolean(partial.slot1);
      merged.slot2 = merged.slot2 || Boolean(partial.slot2);
      merged.slot3 = merged.slot3 || Boolean(partial.slot3);
      merged.slot4 = merged.slot4 || Boolean(partial.slot4);
    }
    this.current = merged;
    return merged;
  }

  get state(): InputState {
    return this.current;
  }

  dispose(): void {
    for (const dev of this.devices) {
      dev.dispose?.();
    }
  }
}
