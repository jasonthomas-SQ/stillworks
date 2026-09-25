// @pure
// Does terrain get between the camera and the hero?
//
// This is the single biggest unknown in a fixed-camera game set in a slot with
// 20 to 34 m walls, and it was my top risk at Checkpoint A precisely because I
// cannot look. It does not have to stay a visual check: the camera offset is a
// fixed function of CONFIG, and the terrain is a height field I can march. So
// the question is answerable in Node, at every walkable cell, in a test.
//
// It uses the same offset maths as FollowCamera and the same ground query as
// the hero, so it cannot drift from what the renderer actually does without the
// test noticing.

import { CONFIG } from '../../config';
import { groundHeightAt } from '../../world/island/heightfield';

const deg = (d: number): number => (d * Math.PI) / 180;

export type OffsetParams = { pitchDeg: number; yawDeg: number; distance: number };

/** Fixed camera offset from the look-at target. Same maths as FollowCamera. */
export function cameraOffset(
  params: OffsetParams = CONFIG.camera,
): { ox: number; oy: number; oz: number } {
  const { pitchDeg, yawDeg, distance } = params;
  const pitch = deg(pitchDeg);
  const yaw = deg(yawDeg);
  return {
    ox: Math.sin(yaw) * Math.cos(pitch) * distance,
    oy: Math.sin(pitch) * distance,
    oz: Math.cos(yaw) * Math.cos(pitch) * distance,
  };
}

/**
 * Lifts a camera position clear of the ground under it.
 *
 * The camera sits 8 m south of the hero, so on the southern lip of the Warm
 * Stones it ends up inside the east cliff at r10 — measured, not guessed: an
 * occlusion sweep of all 74 walkable cells found exactly three where the camera
 * is buried, all of them in the zone the bible calls the island's social room.
 *
 * Lifting only where the ground demands it keeps the framing identical on the
 * other 71 cells, which is why this is preferred over changing pitch or
 * distance globally before anyone has seen the current framing.
 */
export function liftAboveGround(cx: number, cy: number, cz: number): number {
  const floor = groundHeightAt(cx, cz) + CONFIG.camera.groundClearance;
  return cy < floor ? floor : cy;
}

/** How far terrain rises above the camera-to-target line. Negative is clear. */
export function sightLineIntrusion(
  cx: number,
  cy: number,
  cz: number,
  tx: number,
  ty: number,
  tz: number,
  clearance: number,
  step = 0.25,
): { worst: number; at: number } {
  let worst = -Infinity;
  let at = 0;
  const length = Math.hypot(tx - cx, ty - cy, tz - cz);
  const samples = Math.max(2, Math.ceil(length / step));
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const py = cy + (ty - cy) * t;
    const intrusion =
      groundHeightAt(cx + (tx - cx) * t, cz + (tz - cz) * t) - (py - clearance);
    if (intrusion > worst) {
      worst = intrusion;
      at = t;
    }
  }
  return { worst, at };
}

/**
 * Place the camera so it can actually see the hero.
 *
 * Full distance first; if rock is in the way, dolly in along the same line
 * until it clears, lifting clear of the ground at each step. Dollying rather
 * than swinging keeps the fixed angle the brief asks for, and only the handful
 * of positions that need it are affected.
 *
 * The Warm Stones are why this exists: the shelf sits at +7 m with a 30 m cliff
 * immediately south of it, so a camera 32 m south is behind that cliff. Measured
 * across all 74 walkable cells, not guessed.
 */
export function resolveCamera(
  tx: number,
  ty: number,
  tz: number,
  clearance = 0.35,
): { cx: number; cy: number; cz: number; factor: number } {
  const { ox, oy, oz } = cameraOffset();
  let fallback = { cx: tx + ox, cy: ty + oy, cz: tz + oz, factor: 1 };

  for (let factor = 1; factor >= MIN_DOLLY; factor -= 0.05) {
    const cx = tx + ox * factor;
    const cz = tz + oz * factor;
    const cy = liftAboveGround(cx, ty + oy * factor, cz);
    const { worst } = sightLineIntrusion(cx, cy, cz, tx, ty, tz, clearance);
    if (factor === 1) fallback = { cx, cy, cz, factor };
    if (worst <= 0) return { cx, cy, cz, factor };
  }

  // Nothing clears: sit as close as allowed rather than inside the rock.
  const cx = tx + ox * MIN_DOLLY;
  const cz = tz + oz * MIN_DOLLY;
  void fallback;
  return { cx, cy: liftAboveGround(cx, ty + oy * MIN_DOLLY, cz), cz, factor: MIN_DOLLY };
}

/** Closest the camera may dolly in. Below this Shim fills too much of the frame. */
export const MIN_DOLLY = 0.45;

/** Camera position for a hero standing at rest at (x, z, y). Mirrors FollowCamera. */
export function cameraPositionFor(
  x: number,
  y: number,
  z: number,
): { cx: number; cy: number; cz: number; tx: number; ty: number; tz: number; factor: number } {
  const ty = y + 0.6;
  const { cx, cy, cz, factor } = resolveCamera(x, ty, z);
  return { cx, cy, cz, tx: x, ty, tz: z, factor };
}

export type OcclusionResult = {
  /** Terrain rises above the camera-to-hero line somewhere between them. */
  blocked: boolean;
  /** The camera itself is underground. Worse than blocked. */
  cameraBuried: boolean;
  /** Greatest amount, in metres, by which terrain rises above the sight line. */
  worstIntrusion: number;
  /** Where that happened, as a fraction from camera (0) to hero (1). */
  worstAt: number;
  /** 1 means full distance; below 1 the camera dollied in to clear a sight line. */
  dollyFactor: number;
};

/**
 * March the camera-to-hero segment against the ground.
 *
 * `clearance` is how far terrain must stay below the line before it counts as
 * blocking. Shim is 0.9 m tall and the line is aimed 0.6 m up its body, so
 * terrain within ~0.35 m of the line is already clipping the silhouette.
 */
export function occlusionAt(
  x: number,
  z: number,
  { clearance = 0.35, step = 0.25 } = {},
): OcclusionResult {
  const y = groundHeightAt(x, z);
  const { cx, cy, cz, tx, ty, tz, factor } = cameraPositionFor(x, y, z);
  const { worst, at } = sightLineIntrusion(cx, cy, cz, tx, ty, tz, clearance, step);

  return {
    blocked: worst > 0,
    cameraBuried: groundHeightAt(cx, cz) > cy,
    worstIntrusion: worst,
    worstAt: at,
    dollyFactor: factor,
  };
}
