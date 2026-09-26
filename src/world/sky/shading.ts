// @pure
// An approximation of what the renderer will do to a surface colour.
//
// It exists so that "can the player see the ground at midnight" and "is shade
// cooler than sunlight at dusk" are assertions rather than visual checks. It is
// not the renderer — it is three's Lambert and hemisphere terms written out in
// the same form, which is close enough to catch a floor that goes black or a
// frame that goes sepia.

import type { Rgb, SkyState } from './skyPalette';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Rec. 709 luminance. */
export function luminance(c: Rgb): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** How warm a colour is: red minus blue. Negative is cool. */
export function warmth(c: Rgb): number {
  return c[0] - c[2];
}

/**
 * Approximate lit colour of a surface.
 *
 * `normalY` is the surface normal's vertical component: 1 for flat ground,
 * 0 for a vertical cliff face. `sunLit` is false for a surface in shadow.
 */
export function approximateLit(
  base: Rgb,
  normal: [number, number, number],
  state: SkyState,
  sunDir: [number, number, number],
  sunLit = true,
): Rgb {
  // Hemisphere: sky above, ground bounce below, blended by the normal.
  const mixK = 0.5 * normal[1] + 0.5;
  const hemi: Rgb = [
    (state.hemiGround[0] + (state.hemiSky[0] - state.hemiGround[0]) * mixK) *
      state.hemiIntensity,
    (state.hemiGround[1] + (state.hemiSky[1] - state.hemiGround[1]) * mixK) *
      state.hemiIntensity,
    (state.hemiGround[2] + (state.hemiSky[2] - state.hemiGround[2]) * mixK) *
      state.hemiIntensity,
  ];

  const lambert = sunLit
    ? Math.max(0, normal[0] * sunDir[0] + normal[1] * sunDir[1] + normal[2] * sunDir[2])
    : 0;

  const out: Rgb = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const light = hemi[i]! + state.sunColour[i]! * state.sunIntensity * lambert;
    out[i] = clamp01(base[i]! * light);
  }
  return out;
}

/** Flat ground facing up. */
export const UP: [number, number, number] = [0, 1, 0];
/** A vertical cliff face pointing east, the common case in a north-south gorge. */
export const EAST_FACE: [number, number, number] = [1, 0, 0];
