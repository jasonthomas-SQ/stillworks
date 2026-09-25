import { describe, it, expect } from 'vitest';
import { fbm2, FBM_MAX_GRADIENT_PER_AMPLITUDE } from './noise';
import { makeRng } from './rng';

describe('fbm2', () => {
  it('is deterministic for the same seed', () => {
    expect(fbm2(12.3, 45.6, 7, 3, 6)).toBe(fbm2(12.3, 45.6, 7, 3, 6));
  });

  it('differs for a different seed', () => {
    expect(fbm2(12.3, 45.6, 7, 3, 6)).not.toBe(fbm2(12.3, 45.6, 8, 3, 6));
  });

  it('stays within [-1, 1] over a wide sample', () => {
    for (let x = 0; x < 200; x += 3.7) {
      for (let z = 0; z < 200; z += 4.1) {
        const v = fbm2(x, z, 7, 3, 6);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is continuous — no discontinuity anywhere in a dense sweep', () => {
    for (let x = 0; x < 100; x += 0.05) {
      const a = fbm2(x, 33, 7, 3, 6);
      const b = fbm2(x + 0.05, 33, 7, 3, 6);
      expect(Math.abs(a - b)).toBeLessThan(0.05);
    }
  });

  // Measured, not assumed. The heightfield sizes its detail amplitude against
  // this number, so it is asserted here rather than left as a comment.
  // Checkpoint A correction 4 flagged the gradient; the first estimate was 0.08
  // and the real figure is 0.795. That gap is exactly why this test exists.
  it('has a bounded gradient at the configured octaves and scale', () => {
    expect(FBM_MAX_GRADIENT_PER_AMPLITUDE).toBe(0.85);
    const h = 0.05;
    let worst = 0;
    for (let x = 0; x < 240; x += 0.31) {
      for (let z = 0; z < 240; z += 0.37) {
        const gx = fbm2(x + h, z, 7, 3, 6) - fbm2(x - h, z, 7, 3, 6);
        const gz = fbm2(x, z + h, 7, 3, 6) - fbm2(x, z - h, 7, 3, 6);
        worst = Math.max(worst, Math.hypot(gx, gz) / (2 * h));
      }
    }
    expect(worst).toBeLessThan(FBM_MAX_GRADIENT_PER_AMPLITUDE);
    expect(worst).toBeGreaterThan(0.5); // and it is not accidentally flat
  });

  it('actually varies — a constant would pass every test above', () => {
    const samples = [];
    for (let x = 0; x < 60; x += 1.3) samples.push(fbm2(x, 7.5, 3, 3, 6));
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.4);
  });
});

describe('makeRng', () => {
  it('is deterministic for a seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it('differs for a different seed', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });

  it('stays in [0, 1)', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 5000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform across ten buckets', () => {
    const rng = makeRng(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 20000; i++) buckets[Math.floor(rng() * 10)]! += 1;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(1500);
      expect(count).toBeLessThan(2500);
    }
  });
});
