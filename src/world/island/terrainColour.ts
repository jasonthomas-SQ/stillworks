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
const STEAM_GREY = hexToRgb(P.steamGrey);

/**
 * Rock. World Bible §8 lists Steam Grey for "wet rock"; Ruin Brass is reserved
 * for "the Spool Yard drums, cables, frame and housings" and must not appear on
 * terrain. Using it there made lit slopes read as tan and ochre — sand, in a
 * world whose rock is a cool grey-green.
 *
 * Steam Grey pulled toward Fern Deep: cool, slightly green, clearly not moss,
 * and kept lighter than moss so a wall never reads as a dark hole. The M1 check
 * also reported cliff faces going near-black in shadow, so the base colour
 * carries the separation rather than relying on the light.
 */
const ROCK = mixHex(STEAM_GREY, FERN_DEEP, 0.2);
/** The same rock in the damp lower gorge, greener and darker. */
const ROCK_DAMP = mixHex(STEAM_GREY, FERN_DEEP, 0.4);

function mixHex(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

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
  // The moss/rock line is deliberately tight rather than a long blend: a crisp
  // edge where the floor meets the wall is most of what makes a gorge read as
  // cut. Moss on the floor and the ledges, rock on the faces.
  const rockiness = smoothstep(0.5, 0.75, gradient);

  // Low, gentle ground is moss; high ground falls into the gorge's deep green.
  const altitude = smoothstep(10, 24, height);
  let colour = mix(MOSS_LIGHT, FERN_DEEP, altitude);

  // Rock is damp and green near the stream and the pool, drier and paler up on
  // the rims where nothing keeps it wet.
  const rock = mix(ROCK_DAMP, ROCK, smoothstep(6, 26, height));
  colour = mix(colour, rock, rockiness);

  // Wet band: the shoreline, sold cheaply by darkening rather than by foam.
  const waterY = CONFIG.units.waterY;
  if (height < waterY + WET_BAND_M) {
    const wetness = 1 - smoothstep(waterY, waterY + WET_BAND_M, height);
    colour = mix(colour, scale(colour, WET_DARKEN), wetness);
  }

  return [clamp01(colour[0]), clamp01(colour[1]), clamp01(colour[2])];
}
