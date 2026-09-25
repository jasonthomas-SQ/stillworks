// @pure
// Seeded 2D value noise with fBm summation. Hand-rolled rather than a library
// because it has to be pure, seedable and testable in Node, and the wrapper to
// make a library satisfy those three would be most of this file anyway.

import { hash2 } from './rng';

const smootherstep = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Single octave of value noise, in [-1, 1]. */
function valueNoise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smootherstep(x - xi);
  const yf = smootherstep(y - yi);

  const n00 = hash2(xi, yi, seed);
  const n10 = hash2(xi + 1, yi, seed);
  const n01 = hash2(xi, yi + 1, seed);
  const n11 = hash2(xi + 1, yi + 1, seed);

  const top = n00 + (n10 - n00) * xf;
  const bottom = n01 + (n11 - n01) * xf;
  return (top + (bottom - top) * yf) * 2 - 1;
}

/**
 * Fractal Brownian motion over `octaves` of value noise, normalised to [-1, 1].
 * `scale` is the feature size of the first octave in world units.
 */
export function fbm2(
  x: number,
  z: number,
  seed: number,
  octaves: number,
  scale: number,
): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1 / scale;

  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(x * frequency, z * frequency, seed + i * 1013) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return total === 0 ? 0 : sum / total;
}

/**
 * Measured upper bound on |grad fbm2| per unit of amplitude, at the octaves and
 * scale this game uses (3 octaves, 6 m). Asserted in noise.test.ts, and used by
 * the heightfield to size its detail amplitude so terrain noise can never push a
 * walkable ramp past the slope limit.
 */
export const FBM_MAX_GRADIENT_PER_AMPLITUDE = 0.85;
