import { describe, it, expect } from 'vitest';
import { windGainAt, waterGainAt, planFootsteps, footstepRate } from './synth';
import { distanceToWater, groundHeightAt } from '../../world/island/heightfield';
import { cellCentre } from '../../data/kettle';
import { CONFIG } from '../../config';

// The WebAudio graph itself has no meaningful Node-side surface and a mock
// would only test the mock. What IS testable is every number that drives it,
// and those live in synth.ts on purpose.

describe('wind', () => {
  it('is louder up on the terrace than down on the gorge floor', () => {
    const floor = windGainAt(groundHeightAt(...cellCentre(7, 7)), 0.5);
    const terrace = windGainAt(groundHeightAt(...cellCentre(3, 6)), 0.5);
    const loft = windGainAt(groundHeightAt(...cellCentre(2, 2)), 0.5);
    expect(terrace).toBeGreaterThan(floor);
    expect(loft).toBeGreaterThan(terrace);
  });

  it('never goes silent, and never exceeds the sky gain', () => {
    for (let y = -2; y <= 30; y += 1) {
      const g = windGainAt(y, 0.8);
      expect(g).toBeGreaterThan(0);
      expect(g).toBeLessThanOrEqual(0.8);
    }
  });

  it('follows the sky state, which is windier at night', () => {
    expect(windGainAt(10, 0.8)).toBeGreaterThan(windGainAt(10, 0.35));
  });
});

describe('water ambience', () => {
  it('is loudest on the water and quietest at the top of the island', () => {
    // c7r7 is NOT the comparison point: the stream runs through it, so it is
    // as loud as the pool — which is right, and is what §7 asks for.
    const pool = waterGainAt(distanceToWater(...cellCentre(6, 11)));
    const stream = waterGainAt(distanceToWater(...cellCentre(7, 7)));
    const awayFromStream = waterGainAt(distanceToWater(...cellCentre(9, 7)));
    const loft = waterGainAt(distanceToWater(...cellCentre(2, 2)));

    expect(pool).toBeCloseTo(stream, 2);
    expect(pool).toBeGreaterThan(awayFromStream);
    expect(awayFromStream).toBeGreaterThan(loft);
  });

  // World Bible §7: water is "always moving and always audible".
  it('is never silent anywhere on the island', () => {
    for (let r = 1; r <= 12; r++) {
      for (let c = 1; c <= 12; c++) {
        const g = waterGainAt(distanceToWater(...cellCentre(c, r)));
        expect(g, `c${c}r${r}`).toBeGreaterThan(0.05);
      }
    }
  });

  it('puts the stream within earshot along the length of Fernwell', () => {
    for (const r of [5, 6, 7, 8, 9]) {
      expect(distanceToWater(...cellCentre(7, r)), `c7r${r}`).toBeLessThan(12);
    }
  });
});

describe('footsteps', () => {
  it('fires one step per stride of travel, not per unit of time', () => {
    const stride = CONFIG.hero.strideLength;
    const perFrame = (stride * 10) / 400;
    let carry = 0;
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const plan = planFootsteps(carry, perFrame);
      carry = plan.remainder;
      total += plan.steps;
    }
    // Ten strides of distance gives ten steps, give or take the last one
    // straddling the final frame through floating-point accumulation.
    expect(total).toBeGreaterThanOrEqual(9);
    expect(total).toBeLessThanOrEqual(10);
    // And no distance is lost: what was walked is either stepped or carried.
    expect(total * stride + carry).toBeCloseTo(perFrame * 400, 6);
  });

  it('fires nothing when the hero is not moving', () => {
    let carry = 0;
    for (let i = 0; i < 100; i++) {
      const plan = planFootsteps(carry, 0);
      carry = plan.remainder;
      expect(plan.steps).toBe(0);
    }
  });

  it('gives the same step count for a walk and a run over the same distance', () => {
    const walk = planFootsteps(0, 10);
    const run = planFootsteps(0, 10);
    expect(walk.steps).toBe(run.steps);
  });

  it('catches up rather than dropping steps after a long frame', () => {
    expect(planFootsteps(0, CONFIG.hero.strideLength * 3).steps).toBe(3);
  });

  it('varies pitch but stays inside a tenth either way', () => {
    const rates = Array.from({ length: 50 }, (_, i) => footstepRate(i, false));
    expect(Math.min(...rates)).toBeGreaterThanOrEqual(0.9);
    expect(Math.max(...rates)).toBeLessThanOrEqual(1.1);
    expect(new Set(rates).size).toBeGreaterThan(40);
  });

  it('is deterministic — the same walk sounds the same twice', () => {
    expect(footstepRate(7, false)).toBe(footstepRate(7, false));
  });

  it('sounds different in water', () => {
    expect(footstepRate(3, true)).toBeLessThan(footstepRate(3, false));
  });
});
