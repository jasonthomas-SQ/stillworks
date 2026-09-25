import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Keyboard } from './keyboard';

// A tiny fake window: enough to exercise the latch without jsdom. The keyboard
// module is not pure by design — it listens to real events — but its behaviour
// is testable with a stub listener target.

class FakeWindow {
  private readonly listeners = new Map<string, ((e: never) => void)[]>();

  addEventListener(type: string, fn: (e: never) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, fn: (e: never) => void): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      list.filter((f) => f !== fn),
    );
  }

  send(type: string, code: string): void {
    const event = { code, repeat: false, preventDefault: () => {} };
    for (const fn of this.listeners.get(type) ?? []) fn(event as never);
  }
}

describe('Keyboard', () => {
  let win: FakeWindow;
  let kb: Keyboard;

  beforeEach(() => {
    win = new FakeWindow();
    kb = new Keyboard(win as unknown as Window);
  });

  afterEach(() => kb.dispose(win as unknown as Window));

  // The M1 visual check found the backtick stats toggle unresponsive. The
  // binding was correct; the press was shorter than a frame, so polling a
  // held-key set never saw it. Automation always presses that fast.
  it('never drops a key pressed and released between two polls', () => {
    win.send('keydown', 'Backquote');
    win.send('keyup', 'Backquote');
    expect(kb.poll().buttons.stats).toBe(true);
  });

  it('reports the latched press exactly once', () => {
    win.send('keydown', 'Backquote');
    win.send('keyup', 'Backquote');
    expect(kb.poll().buttons.stats).toBe(true);
    expect(kb.poll().buttons.stats).toBe(false);
  });

  it('keeps reporting a key that is still held', () => {
    win.send('keydown', 'ShiftLeft');
    expect(kb.poll().buttons.run).toBe(true);
    expect(kb.poll().buttons.run).toBe(true);
    win.send('keyup', 'ShiftLeft');
    expect(kb.poll().buttons.run).toBe(false);
  });

  it('maps movement keys on physical code, with arrows as aliases', () => {
    win.send('keydown', 'KeyW');
    expect(kb.poll().moveY).toBeLessThan(0); // north is -z
    win.send('keyup', 'KeyW');
    win.send('keydown', 'ArrowUp');
    expect(kb.poll().moveY).toBeLessThan(0);
  });

  it('cancels opposite keys and normalises a diagonal', () => {
    win.send('keydown', 'KeyW');
    win.send('keydown', 'KeyS');
    const straight = kb.poll();
    expect(straight.moveX).toBe(0);
    expect(straight.moveY).toBe(0);

    win.send('keyup', 'KeyS');
    win.send('keydown', 'KeyD');
    const diagonal = kb.poll();
    expect(Math.hypot(diagonal.moveX, diagonal.moveY)).toBeCloseTo(1, 6);
  });

  it('releases everything when the window loses focus', () => {
    win.send('keydown', 'KeyW');
    expect(kb.poll().moveY).toBeLessThan(0);
    win.send('blur', '');
    expect(kb.poll().moveY).toBe(0);
  });

  it('binds all three interact keys and both shifts', () => {
    for (const code of ['KeyE', 'Enter', 'Space']) {
      win.send('keydown', code);
      expect(kb.poll().buttons.interact, code).toBe(true);
      win.send('keyup', code);
      kb.poll();
    }
    for (const code of ['ShiftLeft', 'ShiftRight']) {
      win.send('keydown', code);
      expect(kb.poll().buttons.run, code).toBe(true);
      win.send('keyup', code);
      kb.poll();
    }
  });
});
