export interface InputState {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
  handbrake: boolean;
  boost: boolean;
  ability1: boolean;
  ability2: boolean;
  horn: boolean;
  indicatorLeft: boolean; // edge-triggered
  indicatorRight: boolean; // edge-triggered
  shopBreak: boolean; // edge-triggered
  lookBack: boolean;
  resetCar: boolean; // held
  pause: boolean; // edge-triggered
  // menu nav (edge-triggered)
  uiUp: boolean;
  uiDown: boolean;
  uiLeft: boolean;
  uiRight: boolean;
  uiConfirm: boolean;
  uiBack: boolean;
  // draft quick keys (edge-triggered)
  slot1: boolean;
  slot2: boolean;
  slot3: boolean;
  slot4: boolean;
}

export function createEmptyInputState(): InputState {
  return {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: false,
    boost: false,
    ability1: false,
    ability2: false,
    horn: false,
    indicatorLeft: false,
    indicatorRight: false,
    shopBreak: false,
    lookBack: false,
    resetCar: false,
    pause: false,
    uiUp: false,
    uiDown: false,
    uiLeft: false,
    uiRight: false,
    uiConfirm: false,
    uiBack: false,
    slot1: false,
    slot2: false,
    slot3: false,
    slot4: false,
  };
}

export interface InputDevice {
  poll(dt: number): Partial<InputState>;
  dispose?(): void;
}
