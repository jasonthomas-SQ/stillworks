import { describe, it, expect } from 'vitest';
import { damp, dampAngle } from './damp';

describe('damp', () => {
  it('is frame-rate independent: one 100ms step matches ten 10ms steps', () => {
    const big = damp(0, 10, 8, 0.1);
    let small = 0;
    for (let i = 0; i < 10; i++) small = damp(small, 10, 8, 0.01);
    expect(small).toBeCloseTo(big, 6);
  });

  it('never overshoots the target', () => {
    expect(damp(0, 10, 8, 5)).toBeLessThanOrEqual(10);
    expect(damp(10, 0, 8, 5)).toBeGreaterThanOrEqual(0);
  });

  it('returns the current value when dt is zero', () => {
    expect(damp(3, 10, 8, 0)).toBe(3);
  });

  it('converges toward the target', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = damp(v, 5, 8, 1 / 60);
    expect(v).toBeCloseTo(5, 4);
  });
});

describe('dampAngle', () => {
  it('turns the short way round the wrap', () => {
    const TAU = Math.PI * 2;
    // from 350 degrees to 10 degrees should go forwards, not back through 180
    const result = dampAngle((350 * Math.PI) / 180, (370 * Math.PI) / 180, 10, 1 / 60);
    expect(result).toBeGreaterThan((350 * Math.PI) / 180);
    expect(result).toBeLessThan((350 * Math.PI) / 180 + TAU);
  });

  it('is frame-rate independent', () => {
    const big = dampAngle(0, 1, 8, 0.1);
    let small = 0;
    for (let i = 0; i < 10; i++) small = dampAngle(small, 1, 8, 0.01);
    expect(small).toBeCloseTo(big, 6);
  });

  it('holds still at dt zero', () => {
    expect(dampAngle(1.2, 3, 8, 0)).toBe(1.2);
  });
});
