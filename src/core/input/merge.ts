// @pure
// Merges every input device into one state. Nothing downstream ever learns
// which device is in use — that is the whole point, and it is why the gamepad
// path can ship untested on a machine with no gamepad attached.

export type Action =
  | 'interact'
  | 'cancel'
  | 'journal'
  | 'menu'
  | 'run'
  | 'stats'
  // Debug keys. They ship: they are how the day-night visual check is run.
  | 'hourBack'
  | 'hourForward'
  | 'pauseClock';

export type RawDevice = {
  kind: 'keyboard' | 'gamepad';
  /** Stick or key vector, already in -1..1 per axis. */
  moveX: number;
  moveY: number;
  buttons: Record<Action, boolean>;
  /** True when this device produced any input this frame. */
  active: boolean;
};

export type InputState = {
  /** Normalised movement direction. moveY negative is north (-z). */
  moveX: number;
  moveY: number;
  /** 0..1, past the deadzone and rescaled so there is no jump at the edge. */
  magnitude: number;
  held: Record<Action, boolean>;
  justPressed: Record<Action, boolean>;
  lastDevice: 'keyboard' | 'gamepad' | null;
};

export const DEADZONE = 0.15;

const ACTIONS: Action[] = [
  'interact',
  'cancel',
  'journal',
  'menu',
  'run',
  'stats',
  'hourBack',
  'hourForward',
  'pauseClock',
];

const noButtons = (): Record<Action, boolean> =>
  Object.fromEntries(ACTIONS.map((a) => [a, false])) as Record<Action, boolean>;

export function emptyInput(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    magnitude: 0,
    held: noButtons(),
    justPressed: noButtons(),
    lastDevice: null,
  };
}

export function emptyDevice(kind: RawDevice['kind']): RawDevice {
  return { kind, moveX: 0, moveY: 0, buttons: noButtons(), active: false };
}

/**
 * Radial deadzone, not per-axis: a diagonal nudge of 0.1 on each axis is a
 * magnitude of 0.14 and must not move the hero, which a per-axis deadzone gets
 * wrong. Past the edge the magnitude is rescaled from 0 so there is no jump.
 */
function applyDeadzone(x: number, y: number): { x: number; y: number; magnitude: number } {
  const raw = Math.hypot(x, y);
  if (raw <= DEADZONE) return { x: 0, y: 0, magnitude: 0 };
  const clamped = Math.min(raw, 1);
  const magnitude = (clamped - DEADZONE) / (1 - DEADZONE);
  return { x: x / raw, y: y / raw, magnitude };
}

/**
 * Devices are passed in fixed order so `lastDevice` is deterministic. The
 * strongest stick wins, so a resting keyboard never fights a live gamepad.
 */
export function mergeInput(prev: InputState, devices: RawDevice[]): InputState {
  let bestX = 0;
  let bestY = 0;
  let best = 0;
  let lastDevice = prev.lastDevice;

  const held = noButtons();

  for (const d of devices) {
    const strength = Math.hypot(d.moveX, d.moveY);
    if (strength > best) {
      best = strength;
      bestX = d.moveX;
      bestY = d.moveY;
    }
    let anyButton = false;
    for (const a of ACTIONS) {
      if (d.buttons[a]) {
        held[a] = true;
        anyButton = true;
      }
    }
    if (d.active || strength > DEADZONE || anyButton) lastDevice = d.kind;
  }

  const { x, y, magnitude } = applyDeadzone(bestX, bestY);

  const justPressed = noButtons();
  for (const a of ACTIONS) justPressed[a] = held[a] && !prev.held[a];

  return { moveX: x, moveY: y, magnitude, held, justPressed, lastDevice };
}
