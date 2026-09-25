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

/** Fixed camera offset from the look-at target. Same maths as FollowCamera. */
export function cameraOffset(): { ox: number; oy: number; oz: number } {
  const { pitchDeg, yawDeg, distance } = CONFIG.camera;
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

/** Camera position for a hero standing at rest at (x, z, y). Mirrors FollowCamera. */
export function cameraPositionFor(
  x: number,
  y: number,
  z: number,
): { cx: number; cy: number; cz: number; tx: number; ty: number; tz: number } {
  const { ox, oy, oz } = cameraOffset();
  const tx = x;
  const ty = y + 0.6;
  const tz = z;
  const cx = tx + ox;
  const cz = tz + oz;
  return { cx, cy: liftAboveGround(cx, ty + oy, cz), cz, tx, ty, tz };
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
  const { cx, cy, cz, tx, ty, tz } = cameraPositionFor(x, y, z);

  const cameraBuried = groundHeightAt(cx, cz) > cy;

  let worstIntrusion = -Infinity;
  let worstAt = 0;

  const length = Math.hypot(tx - cx, ty - cy, tz - cz);
  const samples = Math.max(2, Math.ceil(length / step));

  // Skip the endpoints: at t=1 the line meets the hero's own ground, and at
  // t=0 it starts at the camera, neither of which is an obstruction.
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const px = cx + (tx - cx) * t;
    const py = cy + (ty - cy) * t;
    const pz = cz + (tz - cz) * t;
    const intrusion = groundHeightAt(px, pz) - (py - clearance);
    if (intrusion > worstIntrusion) {
      worstIntrusion = intrusion;
      worstAt = t;
    }
  }

  return {
    blocked: worstIntrusion > 0,
    cameraBuried,
    worstIntrusion,
    worstAt,
  };
}
