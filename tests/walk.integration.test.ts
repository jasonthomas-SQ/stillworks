import { describe, it, expect } from 'vitest';
import { Keyboard } from '../src/core/input/keyboard';
import { mergeInput, emptyInput, type InputState } from '../src/core/input/merge';
import { Gamepad_ } from '../src/core/input/gamepad';
import {
  stepHero,
  initialHeroState,
  type HeroState,
} from '../src/entities/shim/heroController';
import { CONFIG } from '../src/config';

// "Can Shim walk at all?" — asserted end to end, from a key event through the
// device adapter, the merge, and the controller.
//
// Nothing asserted this before. Every piece was tested in isolation and every
// piece passed, which is exactly the shape of the winding bug: correct parts,
// broken composition. This is the guard for the whole chain.

class FakeWindow {
  private readonly listeners = new Map<string, ((e: never) => void)[]>();
  addEventListener(type: string, fn: (e: never) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(): void {}
  send(type: string, code: string): void {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ code, repeat: false, preventDefault: () => {} } as never);
    }
  }
}

/** Runs the real input chain for `seconds`, with `code` held throughout. */
function walk(
  code: string | null,
  seconds: number,
  start: HeroState = initialHeroState(),
  dt = 1 / 60,
): { hero: HeroState; input: InputState } {
  const win = new FakeWindow();
  const keyboard = new Keyboard(win as unknown as Window);
  const gamepad = new Gamepad_();
  let input = emptyInput();
  let hero = start;

  if (code) win.send('keydown', code);
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    input = mergeInput(input, [keyboard.poll(), gamepad.poll()]);
    hero = stepHero(
      hero,
      {
        moveX: input.moveX,
        moveY: input.moveY,
        magnitude: input.magnitude,
        run: input.held.run,
      },
      0,
      dt,
    );
  }
  if (code) win.send('keyup', code);
  return { hero, input };
}

describe('Shim walks, end to end', () => {
  it('moves at least 3 m north in 2 s with W held', () => {
    const start = initialHeroState();
    const { hero, input } = walk('KeyW', 2, start);

    expect(input.moveY).toBeLessThan(0); // north is -z
    expect(input.magnitude).toBeCloseTo(1, 6);
    expect(start.z - hero.z).toBeGreaterThan(3);
    expect(hero.distanceTravelled).toBeGreaterThan(3);
  });

  it('stops within 0.6 s of release', () => {
    const moving = walk('KeyW', 2).hero;
    expect(moving.speed).toBeGreaterThan(1);

    const coasted = walk(null, 0.6, moving).hero;
    expect(coasted.speed).toBeLessThan(0.05);

    // And it did not keep sliding a meaningful distance.
    expect(Math.hypot(coasted.x - moving.x, coasted.z - moving.z)).toBeLessThan(0.6);
  });

  it('walks and runs at the configured speeds', () => {
    const walked = walk('KeyW', 2).hero;
    expect(walked.speed).toBeGreaterThan(CONFIG.hero.walkSpeed * 0.8);
    expect(walked.speed).toBeLessThanOrEqual(CONFIG.hero.walkSpeed + 1e-6);
  });

  it('moves the other three directions too', () => {
    const start = initialHeroState();
    expect(walk('KeyS', 1, start).hero.z).toBeGreaterThan(start.z);
    expect(walk('KeyD', 1, start).hero.x).toBeGreaterThan(start.x);
    expect(walk('KeyA', 1, start).hero.x).toBeLessThan(start.x);
  });

  it('does not move with no key held', () => {
    const start = initialHeroState();
    const { hero } = walk(null, 2, start);
    expect(hero.x).toBe(start.x);
    expect(hero.z).toBe(start.z);
    expect(hero.distanceTravelled).toBe(0);
  });

  it('walks the same distance at 30 fps and 120 fps', () => {
    const slow = walk('KeyW', 2, initialHeroState(), 1 / 30).hero;
    const fast = walk('KeyW', 2, initialHeroState(), 1 / 120).hero;
    expect(Math.abs(slow.distanceTravelled - fast.distanceTravelled)).toBeLessThan(0.1);
  });

  it('crosses out of the start cell and up the stair in 6 s', () => {
    const hero = walk('KeyW', 6).hero;
    // The stair runs north from r12 to r10, climbing to +5 m.
    expect(hero.z).toBeLessThan(105);
    expect(hero.y).toBeGreaterThan(3);
  });
});
