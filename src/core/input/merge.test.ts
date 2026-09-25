import { describe, it, expect } from 'vitest';
import { mergeInput, emptyInput, emptyDevice, DEADZONE, type RawDevice, type Action } from './merge';

const dev = (
  moveX = 0,
  moveY = 0,
  buttons: Partial<Record<Action, boolean>> = {},
  kind: RawDevice['kind'] = 'gamepad',
): RawDevice => ({
  ...emptyDevice(kind),
  moveX,
  moveY,
  buttons: { ...emptyDevice(kind).buttons, ...buttons },
});

describe('mergeInput', () => {
  it('applies a radial deadzone, not a per-axis one', () => {
    expect(mergeInput(emptyInput(), [dev(0.1, 0.1)]).magnitude).toBe(0); // 0.141 < 0.15
    expect(mergeInput(emptyInput(), [dev(0.14, 0.14)]).magnitude).toBeGreaterThan(0); // 0.198
  });

  it('rescales past the deadzone so there is no jump at the edge', () => {
    expect(mergeInput(emptyInput(), [dev(DEADZONE + 0.001, 0)]).magnitude).toBeLessThan(0.01);
    expect(mergeInput(emptyInput(), [dev(1, 0)]).magnitude).toBeCloseTo(1, 6);
  });

  it('clamps magnitude to 1 on a square-gated stick', () => {
    expect(mergeInput(emptyInput(), [dev(1, 1)]).magnitude).toBeCloseTo(1, 6);
  });

  it('normalises the direction vector', () => {
    const s = mergeInput(emptyInput(), [dev(0.6, 0.8)]);
    expect(Math.hypot(s.moveX, s.moveY)).toBeCloseTo(1, 6);
  });

  it('reports justPressed on the frame a button goes down, and not after', () => {
    const a = mergeInput(emptyInput(), [dev(0, 0, { interact: true })]);
    expect(a.justPressed.interact).toBe(true);
    const b = mergeInput(a, [dev(0, 0, { interact: true })]);
    expect(b.justPressed.interact).toBe(false);
    const c = mergeInput(b, [dev(0, 0, { interact: false })]);
    expect(c.justPressed.interact).toBe(false);
    const d = mergeInput(c, [dev(0, 0, { interact: true })]);
    expect(d.justPressed.interact).toBe(true);
  });

  it('tracks each action independently', () => {
    const a = mergeInput(emptyInput(), [dev(0, 0, { interact: true })]);
    const b = mergeInput(a, [dev(0, 0, { interact: true, journal: true })]);
    expect(b.justPressed.interact).toBe(false);
    expect(b.justPressed.journal).toBe(true);
  });

  it('takes the strongest stick when two devices are active', () => {
    expect(mergeInput(emptyInput(), [dev(0.3, 0), dev(1, 0)]).magnitude).toBeCloseTo(1, 6);
    expect(mergeInput(emptyInput(), [dev(1, 0), dev(0.3, 0)]).magnitude).toBeCloseTo(1, 6);
  });

  it('ORs buttons across devices', () => {
    const s = mergeInput(emptyInput(), [
      dev(0, 0, { interact: true }, 'keyboard'),
      dev(0, 0, { journal: true }),
    ]);
    expect(s.held.interact).toBe(true);
    expect(s.held.journal).toBe(true);
  });

  it('remembers which device was used last, and keeps it when both go idle', () => {
    const s = mergeInput(emptyInput(), [dev(0, 0, {}, 'keyboard'), dev(1, 0)]);
    expect(s.lastDevice).toBe('gamepad');
    const idle = mergeInput(s, [dev(0, 0, {}, 'keyboard'), dev(0, 0)]);
    expect(idle.lastDevice).toBe('gamepad');
  });

  it('starts with no device — a gamepad stays invisible until it is used', () => {
    expect(emptyInput().lastDevice).toBeNull();
    expect(mergeInput(emptyInput(), [dev(0, 0, {}, 'keyboard'), dev(0, 0)]).lastDevice).toBeNull();
  });

  it('never mutates the previous state', () => {
    const prev = emptyInput();
    const snapshot = JSON.stringify(prev);
    mergeInput(prev, [dev(1, 1, { interact: true })]);
    expect(JSON.stringify(prev)).toBe(snapshot);
  });
});
