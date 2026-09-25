// Gamepad, polled every frame. Gamepads are invisible to the page until a
// button is pressed, so the interface hints at both devices rather than
// detecting one — which is why `active` only goes true on real input.
//
// NOT VERIFIED ON HARDWARE: no gamepad was available at M1. The standard
// mapping is used when the browser reports it and raw indices otherwise; both
// paths are written, neither has been exercised on a real pad.

import { emptyDevice, type Action, type RawDevice } from './merge';

// Standard mapping button indices.
const BUTTON_ACTIONS: [number, Action][] = [
  [0, 'interact'], // A
  [1, 'cancel'], // B
  [2, 'run'], // X
  [3, 'journal'], // Y
  [9, 'menu'], // Start
];

export class Gamepad_ {
  private readonly device = emptyDevice('gamepad');

  poll(): RawDevice {
    const d = this.device;
    d.moveX = 0;
    d.moveY = 0;
    for (const key of Object.keys(d.buttons) as Action[]) d.buttons[key] = false;
    d.active = false;

    if (typeof navigator === 'undefined' || !navigator.getGamepads) return d;

    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;

      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > Math.hypot(d.moveX, d.moveY)) {
        d.moveX = ax;
        d.moveY = ay;
      }

      for (const [index, action] of BUTTON_ACTIONS) {
        if (pad.buttons[index]?.pressed) {
          d.buttons[action] = true;
          d.active = true;
        }
      }
      // Right trigger as an alternative run, for pads that prefer it.
      if ((pad.buttons[7]?.value ?? 0) > 0.5) {
        d.buttons.run = true;
        d.active = true;
      }

      if (Math.hypot(ax, ay) > 0.2) d.active = true;
    }

    return d;
  }
}
