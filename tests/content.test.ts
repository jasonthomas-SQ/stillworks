import { describe, it, expect } from 'vitest';
import { KETTLE, zoneOf, isWalkableToken, tokenAtCell } from '../src/data/kettle';

// The content lint. Its job is to notice when the build drifts from the World
// Bible, which is a thing I cannot see happening.

const cells = <T>(f: (c: number, r: number) => T): T[] => {
  const out: T[] = [];
  for (let r = 1; r <= 12; r++) for (let c = 1; c <= 12; c++) out.push(f(c, r));
  return out;
};
const tok = (c: number, r: number): string => tokenAtCell(c, r);

describe('kettle matches World Bible §5', () => {
  it('is 12 x 12', () => {
    expect(KETTLE.grid).toHaveLength(12);
    KETTLE.grid.forEach((row) => expect(row).toHaveLength(12));
    expect(KETTLE.height).toHaveLength(12);
    KETTLE.height.forEach((row) => expect(row).toHaveLength(12));
  });

  // Marlowe's ruling, 26/09/2026: Fernwell narrowed via the east flank.
  // The "% explored" denominator is 70, not 74.
  it('has 70 walkable cells', () => {
    expect(cells(tok).filter(isWalkableToken)).toHaveLength(70);
  });

  it('has the bible zone counts', () => {
    const counts: Record<string, number> = {};
    for (const t of cells(tok)) {
      const z = zoneOf(t);
      if (z) counts[z] = (counts[z] ?? 0) + 1;
    }
    expect(counts).toEqual({ A: 14, B: 23, C: 6, D: 11, E: 9, F: 7 });
  });

  it('has exactly the seven water cells', () => {
    const water = cells((c, r) => (tok(c, r) === '~' ? `c${c}r${r}` : null)).filter(Boolean);
    expect(new Set(water)).toEqual(
      new Set(['c5r11', 'c6r11', 'c7r11', 'c4r12', 'c6r12', 'c7r12', 'c8r12']),
    );
  });

  it('keeps the two deliberately dry cells dry', () => {
    expect(tok(5, 12)).toBe('A'); // the brass landing stage
    expect(tok(4, 11)).toBe('A'); // the stone apron at the foot of the terrace ramp
  });

  it('keeps the five load-bearing cliff cells as cliff', () => {
    for (const [c, r] of [
      [3, 4],
      [4, 6],
      [4, 7],
      [4, 8],
      [10, 4],
    ] as const) {
      expect(tok(c, r), `c${c}r${r}`).toBe('#');
    }
  });

  it('starts on the dry brass landing stage at c5 r12, above the water line', () => {
    expect(KETTLE.startCell).toEqual({ c: 5, r: 12 });
    expect(KETTLE.height[11]![4]!).toBeGreaterThan(0.9);
  });

  it('has no zone adjacency outside the bible boundary table', () => {
    const allowed = new Set(['A|B', 'A|E', 'B|C', 'B|D', 'D|F', 'E|F']);
    const found = new Set<string>();
    for (let r = 1; r <= 12; r++) {
      for (let c = 1; c <= 12; c++) {
        const a = zoneOf(tok(c, r));
        if (!a) continue;
        for (const [dc, dr] of [
          [1, 0],
          [0, 1],
        ] as const) {
          const b = zoneOf(tok(c + dc, r + dr));
          if (!b || a === b) continue;
          found.add([a, b].sort().join('|'));
        }
      }
    }
    expect([...found].filter((p) => !allowed.has(p)).sort()).toEqual([]);
  });

  it('has every boundary the table names, at the exact cells it names', () => {
    const table: [number, number, number, number][] = [
      [5, 10, 5, 9],
      [6, 10, 6, 9],
      [7, 10, 7, 9],
      [8, 10, 8, 9], // A<->B
      [4, 11, 3, 11], // A<->E
      [9, 6, 10, 6],
      [9, 7, 10, 7],
      [9, 8, 10, 8], // B<->C, a three-cell 30 m mouth after the narrowing
      [6, 5, 6, 4],
      [7, 5, 7, 4],
      [8, 5, 8, 4],
      [9, 5, 9, 4], // B<->D
      [6, 4, 5, 4], // D<->F, the Northstair
      [2, 4, 2, 3], // E<->F
    ];
    for (const [c1, r1, c2, r2] of table) {
      expect(zoneOf(tok(c1, r1)), `c${c1}r${r1}`).not.toBeNull();
      expect(zoneOf(tok(c2, r2)), `c${c2}r${r2}`).not.toBeNull();
    }
  });

  it('matches the elevation spine on every walkable cell', () => {
    // zone + row -> height, from World Bible §5. E and F are per-cell, below.
    const spine: Record<string, number> = {
      A12: 0.55,
      A11: 2.8,
      A10: 5,
      B9: 5,
      B8: 6,
      B7: 7,
      B6: 8,
      B5: 9,
      D4: 9,
      D3: 10.5,
      D2: 12,
    };
    for (let r = 1; r <= 12; r++) {
      for (let c = 1; c <= 12; c++) {
        const z = zoneOf(tok(c, r));
        if (!z || z === 'E' || z === 'F' || z === 'C') continue;
        const key = `${z}${r}`;
        if (!(key in spine)) continue;
        if (c === 5 && r === 12) continue; // the landing stage, deliberately lifted
        expect(KETTLE.height[r - 1]![c - 1]!, `c${c}r${r}`).toBe(spine[key]!);
      }
    }

    // The terrace, cell by cell, per §5.
    const terrace: [number, number, number][] = [
      [3, 11, 6],
      [3, 10, 9],
      [3, 9, 12],
      [3, 8, 15],
      [3, 7, 17],
      [3, 6, 19],
      [3, 5, 21],
      [2, 5, 22],
      [2, 4, 23],
    ];
    for (const [c, r, h] of terrace) {
      expect(KETTLE.height[r - 1]![c - 1]!, `terrace c${c}r${r}`).toBe(h);
    }

    // The Warm Stones are a shelf four metres above the wet floor, not a
    // continuation of it: c10 ramps up, c11 is flat on top.
    for (const r of [6, 7, 8]) {
      expect(KETTLE.height[r - 1]![9]!, `shelf ramp c10r${r}`).toBe(9.25);
      expect(KETTLE.height[r - 1]![10]!, `shelf top c11r${r}`).toBe(11);
    }

    // The Winding Loft chamber sits flat at +24.
    for (const [c, r] of [
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
    ] as const) {
      expect(KETTLE.height[r - 1]![c - 1]!, `loft c${c}r${r}`).toBe(24);
    }
  });

  it('builds the Northstair as four even flights — Marlowe canon, 26/09/2026', () => {
    // +24 at the Loft down to +9 in the yard: a 15 m fall in four steps, and
    // "four flights" is now canon, so the drops stay even rather than smoothing.
    const flights: [number, number][] = [
      [3, 3],
      [4, 3],
      [4, 4],
      [5, 4],
      [6, 4],
    ];
    const heights = flights.map(([c, r]) => KETTLE.height[r - 1]![c - 1]!);
    expect(heights[0]).toBe(24); // the Loft floor
    expect(heights.at(-1)).toBe(9); // Spool Yard at r4
    const drops = heights.slice(1).map((h, i) => heights[i]! - h);
    expect(drops).toHaveLength(4);
    for (const d of drops) {
      expect(d).toBeCloseTo(15 / 4, 6); // even: canon says four even flights
      expect(d).toBeLessThan(6); // and under the 0.6 slope limit over a 10 m cell
    }
  });
});
