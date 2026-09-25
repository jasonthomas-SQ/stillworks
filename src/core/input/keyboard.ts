// Keyboard, on KeyboardEvent.code so the bindings are layout-safe: WASD stays
// where W-A-S-D physically are on an AZERTY board.

import { emptyDevice, type Action, type RawDevice } from './merge';

const MOVE: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const BUTTONS: Record<string, Action> = {
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyE: 'interact',
  Enter: 'interact',
  Space: 'interact',
  Escape: 'cancel',
  KeyJ: 'journal',
  Tab: 'menu',
  Backquote: 'stats',
  BracketLeft: 'hourBack',
  BracketRight: 'hourForward',
  KeyP: 'pauseClock',
};

export class Keyboard {
  private readonly down = new Set<string>();
  /**
   * Keys pressed since the last poll, even if already released.
   *
   * Polling a held-key set at frame time silently drops any press shorter than
   * a frame — 16 ms at 60 fps. A human never types that fast, but synthetic and
   * automation-driven key events routinely do, which is why the backtick stats
   * toggle looked dead during the M1 visual check while the binding was fine.
   * Latching the press means no input is ever lost, whoever sends it.
   */
  private readonly pressedSincePoll = new Set<string>();
  private readonly device = emptyDevice('keyboard');
  private readonly onDown: (e: KeyboardEvent) => void;
  private readonly onUp: (e: KeyboardEvent) => void;
  private readonly onBlur: () => void;

  constructor(target: Window = window) {
    this.onDown = (e) => {
      if (e.repeat) return;
      if (MOVE[e.code] || BUTTONS[e.code]) e.preventDefault();
      this.down.add(e.code);
      this.pressedSincePoll.add(e.code);
    };
    this.onUp = (e) => this.down.delete(e.code);
    // A key held while the window loses focus would otherwise stick down.
    this.onBlur = () => this.down.clear();

    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  poll(): RawDevice {
    let x = 0;
    let y = 0;
    for (const code of this.down) {
      const v = MOVE[code];
      if (v) {
        x += v[0];
        y += v[1];
      }
    }
    // Opposite keys cancel; a diagonal is normalised so it is not faster.
    const len = Math.hypot(x, y);
    this.device.moveX = len > 1 ? x / len : x;
    this.device.moveY = len > 1 ? y / len : y;

    for (const key of Object.keys(this.device.buttons) as Action[]) {
      this.device.buttons[key] = false;
    }
    // Held keys, plus anything pressed and released between polls.
    for (const code of this.down) {
      const action = BUTTONS[code];
      if (action) this.device.buttons[action] = true;
    }
    for (const code of this.pressedSincePoll) {
      const action = BUTTONS[code];
      if (action) this.device.buttons[action] = true;
    }

    this.device.active = this.down.size > 0 || this.pressedSincePoll.size > 0;
    this.pressedSincePoll.clear();
    return this.device;
  }

  /**
   * Press a key from code, bypassing the DOM.
   *
   * Synthetic KeyboardEvents dispatched from page script do not reach the real
   * listeners in every automation setup, which left an observer unable to walk
   * the hero. This is the door that always opens. Debug only — see README.
   */
  injectDown(code: string): void {
    this.down.add(code);
    this.pressedSincePoll.add(code);
  }

  injectUp(code: string): void {
    this.down.delete(code);
  }

  dispose(target: Window = window): void {
    target.removeEventListener('keydown', this.onDown);
    target.removeEventListener('keyup', this.onUp);
    target.removeEventListener('blur', this.onBlur);
  }
}
