// @pure
// The island mesh, as plain typed arrays. Kept free of three so the geometry —
// and specifically the diagonal split that heightAt has to agree with — can be
// tested in Node. islandMesh.ts wraps this in a BufferGeometry and nothing else.
//
// Non-indexed: every triangle owns its three vertices, so flat shading gives a
// hard facet per triangle and the face colour is written to all three.

import { CONFIG } from '../../config';
import { heightAt, gradientAt, groundHeightAt } from './heightfield';
import { terrainColourAt } from './terrainColour';

const SPACING = CONFIG.units.sampleSpacing;
const SIZE_M = CONFIG.units.cell * CONFIG.units.gridCells;
const QUADS = Math.round(SIZE_M / SPACING);

export type IslandGeometryData = {
  positions: Float32Array;
  colors: Float32Array;
  triangleCount: number;
};

/**
 * Diagonal split for the quad whose north-west corner is (qx, qz).
 *
 * The DIAGONAL is (0,0)-(1,1) for both triangles, and groundHeightAt splits on
 * the same diagonal — that is what keeps Shim's feet on the rendered surface.
 *
 * The WINDING is counter-clockwise seen from above, so the geometric normal is
 * +Y and the faces survive FrontSide culling. Getting this backwards renders
 * nothing at all from an overhead camera while every test that only looks at
 * positions still passes; it cost an entire M1 visual check. islandMesh.test.ts
 * now asserts every normal points up.
 */
const TRI_A: [number, number][] = [
  [0, 0],
  [1, 1],
  [1, 0],
];
const TRI_B: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 1],
];

export function buildIslandGeometry(): IslandGeometryData {
  const triangleCount = QUADS * QUADS * 2;
  const positions = new Float32Array(triangleCount * 3 * 3);
  const colors = new Float32Array(triangleCount * 3 * 3);

  let p = 0;
  let cIdx = 0;

  for (let qz = 0; qz < QUADS; qz++) {
    for (let qx = 0; qx < QUADS; qx++) {
      const x0 = qx * SPACING;
      const z0 = qz * SPACING;

      for (const tri of [TRI_A, TRI_B]) {
        let sumH = 0;
        let sumX = 0;
        let sumZ = 0;
        const xs: number[] = [];
        const zs: number[] = [];
        const ys: number[] = [];

        for (const [ox, oz] of tri) {
          const x = x0 + ox * SPACING;
          const z = z0 + oz * SPACING;
          const y = heightAt(x, z);
          xs.push(x);
          zs.push(z);
          ys.push(y);
          sumH += y;
          sumX += x;
          sumZ += z;
        }

        // One colour per face, from the centroid, written to all three vertices.
        const [cr, cg, cb] = terrainColourAt(sumH / 3, gradientAt(sumX / 3, sumZ / 3));

        for (let i = 0; i < 3; i++) {
          positions[p++] = xs[i]!;
          positions[p++] = ys[i]!;
          positions[p++] = zs[i]!;
          colors[cIdx++] = cr;
          colors[cIdx++] = cg;
          colors[cIdx++] = cb;
        }
      }
    }
  }

  return { positions, colors, triangleCount };
}

/** Every mesh vertex as {x, z, y}, for the heightAt-versus-mesh test. */
export function meshVertexHeights(): { x: number; z: number; y: number }[] {
  const out: { x: number; z: number; y: number }[] = [];
  for (let qz = 0; qz <= QUADS; qz += 7) {
    for (let qx = 0; qx <= QUADS; qx += 7) {
      const x = qx * SPACING;
      const z = qz * SPACING;
      out.push({ x, z, y: heightAt(x, z) });
    }
  }
  return out;
}


/** The rendered surface, re-exported so tests can compare it to heightAt. */
export const meshSurfaceHeightAt = groundHeightAt;

export const ISLAND_QUADS = QUADS;
export const ISLAND_TRIANGLES = QUADS * QUADS * 2;
