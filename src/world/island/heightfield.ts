// @pure
// The terrain. An authored 12 x 12 cell-height grid, bilinearly interpolated,
// plus a gradient-gated fbm detail layer.
//
// Bilinear rather than smoothstep on purpose: smoothstep's gradient peaks at
// 1.5x the cell-to-cell average mid-span, which would reject the Northstair.
// Bilinear makes the gradient equal the authored average, so the numbers in the
// height grid ARE the slopes and the slope limit behaves exactly as designed.
//
// Walkability comes from slope alone. There are no invisible walls: a cliff is a
// steep step up, the open sea is the same rule with the sign flipped.

import { CONFIG } from '../../config';
import { fbm2, FBM_MAX_GRADIENT_PER_AMPLITUDE } from '../../core/math/noise';
import { heightAtCell, tokenAtCell, type CellToken } from '../../data/kettle';

const CELL = CONFIG.units.cell;
const GRID = CONFIG.units.gridCells;
const ISLAND_M = CELL * GRID;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Authored height for a cell, extended beyond the grid. South of the island the
 * sea floor drops away so the slope rule stops the hero at the water's edge
 * without an invisible wall; the other three sides are solid rim.
 */
function cellHeight(c: number, r: number): number {
  const inside = heightAtCell(c, r);
  if (inside !== null) return inside;
  if (r > GRID) {
    // One mirrored row of shallow shelf south of the island, so the hero can
    // wade a few metres past the gorge mouth and stop where the sea floor
    // plunges. Without it the stop line lands on the r12 cell centres and
    // reads as an invisible wall instead of a shoreline.
    if (r === GRID + 1) return heightAtCell(clamp(c, 1, GRID), GRID)!;
    return CONFIG.terrain.seaFloorY;
  }
  return CONFIG.terrain.outsideRimY;
}

const isCliffCell = (c: number, r: number): boolean => tokenAtCell(c, r) === '#';

/**
 * The steepest step out of this cell to another WALKABLE cell, in rise over run.
 * Walkable neighbours only, on purpose: a cell's own ramp is what the detail
 * layer must not break, and every Northstair flight and every pool cell sits
 * next to a cliff. Taking the max over all neighbours instead treated them as
 * cliffs and buried the stair under 1.5 m of rock noise.
 */
function rampGradient(c: number, r: number): number {
  const h = cellHeight(c, r);
  let worst = 0;
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (isCliffCell(c + dc, r + dr)) continue;
    worst = Math.max(worst, Math.abs(cellHeight(c + dc, r + dr) - h) / CELL);
  }
  return worst;
}

/** Bilinear weights and corner indices for a world position. */
function patch(x: number, z: number): { c0: number; r0: number; tx: number; tz: number } {
  // Cell centres sit at (c - 0.5) * CELL, so shift by half a cell before flooring.
  const fc = x / CELL + 0.5;
  const fr = z / CELL + 0.5;
  const c0 = Math.floor(fc);
  const r0 = Math.floor(fr);
  return { c0, r0, tx: fc - c0, tz: fr - r0 };
}

/** Bilinear blend of any per-cell quantity, using the same weights as the height. */
function blend(
  x: number,
  z: number,
  at: (c: number, r: number) => number,
): number {
  const { c0, r0, tx, tz } = patch(x, z);
  const top = at(c0, r0) + (at(c0 + 1, r0) - at(c0, r0)) * tx;
  const bottom = at(c0, r0 + 1) + (at(c0 + 1, r0 + 1) - at(c0, r0 + 1)) * tx;
  return top + (bottom - top) * tz;
}

/** Bilinear blend of the four surrounding cell centres. No detail layer. */
function baseHeight(x: number, z: number): number {
  return blend(x, z, cellHeight);
}

/**
 * Magnitude of the base surface gradient. Measured with a small central
 * difference so it reports the local patch slope rather than averaging across
 * a cell seam.
 */
function baseGradient(x: number, z: number): number {
  const h = 0.05;
  const gx = (baseHeight(x + h, z) - baseHeight(x - h, z)) / (2 * h);
  const gz = (baseHeight(x, z + h) - baseHeight(x, z - h)) / (2 * h);
  return Math.hypot(gx, gz);
}

/**
 * Detail amplitude at a point, gated by the interpolated per-cell gradient.
 *
 * Checkpoint A correction 4: a 3-octave fbm has a measured gradient up to 0.85
 * per unit of amplitude. At 0.12 m that is ~0.10 of slope, which on an authored
 * 0.5 ramp would push a single 0.04 m hero step past the 0.6 limit and stall
 * Shim mid-stair while a 10 m cell-to-cell lint still passed. So the amplitude
 * fades out as the gradient rises: full on flat ground, near zero on any
 * walkable ramp. Cliff faces get their own coarse layer — they are already
 * impassable, so noise there can neither open nor close a route.
 *
 * The gate is computed PER CELL and then interpolated, not sampled from the
 * local surface gradient. Sampling locally made the gate discontinuous at cell
 * seams, where the true gradient jumps: the gate flickered, the detail term
 * jumped with it, and a 4 cm step across the A-E join measured a slope of 1.29
 * on ground whose real slope is 0.32. Interpolating a per-cell gate makes the
 * detail layer exactly as continuous as the surface under it.
 */
function detailAt(x: number, z: number): number {
  const gentle = blend(x, z, (c, r) =>
    isCliffCell(c, r) ? 0 : 1 - smoothstep(0.25, 0.55, rampGradient(c, r)),
  );
  const cliff = blend(x, z, (c, r) => (isCliffCell(c, r) ? 1 : 0));

  let d = 0;
  if (gentle > 0) {
    d +=
      fbm2(x, z, CONFIG.seed, 3, CONFIG.terrain.detailScale) *
      CONFIG.terrain.detailAmplitude *
      gentle;
  }
  if (cliff > 0) {
    d +=
      fbm2(x, z, CONFIG.seed + 7919, 3, CONFIG.terrain.cliffScale) *
      CONFIG.terrain.cliffAmplitude *
      cliff;
  }
  return d;
}

/** Worst-case slope the gentle detail layer can add. Asserted in the test. */
export const MAX_DETAIL_SLOPE =
  CONFIG.terrain.detailAmplitude * FBM_MAX_GRADIENT_PER_AMPLITUDE;

/**
 * The continuous height field. This is what the island mesh samples at its
 * vertices — it is not what the hero walks on. Use groundHeightAt for that.
 */
export function heightAt(x: number, z: number): number {
  return baseHeight(x, z) + detailAt(x, z);
}

const SPACING = CONFIG.units.sampleSpacing;

/**
 * Height of the RENDERED surface: the flat triangle the mesh actually draws,
 * by barycentric lookup on the same diagonal split islandMesh uses.
 *
 * The hero walks on the triangles they can see, so this — not heightAt — is
 * what the controller and the camera query. Sampling the smooth field instead
 * left Shim's feet up to 6 cm off the drawn surface next to cliffs, where the
 * coarse rock noise curves inside a quad. Querying the surface directly makes
 * the agreement exact by construction rather than within a tolerance.
 */
export function groundHeightAt(x: number, z: number): number {
  const qx = Math.floor(x / SPACING);
  const qz = Math.floor(z / SPACING);
  const fx = x / SPACING - qx;
  const fz = z / SPACING - qz;

  const x0 = qx * SPACING;
  const z0 = qz * SPACING;
  const h00 = heightAt(x0, z0);

  // Triangle A is (0,0)-(1,0)-(1,1): the half where fz <= fx.
  if (fz <= fx) {
    const h10 = heightAt(x0 + SPACING, z0);
    const h11 = heightAt(x0 + SPACING, z0 + SPACING);
    return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
  }
  // Triangle B is (0,0)-(1,1)-(0,1).
  const h01 = heightAt(x0, z0 + SPACING);
  const h11 = heightAt(x0 + SPACING, z0 + SPACING);
  return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
}

/**
 * Rise over run between two world positions, measured on the rendered surface.
 * The only walkability rule there is.
 */
export function slopeBetween(ax: number, az: number, bx: number, bz: number): number {
  const run = Math.hypot(bx - ax, bz - az);
  if (run === 0) return 0;
  return Math.abs(groundHeightAt(bx, bz) - groundHeightAt(ax, az)) / run;
}

/** True when a step from a to b is permitted. Strict: exactly at the limit fails. */
export function canStep(ax: number, az: number, bx: number, bz: number): boolean {
  return slopeBetween(ax, az, bx, bz) < CONFIG.hero.slopeLimit;
}

/** 1-based cell containing a world position. Clamped to the grid. */
export function cellAt(x: number, z: number): { c: number; r: number } {
  return {
    c: clamp(Math.floor(x / CELL) + 1, 1, GRID),
    r: clamp(Math.floor(z / CELL) + 1, 1, GRID),
  };
}

/** Design token at a world position, '#' outside the island. */
export function tokenAt(x: number, z: number): CellToken {
  if (x < 0 || z < 0 || x >= ISLAND_M || z >= ISLAND_M) return '#';
  const { c, r } = cellAt(x, z);
  return tokenAtCell(c, r);
}

/** True on one of the seven shallow water cells. */
export function isWaterAt(x: number, z: number): boolean {
  return tokenAt(x, z) === '~';
}

/** Upward surface normal, by central difference. */
export function surfaceNormalAt(x: number, z: number): [number, number, number] {
  const h = 0.5;
  const gx = (heightAt(x + h, z) - heightAt(x - h, z)) / (2 * h);
  const gz = (heightAt(x, z + h) - heightAt(x, z - h)) / (2 * h);
  const len = Math.hypot(gx, 1, gz);
  return [-gx / len, 1 / len, -gz / len];
}

/** Base-surface gradient magnitude, exposed for terrain colouring. */
export function gradientAt(x: number, z: number): number {
  return baseGradient(x, z);
}
