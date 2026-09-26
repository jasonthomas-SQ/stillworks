// @pure
// Does a tree fern stand between the camera and Shim?
//
// The M2 check found the Fernwell canopy covering 80% of the frame with Shim
// entirely hidden, and my occlusion sweep reporting blocked:false throughout —
// because it marched the height field and nothing else. Terrain was never the
// only thing that can get in the way.
//
// The camera is fixed, so this is static and answerable offline. Jason's call
// at the M2 check was that Shim walking UNDER the canopy is wanted — §4-B has
// "the camera looks down through frond gaps" — so the answer is not to move the
// ferns out of the walkable area, which would delete that, but to stipple away
// only the fronds that come between the lens and Shim.
//
// This module is therefore the verification harness for that fade rather than a
// scatter filter: it finds every cell where a crown crosses the sight line, and
// the test asserts the fade corridor is wide enough to clear Shim at all of
// them.

import { CONFIG } from '../../config';
import { groundHeightAt } from '../island/heightfield';
import { resolveCamera } from '../../core/camera/occlusion';

/**
 * A tree fern's crown as a cylinder in local space, before scaling.
 *
 * Taken from buildTreeFernGeometry: the trunk is 6.4 m, fronds are pinned at
 * y = 6.3 and sweep out about 2.9 m horizontally while rising about 1.8 m.
 * Margins are deliberate — a crown that only just clears the line would clip
 * Shim's head on the frame where the camera is mid-damp.
 */
export const CROWN_BOTTOM = 5.6;
export const CROWN_TOP = 8.4;
export const CROWN_RADIUS = 3.2;

export type Occluder = {
  x: number;
  z: number;
  /** Ground height at the base. */
  y: number;
  scale: number;
};

/** Where the camera sits and where it looks, for a hero standing at (x, z). */
export function sightSegment(
  x: number,
  z: number,
): { cx: number; cy: number; cz: number; tx: number; ty: number; tz: number } {
  const ty = groundHeightAt(x, z) + 0.6;
  const { cx, cy, cz } = resolveCamera(x, ty, z);
  return { cx, cy, cz, tx: x, ty, tz: z };
}

/**
 * True when this fern's crown intersects the camera-to-hero line for a hero
 * standing at (heroX, heroZ).
 *
 * Marched rather than solved: a cylinder-segment intersection is exact but
 * fiddly, and 60 samples of a 32 m line is nothing at scatter time.
 */
export function crownBlocks(
  fern: Occluder,
  heroX: number,
  heroZ: number,
  step = 0.45,
): boolean {
  const { cx, cy, cz, tx, ty, tz } = sightSegment(heroX, heroZ);

  const bottom = fern.y + CROWN_BOTTOM * fern.scale;
  const top = fern.y + CROWN_TOP * fern.scale;
  const radius = CROWN_RADIUS * fern.scale;
  const radiusSq = radius * radius;

  const length = Math.hypot(tx - cx, ty - cy, tz - cz);
  const samples = Math.max(2, Math.ceil(length / step));

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const py = cy + (ty - cy) * t;
    if (py < bottom || py > top) continue;
    const px = cx + (tx - cx) * t;
    const pz = cz + (tz - cz) * t;
    const dx = px - fern.x;
    const dz = pz - fern.z;
    if (dx * dx + dz * dz <= radiusSq) return true;
  }
  return false;
}

/**
 * Cells whose sight line this fern could possibly cross.
 *
 * The camera sits a fixed offset from the hero, so a fern can only trouble
 * cells within a crown's width in x and within the camera's setback in z. That
 * turns a 70-cell check per candidate into about six, which is what makes the
 * rejection affordable at startup.
 */
export function cellsAtRisk<T extends { x: number; z: number }>(
  fern: Occluder,
  cells: readonly T[],
): T[] {
  const reach = CROWN_RADIUS * fern.scale + 1;
  const setback = Math.cos((CONFIG.camera.pitchDeg * Math.PI) / 180) * CONFIG.camera.distance;
  return cells.filter(
    (c) =>
      Math.abs(c.x - fern.x) <= reach + 1 &&
      fern.z - c.z >= -reach &&
      fern.z - c.z <= setback + reach,
  );
}

/** True when this fern blocks the view of a hero standing on any of these cells. */
export function blocksAnyCell(
  fern: Occluder,
  cells: readonly { x: number; z: number }[],
): boolean {
  for (const cell of cellsAtRisk(fern, cells)) {
    if (crownBlocks(fern, cell.x, cell.z)) return true;
  }
  return false;
}

/** Every cell from which one of these ferns hides the hero. For the sweep. */
export function blockedCells(
  ferns: readonly Occluder[],
  cells: readonly { x: number; z: number; key: string }[],
): string[] {
  const blocked = new Set<string>();
  for (const fern of ferns) {
    for (const cell of cellsAtRisk(fern, cells)) {
      if (blocked.has(cell.key)) continue;
      if (crownBlocks(fern, cell.x, cell.z)) blocked.add(cell.key);
    }
  }
  return [...blocked].sort();
}
