import { describe, it, expect } from 'vitest';
import {
  buildIslandGeometry,
  meshSurfaceHeightAt,
  meshVertexHeights,
  ISLAND_TRIANGLES,
} from './islandMesh.geometry';
import { heightAt, tokenAt, groundHeightAt } from './heightfield';
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

    // Where Shim's feet actually land, agreement has to be tight: 2 cm is under
    // a tenth of a foot's thickness and cannot read as floating or sinking.
    expect(worstWalkable, `worst walkable mismatch at ${where}`).toBeLessThan(0.02);
    // Cliff faces carry a 1.5 m coarse noise layer that curves within a 1 m quad,
    // so they disagree by more. Nobody can stand on them, so this is recorded
    // rather than enforced — but it must stay small enough not to z-fight.
    expect(worstCliff).toBeLessThan(0.25);
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

  it('records how far the smooth field departs from the drawn surface', () => {
    // Informational, and a canary: if this grows a lot, the mesh has become too
    // coarse for the detail layer. The hero is unaffected either way, because
    // the hero queries the surface.
    let worst = 0;
    for (let x = 0.37; x < 120; x += 1.13) {
      for (let z = 0.29; z < 120; z += 1.17) {
        if (tokenAt(x, z) === '#') continue;
        worst = Math.max(worst, Math.abs(meshSurfaceHeightAt(x, z) - heightAt(x, z)));
      }
    }
    expect(worst).toBeLessThan(0.1);
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
    expect(rock[0]).toBeGreaterThan(moss[0]); // brass-grey is redder than moss green
    expect(rock).not.toEqual(moss);
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
