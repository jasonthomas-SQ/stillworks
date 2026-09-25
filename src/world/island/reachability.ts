// @pure
// Flood fill over the island under the slope rule, from the start cell.
//
// Checkpoint A correction 1: this is TOKEN-AGNOSTIC on purpose. An earlier
// version walked walkable tokens only, which meant the slope rule was never
// asked about a cliff cell and every leak through one was invisible. It walks
// all 144 cells and asks only the question the hero controller asks.
//
// The expected result is the 74 walkable cells plus exactly the three talus
// cells Marlowe ruled standable. Anything else reachable is a leak.

import { CONFIG } from '../../config';
import { KETTLE, cellCentre, cellKey } from '../../data/kettle';
import { slopeBetween } from './heightfield';

const GRID = CONFIG.units.gridCells;

/**
 * Cliff cells a player is allowed to stand on: the talus at the foot of the
 * Fernwell west wall. Marlowe's ruling, 26/09/2026 — standing at the foot and
 * seeing Pell on the terrace overhead is a wanted beat. They stay cliff tokens,
 * are not a zone, and are not in the 74-cell "% explored" denominator.
 */
export const ALLOWED_CLIFF_STANDING = ['c4r6', 'c4r7', 'c4r8'] as const;

export type ReachOptions = {
  /** Disable one join, to prove the loop has two arms. */
  blockJoin?: [string, string];
};

export function reachableCells(opts: ReachOptions = {}): Set<string> {
  const blocked = new Set<string>();
  if (opts.blockJoin) {
    const [a, b] = opts.blockJoin;
    blocked.add(`${a}|${b}`);
    blocked.add(`${b}|${a}`);
  }

  const { c: sc, r: sr } = KETTLE.startCell;
  const reached = new Set<string>([cellKey(sc, sr)]);
  const queue: [number, number][] = [[sc, sr]];

  while (queue.length > 0) {
    const [c, r] = queue.shift()!;
    const [x, z] = cellCentre(c, r);

    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 1 || nc > GRID || nr < 1 || nr > GRID) continue;

      const key = cellKey(nc, nr);
      if (reached.has(key)) continue;
      if (blocked.has(`${cellKey(c, r)}|${key}`)) continue;

      const [nx, nz] = cellCentre(nc, nr);
      // Strict: a step sitting exactly on the limit is rejected.
      if (slopeBetween(x, z, nx, nz) >= CONFIG.hero.slopeLimit) continue;

      reached.add(key);
      queue.push([nc, nr]);
    }
  }

  return reached;
}
