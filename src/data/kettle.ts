// @pure
// Kettle, island 1, transcribed from World Bible §5 and §6.
//
// Two 12 x 12 grids. The token grid is design truth: zone membership, water,
// and the 74-cell denominator for "% explored". The height grid is the terrain
// the player actually walks on. Walkable heights come straight from the §5
// elevation spine and do not move. Cliff heights are the engineer's, tuned by
// the reachability lint until nothing leaks.
//
// Columns c1..c12 run west (x=0) to east (x=120). Rows r1..r12 run north (z=0)
// to south (z=120). Cell (c, r) centre is x = (c - 0.5) * 10, z = (r - 0.5) * 10.

export type Zone = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type CellToken = Zone | '#' | '~';

/** '#' cliff (not designated walkable) · '~' shallow walkable water · A-F zone floor. */
const GRID = [
  '############',
  '#FF##DDD####',
  '#FFF#DDDD###',
  '#E#FFDDDD###',
  '#EE##BBBBCC#',
  '##E#BBBBBCC#',
  '##E#BBBBBCC#',
  '##E#BBBBBCC#',
  '##E#BBBBBC##',
  '##E#AAAA####',
  '##EA~~~A####',
  '###~A~~~####',
] as const;

/**
 * Cell-centre heights in metres above the pool.
 *
 * Walkable values are the World Bible §5 elevation spine, with two deliberate
 * lifts: c5r12 is the dry brass landing stage and c4r11 the dry stone apron.
 *
 * Cliff values are authored so that (a) every §5 zone join is walkable, (b) no
 * adjacency outside the §5 table is, and (c) the only cliff cells a player can
 * stand on are c4 r6-r8, the talus at the foot of the Fernwell west wall that
 * Marlowe ruled on. Faces take the LOWER neighbour's height so the drop lands
 * inside the cell rather than at a cell boundary.
 */
const HEIGHT = [
  [31, 31, 31, 32, 33, 33, 33, 33, 34, 34, 34, 34],
  [31, 24, 24, 31, 31, 12, 12, 12, 33, 34, 34, 34],
  [33, 24, 24, 20.25, 30, 10.5, 10.5, 10.5, 10.5, 33, 34, 34],
  [30, 23, 32, 16.5, 12.75, 9, 9, 9, 9, 20, 33, 34],
  [30, 22, 21, 29, 20, 9, 9, 9, 9, 7, 7, 33],
  [22, 29, 19, 8, 8, 8, 8, 8, 8, 7, 7, 33],
  [21, 27, 17, 7, 7, 7, 7, 7, 7, 7, 7, 33],
  [22, 27, 15, 6, 6, 6, 6, 6, 6, 7, 7, 33],
  [27, 26, 12, 19, 5, 5, 5, 5, 5, 7, 30, 33],
  [28, 24, 9, 16, 5, 5, 5, 5, 30, 31, 32, 33],
  [28, 22, 6, 2.8, 2.8, 2.8, 2.8, 2.8, 29, 30, 31, 32],
  [27, 20, 16, 0.55, 1.2, 0.55, 0.55, 0.55, 27, 29, 30, 31],
] as const;

export const KETTLE = {
  grid: GRID,
  height: HEIGHT,
  /** World Bible §5: the brass landing stage at the gorge mouth, facing north. */
  startCell: { c: 5, r: 12 },
  /** Hushspore spawn banks (M2). Terrace moss, the Fern Cathedral, stream margins. */
  sporeBanks: [
    { c: 3, r: 6 },
    { c: 3, r: 7 },
    { c: 3, r: 8 },
    { c: 3, r: 9 },
    { c: 7, r: 7 },
    { c: 6, r: 9 },
    { c: 7, r: 10 },
  ],
} as const;

const ZONES = new Set<string>(['A', 'B', 'C', 'D', 'E', 'F']);

/** The zone letter for a token, or null for cliff. Water cells carry zone A. */
export function zoneOf(token: string): Zone | null {
  if (token === '~') return 'A';
  return ZONES.has(token) ? (token as Zone) : null;
}

/** Everything but cliff. Water is walkable — the bible says shallow and walkable. */
export function isWalkableToken(token: string): boolean {
  return token !== '#';
}

/** Token at a 1-based cell, or '#' outside the grid. */
export function tokenAtCell(c: number, r: number): CellToken {
  if (c < 1 || c > 12 || r < 1 || r > 12) return '#';
  return GRID[r - 1]![c - 1] as CellToken;
}

/** Authored cell-centre height, or the outside-rim height beyond the grid. */
export function heightAtCell(c: number, r: number): number | null {
  if (c < 1 || c > 12 || r < 1 || r > 12) return null;
  return HEIGHT[r - 1]![c - 1]!;
}

export const cellKey = (c: number, r: number): string => `c${c}r${r}`;

/** World-space centre of a 1-based cell. */
export const cellCentre = (c: number, r: number): [number, number] => [
  (c - 0.5) * 10,
  (r - 0.5) * 10,
];
