// @pure
// Is this point in direct sun at this hour?
//
// World Bible §7 names six lighting states and insists they come from geometry
// rather than from faked keyframes. That makes them checkable: march from a
// point toward the sun and see whether the gorge is in the way. Five of the six
// become test assertions; the sixth (night) is trivially true.
//
// This is how I see the lighting. It proves direct sun reaches a point; it does
// not prove the frame reads as lit once soft shadows, bounce and fog are in it.
// That gap is named, not papered over.

import { groundHeightAt } from '../island/heightfield';
import { sunDirAt } from './sunDir';

/** How far to march before giving up and calling it open sky. */
const MAX_MARCH = 160;
const STEP = 0.75;
/** Start clear of the ground so a point does not shade itself. */
const LIFT = 0.5;

export function inDirectSun(x: number, z: number, t: number): boolean {
  const [dx, dy, dz] = sunDirAt(t);
  if (dy <= 0) return false; // sun below the horizon

  const y0 = groundHeightAt(x, z) + LIFT;
  for (let d = STEP; d <= MAX_MARCH; d += STEP) {
    const py = y0 + dy * d;
    // Once above every rim on the island, nothing can block it.
    if (py > 40) return true;
    if (py <= groundHeightAt(x + dx * d, z + dz * d)) return false;
  }
  return true;
}

export type LitWindow = {
  /** Hours of direct sun in the day. */
  hours: number;
  /** First and last hour with direct sun. */
  start: number;
  end: number;
  /** True when the lit hours form a single unbroken run. */
  contiguous: boolean;
};

/**
 * Sweep the day and report when a point is in direct sun.
 *
 * Used instead of an afternoon assertion: World Bible §4-B wants the Fernwell
 * floor back in shade by mid-afternoon, which at the bible's own proportions
 * would need a west rim around 55 m — a different landscape from the one
 * Marlowe wrote. Measuring the honest window and reporting it is better than
 * bending the gorge to hit a number.
 */
export function litWindowFor(x: number, z: number, resolutionHours = 0.1): LitWindow {
  const lit: number[] = [];
  for (let h = 0; h < 24; h += resolutionHours) {
    if (inDirectSun(x, z, h / 24)) lit.push(h);
  }
  if (lit.length === 0) return { hours: 0, start: 0, end: 0, contiguous: true };

  let gaps = 0;
  for (let i = 1; i < lit.length; i++) {
    if (lit[i]! - lit[i - 1]! > resolutionHours * 1.5) gaps += 1;
  }

  return {
    hours: lit.length * resolutionHours,
    start: lit[0]!,
    end: lit.at(-1)!,
    contiguous: gaps === 0,
  };
}
