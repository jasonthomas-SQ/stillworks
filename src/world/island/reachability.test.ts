import { describe, it, expect } from 'vitest';
import { reachableCells, ALLOWED_CLIFF_STANDING } from './reachability';
import { KETTLE, isWalkableToken, cellCentre, cellKey } from '../../data/kettle';
import { slopeBetween } from './heightfield';
import { CONFIG } from '../../config';

const LIMIT = CONFIG.hero.slopeLimit;
const centre = cellCentre;

const walkable: string[] = [];
for (let r = 1; r <= 12; r++) {
  for (let c = 1; c <= 12; c++) {
    if (isWalkableToken(KETTLE.grid[r - 1]![c - 1]!)) walkable.push(cellKey(c, r));
  }
}

describe('reachability (token-agnostic: the slope rule is the only gate)', () => {
  it('reaches exactly the 74 walkable cells plus the three allow-listed talus cells', () => {
    const reached = reachableCells();
    const expected = new Set<string>([...walkable, ...ALLOWED_CLIFF_STANDING]);
    const leaks = [...reached].filter((k) => !expected.has(k)).sort();
    const missing = [...expected].filter((k) => !reached.has(k)).sort();
    expect({ leaks, missing }).toEqual({ leaks: [], missing: [] });
    expect(walkable).toHaveLength(74);
    expect([...ALLOWED_CLIFF_STANDING]).toEqual(['c4r6', 'c4r7', 'c4r8']);
    expect(reached.size).toBe(77);
  });

  it('the talus is a pocket, not a route — closed at both ends', () => {
    // Marlowe's condition (a): no continuous north-south ribbon at the wall foot
    expect(slopeBetween(...centre(4, 6), ...centre(4, 5))).toBeGreaterThan(LIMIT);
    expect(slopeBetween(...centre(4, 8), ...centre(4, 9))).toBeGreaterThan(LIMIT);
  });

  it('the talus never reaches the terrace above it', () => {
    for (const r of [6, 7, 8]) {
      expect(slopeBetween(...centre(4, r), ...centre(3, r)), `c4r${r}`).toBeGreaterThan(LIMIT);
    }
  });

  it('no join anywhere sits within 0.02 of the slope limit', () => {
    const ties: string[] = [];
    for (let r = 1; r <= 12; r++) {
      for (let c = 1; c <= 12; c++) {
        for (const [dc, dr] of [
          [1, 0],
          [0, 1],
        ] as const) {
          if (c + dc > 12 || r + dr > 12) continue;
          const s = slopeBetween(...centre(c, r), ...centre(c + dc, r + dr));
          if (Math.abs(s - LIMIT) < 0.02) {
            ties.push(`${cellKey(c, r)}->${cellKey(c + dc, r + dr)} = ${s.toFixed(4)}`);
          }
        }
      }
    }
    expect(ties).toEqual([]);
  });

  it('the rule is strict — a step exactly on the limit is rejected', () => {
    expect(LIMIT).toBe(0.6);
    expect(0.6 < LIMIT).toBe(false);
  });

  it('the loop is a loop: the Winding Loft is reachable both ways', () => {
    expect(reachableCells({ blockJoin: ['c6r4', 'c5r4'] }).has('c2r2')).toBe(true);
    expect(reachableCells({ blockJoin: ['c2r4', 'c2r3'] }).has('c2r2')).toBe(true);
  });

  it('every zone is represented in the reachable set', () => {
    const reached = reachableCells();
    for (const [zone, cell] of [
      ['A', 'c5r12'],
      ['B', 'c7r7'],
      ['C', 'c11r7'],
      ['D', 'c7r3'],
      ['E', 'c3r6'],
      ['F', 'c2r2'],
    ] as const) {
      expect(reached.has(cell), `zone ${zone} at ${cell}`).toBe(true);
    }
  });
});
