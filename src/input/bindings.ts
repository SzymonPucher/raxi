export type KeyAction =
  | 'throttle'
  | 'brake'
  | 'steerLeft'
  | 'steerRight'
  | 'handbrake'
  | 'boost'
  | 'ability1'
  | 'ability2'
  | 'horn'
  | 'indicatorLeft'
  | 'indicatorRight'
  | 'shopBreak'
  | 'lookBack'
  | 'cameraLeft'
  | 'cameraRight'
  | 'resetCar'
  | 'pause'
  | 'uiUp'
  | 'uiDown'
  | 'uiLeft'
  | 'uiRight'
  | 'uiConfirm'
  | 'uiBack'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4';

export type KeyBindings = Record<KeyAction, string[]>;

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  boost: ['ShiftLeft', 'ShiftRight'],
  ability1: ['KeyQ'],
  ability2: ['KeyE'],
  horn: ['KeyH'],
  indicatorLeft: ['KeyZ'],
  indicatorRight: ['KeyX'],
  shopBreak: ['KeyB'],
  lookBack: ['KeyC'],
  cameraLeft: ['KeyJ', 'BracketLeft', 'Comma'],
  cameraRight: ['KeyL', 'BracketRight', 'Period'],
  resetCar: ['KeyR'],
  pause: ['Escape', 'KeyP'],
  uiUp: ['ArrowUp', 'KeyW'],
  uiDown: ['ArrowDown', 'KeyS'],
  uiLeft: ['ArrowLeft', 'KeyA'],
  uiRight: ['ArrowRight', 'KeyD'],
  uiConfirm: ['Enter', 'Space'],
  uiBack: ['Escape', 'Backspace'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
};

export function cloneBindings(b: KeyBindings = DEFAULT_KEY_BINDINGS): KeyBindings {
  const out = {} as KeyBindings;
  for (const key of Object.keys(b) as KeyAction[]) {
    out[key] = [...b[key]];
  }
  return out;
}
