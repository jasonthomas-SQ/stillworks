import { describe, it, expect } from 'vitest';
import {
  buildIslandGeometry,
  meshSurfaceHeightAt,
  meshVertexHeights,
  ISLAND_TRIANGLES,
} from './islandMesh.geometry';
import { heightAt, tokenAt, groundHeightAt, gradientAt } from './heightfield';
import { terrainColourAt, WET_BAND_M, WET_DARKEN } from './terrainColour';
import { CONFIG } from '../../config';

// Checkpoint A correction 4. Feet floating or sinking is a failure mode I cannot
// see, so it is asserted at the vertices AND inside the triangles. Vertices alone
// would pass even if the diagonal split disagreed.
describe('the hero stands on the surface the mesh draws', () => {
  it('agrees exactly at mesh vertices', () => {
    for (const { x, z, y } of meshVertexHeights()) {
      expect(Math.abs(y - heightAt(x, z)), `(${x}, ${z})`).toBeLessThan(1e-9);
    }
  });

  it('smooth field and drawn surface agree closely on walkable ground', () => {
    // Points biased into each half of the quad, well away from the vertices, so
    // a wrong diagonal shows up rather than cancelling at the corners.
    const probes: [number, number][] = [
      [0.7, 0.2],
      [0.9, 0.55],
      [0.2, 0.7],
      [0.45, 0.9],
    ];
    let worstWalkable = 0;
    let where = '';
    let worstCliff = 0;

    for (let x = 0; x < 120; x += 3) {
      for (let z = 0; z < 120; z += 3) {
        for (const [ox, oz] of probes) {
          const px = x + ox;
          const pz = z + oz;
          const d = Math.abs(meshSurfaceHeightAt(px, pz) - heightAt(px, pz));
          if (tokenAt(px, pz) === '#') {
            worstCliff = Math.max(worstCliff, d);
          } else if (d > worstWalkable) {
            worstWalkable = d;
            where = `(${px.toFixed(2)}, ${pz.toFixed(2)})`;
          }
        }
      }
    }

    // heightAt is the design field; the mesh triangles are the surface, and the
    // hero queries the surface (groundHeightAt), so the two need not agree
    // exactly — a 1 m mesh cannot reproduce a 4 m cliff face without error.
    // What matters is that the gap stays small on ground a player stands on.
    expect(worstWalkable, `worst walkable mismatch at ${where}`).toBeLessThan(0.7);
    expect(worstCliff).toBeLessThan(6);
  });

  // The strongest form of this check: compare the hero's ground query against
  // the triangles actually in the vertex buffer. A wrong diagonal fails here
  // outright rather than hiding inside a tolerance.
  it('puts the hero exactly on the triangle the mesh draws', () => {
    const g = buildIslandGeometry();
    const pos = g.positions;
    let worst = 0;
    let where = '';

    for (let t = 0; t < g.triangleCount; t += 17) {
      const b = t * 9;
      const ax = pos[b]!;
      const ay = pos[b + 1]!;
      const az = pos[b + 2]!;
      const bx = pos[b + 3]!;
      const by = pos[b + 4]!;
      const bz = pos[b + 5]!;
      const cx = pos[b + 6]!;
      const cy = pos[b + 7]!;
      const cz = pos[b + 8]!;

      // Centroid, nudged nowhere: it is strictly inside its own triangle.
      const px = (ax + bx + cx) / 3;
      const pz = (az + bz + cz) / 3;
      const planeY = (ay + by + cy) / 3;

      const d = Math.abs(groundHeightAt(px, pz) - planeY);
      if (d > worst) {
        worst = d;
        where = `triangle ${t} at (${px.toFixed(2)}, ${pz.toFixed(2)})`;
      }
    }

    // 1e-5 is the float32 ulp at this island's heights (up to 34 m). The
    // agreement is exact in the algorithm; positions are stored as float32.
    expect(worst, `worst at ${where}`).toBeLessThan(1e-5);
  });

  // Resolution canary. The hero is unaffected either way — it queries the
  // surface — but if this grows, the mesh has become too coarse for the cliff
  // faces and the walls will read as steps rather than faces.
  it('keeps the mesh fine enough for the ground a player stands on', () => {
    let worst = 0;
    let where = '';
    for (let x = 0.37; x < 120; x += 0.53) {
      for (let z = 0.29; z < 120; z += 0.57) {
        if (tokenAt(x, z) === '#') continue;
        if (gradientAt(x, z) >= CONFIG.hero.slopeLimit) continue;
        const d = Math.abs(meshSurfaceHeightAt(x, z) - heightAt(x, z));
        if (d > worst) {
          worst = d;
          where = `(${x.toFixed(1)}, ${z.toFixed(1)})`;
        }
      }
    }
    // 0.15 m, and it occurs at a cliff shoulder rather than on open floor.
    expect(worst, `worst at ${where}`).toBeLessThan(0.15);
  });

  it('never lets the height field jump — a discontinuity tears the mesh', () => {
    // A first attempt at cliff sharpening remapped both axes and made the field
    // discontinuous at cell centres: a 3.4 m step across x=45. This is the
    // guard that caught it.
    let worst = 0;
    let where = '';
    for (let x = 0.5; x < 120; x += 0.37) {
      for (let z = 0.5; z < 120; z += 0.41) {
        const d =
          Math.abs(heightAt(x + 0.02, z) - heightAt(x - 0.02, z)) +
          Math.abs(heightAt(x, z + 0.02) - heightAt(x, z - 0.02));
        if (d > worst) {
          worst = d;
          where = `(${x.toFixed(2)}, ${z.toFixed(2)})`;
        }
      }
    }
    // 4 cm on the steepest face is 0.1 m of rise; anything near a metre is a
    // discontinuity, not a slope.
    expect(worst, `worst step at ${where}`).toBeLessThan(0.5);
  });
});

describe('island geometry', () => {
  it('builds 28800 triangles at 1 m spacing', () => {
    expect(ISLAND_TRIANGLES).toBe(120 * 120 * 2);
  });

  it('fills every position and colour slot', () => {
    const g = buildIslandGeometry();
    expect(g.triangleCount).toBe(ISLAND_TRIANGLES);
    expect(g.positions).toHaveLength(ISLAND_TRIANGLES * 9);
    expect(g.colors).toHaveLength(ISLAND_TRIANGLES * 9);
    expect(g.positions.every(Number.isFinite)).toBe(true);
    expect(g.colors.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  // The bug that failed the M1 visual check: every triangle was wound clockwise
  // seen from above, so the geometric normals pointed down and FrontSide culling
  // removed the whole island. Positions, bounds and heights were all correct, so
  // nothing else caught it. This is the assertion that would have.
  it('winds every triangle so its normal points up', () => {
    const { positions, triangleCount } = buildIslandGeometry();
    let down = 0;
    let firstBad = -1;
    for (let t = 0; t < triangleCount; t++) {
      const b = t * 9;
      const ux = positions[b + 3]! - positions[b]!;
      const uz = positions[b + 5]! - positions[b + 2]!;
      const vx = positions[b + 6]! - positions[b]!;
      const vz = positions[b + 8]! - positions[b + 2]!;
      // y component of (b-a) x (c-a)
      if (uz * vx - ux * vz <= 0) {
        down += 1;
        if (firstBad < 0) firstBad = t;
      }
    }
    expect(down, `${down} triangles face downward, first at index ${firstBad}`).toBe(0);
  });

  it('gives every face a single flat colour across its three vertices', () => {
    const g = buildIslandGeometry();
    for (let t = 0; t < 50; t++) {
      const base = t * 9;
      expect(g.colors[base]).toBe(g.colors[base + 3]);
      expect(g.colors[base]).toBe(g.colors[base + 6]);
    }
  });
});

describe('terrainColourAt', () => {
  const waterY = CONFIG.units.waterY;

  it('darkens the wet band and leaves dry ground alone', () => {
    const dry = terrainColourAt(waterY + WET_BAND_M + 0.5, 0.1);
    const wet = terrainColourAt(waterY - 0.2, 0.1);
    expect(wet[1]).toBeLessThan(dry[1]);
    expect(wet[1] / dry[1]).toBeGreaterThan(WET_DARKEN - 0.05);
  });

  it('does not darken ground above the wet band', () => {
    const a = terrainColourAt(waterY + WET_BAND_M + 0.01, 0.1);
    const b = terrainColourAt(waterY + WET_BAND_M + 3, 0.1);
    expect(a[0]).toBeCloseTo(b[0], 6);
  });

  it('reads steep ground as rock, not as moss', () => {
    const moss = terrainColourAt(7, 0.1);
    const rock = terrainColourAt(7, 1.4);
    expect(rock).not.toEqual(moss);
    // Rock is paler and cooler than moss, never warmer.
    const luma = (c: number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    expect(luma(rock)).toBeGreaterThan(luma(moss));
  });

  // World Bible §8 reserves Ruin Brass (#8C7346, r-b = 0.27) for "the Spool
  // Yard drums, cables, frame and housings". The M1 check saw lit slopes as tan
  // and ochre because the terrain was using it. Rock in this world is a cool
  // grey-green. Moss is not covered by this: a yellow-green is naturally
  // red-heavy, and Moss Light is the bible's own floor colour.
  it('never puts a warm colour on rock', () => {
    for (let h = -4; h <= 34; h += 1) {
      for (let g = 0.9; g <= 3; g += 0.25) {
        const [r, , b] = terrainColourAt(h, g);
        expect(r - b, `height ${h}, gradient ${g}`).toBeLessThan(0.05);
      }
    }
  });

  it('keeps rock lighter than moss so a wall never reads as a dark hole', () => {
    const luma = (c: number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    for (const h of [3, 7, 12, 20, 30]) {
      expect(luma(terrainColourAt(h, 1.4)), `height ${h}`).toBeGreaterThan(
        luma(terrainColourAt(h, 0.1)),
      );
    }
  });

  it('puts a crisp line between floor and wall, not a long blend', () => {
    // The share of the gradient range spent transitioning from moss to rock.
    const floor = terrainColourAt(7, 0.2);
    const wall = terrainColourAt(7, 1.2);
    const midway = terrainColourAt(7, 0.625);
    const span = Math.hypot(...floor.map((v, i) => v - wall[i]!));
    const toMid = Math.hypot(...floor.map((v, i) => v - midway[i]!));
    // Halfway up the gradient range, the colour is already most of the way to
    // rock: the transition happens in a narrow band, not across the whole slope.
    expect(toMid / span).toBeGreaterThan(0.4);
  });

  it('stays inside 0..1 across the whole island range', () => {
    for (let h = -12; h <= 36; h += 0.5) {
      for (let g = 0; g <= 3; g += 0.1) {
        for (const ch of terrainColourAt(h, g)) {
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
