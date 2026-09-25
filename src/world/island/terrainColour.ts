// @pure
// Per-face terrain colour from height, gradient and wetness. Flat colour only:
// the palette does the work that texture would do elsewhere.

import { CONFIG } from '../../config';

export type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

const P = CONFIG.palette;
const MOSS_LIGHT = hexToRgb(P.mossLight);
const FERN_DEEP = hexToRgb(P.fernDeep);
const RUIN_BRASS = hexToRgb(P.ruinBrass);
const STEAM_GREY = hexToRgb(P.steamGrey);

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Ground within this many metres above the water line reads as wet. */
export const WET_BAND_M = 0.6;
/** How far the wet band darkens the base colour. */
export const WET_DARKEN = 0.72;
/** Gradient above which ground reads as bare rock face. */
export const ROCK_GRADIENT = 0.9;

/**
 * Colour for a terrain face.
 * `height` in metres, `gradient` in rise over run, both from the heightfield.
 */
export function terrainColourAt(height: number, gradient: number): Rgb {
  // Rock face wins outright: a cliff is a cliff whatever height it is at.
  const rockiness = smoothstep(0.55, ROCK_GRADIENT, gradient);

  // Low, gentle ground is moss; high ground falls into the gorge's deep green.
  const altitude = smoothstep(8, 22, height);
  let colour = mix(MOSS_LIGHT, FERN_DEEP, altitude);

  // A touch of grey on the steepest rock so the walls separate from the ferns.
  const rock = mix(RUIN_BRASS, STEAM_GREY, smoothstep(0.9, 1.6, gradient) * 0.45);
  colour = mix(colour, rock, rockiness);

  // Wet band: the shoreline, sold cheaply by darkening rather than by foam.
  const waterY = CONFIG.units.waterY;
  if (height < waterY + WET_BAND_M) {
    const wetness = 1 - smoothstep(waterY, waterY + WET_BAND_M, height);
    colour = mix(colour, scale(colour, WET_DARKEN), wetness);
  }

  return [clamp01(colour[0]), clamp01(colour[1]), clamp01(colour[2])];
}
