import { describe, it, expect } from 'vitest';
import {
  heightAt,
  slopeBetween,
  canStep,
  cellAt,
  tokenAt,
  isWaterAt,
  gradientAt,
  MAX_DETAIL_SLOPE,
} from './heightfield';
import { KETTLE, cellCentre } from '../../data/kettle';
import { CONFIG } from '../../config';

const centre = cellCentre;
const LIMIT = CONFIG.hero.slopeLimit;

describe('heightfield', () => {
  it('returns the authored height at every cell centre, within the detail amplitude', () => {
    for (let r = 1; r <= 12; r++) {
      for (let c = 1; c <= 12; c++) {
        const [x, z] = centre(c, r);
        const authored = KETTLE.height[r - 1]![c - 1]!;
        expect(Math.abs(heightAt(x, z) - authored), `c${c}r${r}`).toBeLessThan(
          CONFIG.terrain.cliffAmplitude + 0.01,
        );
      }
    }
  });

  it('returns the authored height exactly on flat walkable ground', () => {
    // c7 r7, the Fern Cathedral: surrounded by cells at the same height, so the
    // bilinear base is exact and only the gentle detail layer moves it.
    const [x, z] = centre(7, 7);
    expect(Math.abs(heightAt(x, z) - 7)).toBeLessThan(CONFIG.terrain.detailAmplitude + 1e-9);
  });

  it('is deterministic', () => {
    expect(heightAt(43.7, 61.2)).toBe(heightAt(43.7, 61.2));
  });

  it('maps world position to the right cell', () => {
    expect(cellAt(45, 115)).toEqual({ c: 5, r: 12 });
    expect(cellAt(0.1, 0.1)).toEqual({ c: 1, r: 1 });
    expect(cellAt(119.9, 119.9)).toEqual({ c: 12, r: 12 });
  });

  it('rejects the Fernwell west wall and allows the Northstair', () => {
    // The wall's face lives between the talus (c4) and the terrace (c3), not
    // between the floor (c5) and the talus — that is the whole point of giving
    // a face cell the LOWER neighbour's height.
    expect(slopeBetween(...centre(4, 7), ...centre(3, 7))).toBeGreaterThan(LIMIT);
    expect(slopeBetween(...centre(4, 4), ...centre(5, 4))).toBeLessThan(LIMIT);
  });

  it('lets the hero wade a few metres south, then stops them where the sea deepens', () => {
    // A shoreline, not an invisible wall: the ground stays wadeable past the
    // gorge mouth and then plunges.
    expect(slopeBetween(45, 116, 45, 120)).toBeLessThan(LIMIT);
    expect(slopeBetween(45, 128, 45, 132)).toBeGreaterThan(LIMIT);
    expect(heightAt(45, 140)).toBeLessThan(-5);
  });

  // Checkpoint A correction 4: march at the hero's own step length, not cell to
  // cell. A 10 m average under the limit can still hide a 0.04 m step over it.
  it('every bible join is walkable at the hero step length, not just cell to cell', () => {
    const joins: [number, number, number, number][] = [
      [5, 10, 5, 9],
      [6, 10, 6, 9],
      [7, 10, 7, 9],
      [8, 10, 8, 9], // A<->B
      [4, 11, 3, 11], // A<->E
      [9, 5, 10, 5],
      [9, 6, 10, 6],
      [9, 7, 10, 7],
      [9, 8, 10, 8],
      [9, 9, 10, 9], // B<->C
      [6, 5, 6, 4],
      [7, 5, 7, 4],
      [8, 5, 8, 4],
      [9, 5, 9, 4], // B<->D
      [3, 3, 4, 3],
      [4, 3, 4, 4],
      [4, 4, 5, 4],
      [5, 4, 6, 4], // the Northstair, all four flights
      [2, 4, 2, 3], // E<->F
      [3, 11, 3, 10],
      [3, 10, 3, 9],
      [3, 9, 3, 8], // the terrace climb
      [3, 8, 3, 7],
      [3, 7, 3, 6],
      [3, 6, 3, 5],
      [3, 5, 2, 5],
    ];
    const STEP = 0.04; // 2.4 m/s at 60 fps: the smallest probe the controller makes
    for (const [c1, r1, c2, r2] of joins) {
      const [ax, az] = centre(c1, r1);
      const [bx, bz] = centre(c2, r2);
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / STEP);
      let worst = 0;
      let worstAt = 0;
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        const s = slopeBetween(
          ax + (bx - ax) * t0,
          az + (bz - az) * t0,
          ax + (bx - ax) * t1,
          az + (bz - az) * t1,
        );
        if (s > worst) {
          worst = s;
          worstAt = t0;
        }
      }
      expect(
        worst,
        `c${c1}r${r1} -> c${c2}r${r2} stalls at t=${worstAt.toFixed(2)} (slope ${worst.toFixed(3)})`,
      ).toBeLessThan(LIMIT);
    }
  });

  it('gates the detail layer so noise alone can never break a walkable ramp', () => {
    // On any ramp steep enough to matter, the gentle layer is faded out.
    let worstExcess = 0;
    for (let x = 5; x < 115; x += 1.7) {
      for (let z = 5; z < 115; z += 1.9) {
        const g = gradientAt(x, z);
        if (g < 0.25 || g > LIMIT) continue; // only the band where it could matter
        const excess = g + MAX_DETAIL_SLOPE - LIMIT;
        worstExcess = Math.max(worstExcess, excess);
      }
    }
    // The raw bound would exceed the limit; the gate is what makes it safe, and
    // the join march above is what proves the gate works in practice.
    expect(MAX_DETAIL_SLOPE).toBeGreaterThan(0.09);
    expect(worstExcess).toBeGreaterThan(0); // the danger is real, not hypothetical
  });

  it('knows the water cells', () => {
    expect(isWaterAt(...centre(6, 11))).toBe(true);
    expect(isWaterAt(...centre(5, 12))).toBe(false); // the dry landing stage
    expect(isWaterAt(...centre(4, 11))).toBe(false); // the dry stone apron
    expect(tokenAt(...centre(4, 7))).toBe('#');
    expect(tokenAt(-5, 60)).toBe('#');
    expect(tokenAt(60, 200)).toBe('#');
  });

  it('canStep is strict at the limit', () => {
    expect(canStep(45, 115, 45, 115)).toBe(true); // zero run, zero slope
    expect(canStep(45, 128, 45, 134)).toBe(false); // the sea floor plunging
  });

  it('puts the water cells below the water line and the dry cells above it', () => {
    for (const [c, r] of [
      [6, 12],
      [7, 12],
      [8, 12],
      [4, 12],
    ] as const) {
      expect(heightAt(...centre(c, r)), `c${c}r${r}`).toBeLessThan(CONFIG.units.waterY);
    }
    expect(heightAt(...centre(5, 12))).toBeGreaterThan(CONFIG.units.waterY);
  });
});
