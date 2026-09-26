import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  crownBlocks,
  blockedCells,
  sightSegment,
  CROWN_RADIUS,
  CROWN_TOP,
  type Occluder,
} from './sightline';
import { Ferns } from './ferns';
import { sightUniforms } from '../shaders/injections';
import { KETTLE, isWalkableToken, cellCentre, cellKey } from '../../data/kettle';
import { CONFIG } from '../../config';

// The M2 check found the Fernwell canopy hiding Shim completely while my
// occlusion sweep reported blocked:false everywhere — it marched the height
// field and nothing else. Terrain was never the only thing that can get in the
// way, and this is the sweep that now covers the rest.

const cells: { x: number; z: number; key: string }[] = [];
for (let r = 1; r <= 12; r++) {
  for (let c = 1; c <= 12; c++) {
    if (!isWalkableToken(KETTLE.grid[r - 1]![c - 1]!)) continue;
    const [x, z] = cellCentre(c, r);
    cells.push({ x, z, key: cellKey(c, r) });
  }
}

/** The shipped ferns, as plain occluders. */
function shippedFerns(): Occluder[] {
  const ferns = new Ferns();
  const out: Occluder[] = [];
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (let i = 0; i < ferns.treeFerns.count; i++) {
    ferns.treeFerns.getMatrixAt(i, m);
    m.decompose(p, q, s);
    out.push({ x: p.x, z: p.z, y: p.y, scale: s.x });
  }
  return out;
}

describe('canopy sight line', () => {
  it('covers all 70 walkable cells', () => {
    expect(cells).toHaveLength(70);
  });

  it('detects a crown planted directly in the sight line', () => {
    // Negative control: without this the sweep proves nothing.
    const [hx, hz] = cellCentre(7, 7);
    const seg = sightSegment(hx, hz);
    const t = 0.55;
    const planted: Occluder = {
      x: seg.cx + (seg.tx - seg.cx) * t,
      z: seg.cz + (seg.tz - seg.cz) * t,
      y: seg.cy + (seg.ty - seg.cy) * t - CROWN_TOP * 0.5,
      scale: 1,
    };
    expect(crownBlocks(planted, hx, hz)).toBe(true);
  });

  it('ignores a crown well off to the side', () => {
    const [hx, hz] = cellCentre(7, 7);
    expect(crownBlocks({ x: hx + 40, z: hz, y: 7, scale: 1 }, hx, hz)).toBe(false);
  });

  // Recorded, not asserted to be zero: Jason wants Shim to walk under the
  // canopy, so crowns crossing the sight line are expected and wanted. What
  // must hold is that the fade clears them, which the next test covers.
  it('records how much of the island has canopy overhead', () => {
    const blocked = blockedCells(shippedFerns(), cells);
    expect(blocked.length).toBeGreaterThan(0); // there IS a canopy to walk under
    expect(blocked.length).toBeLessThan(cells.length); // and it is not everywhere
  });

  // THE GUARD. Every crown that crosses the sight line must lie inside the
  // corridor the shader stipples away, or Shim stays hidden at that cell.
  it('keeps every blocking crown inside the fade corridor', () => {
    const radius = CONFIG.vegetation.sightLineRadius;
    const ferns = shippedFerns();
    const misses: string[] = [];

    for (const cell of cells) {
      const seg = sightSegment(cell.x, cell.z);
      for (const fern of ferns) {
        if (!crownBlocks(fern, cell.x, cell.z)) continue;

        // Closest approach of the crown axis to the sight line, in plan.
        let nearest = Infinity;
        const samples = 80;
        for (let i = 0; i <= samples; i++) {
          const t = i / samples;
          const py = seg.cy + (seg.ty - seg.cy) * t;
          if (py < fern.y + 5.6 * fern.scale || py > fern.y + CROWN_TOP * fern.scale) continue;
          const px = seg.cx + (seg.tx - seg.cx) * t;
          const pz = seg.cz + (seg.tz - seg.cz) * t;
          nearest = Math.min(nearest, Math.hypot(px - fern.x, pz - fern.z));
        }
        if (nearest > radius + CROWN_RADIUS * fern.scale) {
          misses.push(`${cell.key}: crown at ${fern.x.toFixed(0)},${fern.z.toFixed(0)}`);
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it('clears a corridor comfortably wider than Shim', () => {
    expect(CONFIG.vegetation.sightLineRadius).toBeGreaterThan(CONFIG.hero.height * 2);
  });

  it('wires the corridor radius into the shader uniforms', () => {
    const ferns = new Ferns();
    const material = ferns.treeFerns.material as THREE.MeshLambertMaterial;
    const shader = {
      vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
      uniforms: {} as Record<string, THREE.IUniform>,
    };
    material.onBeforeCompile!(shader as never, null as never);

    expect(shader.uniforms.uSightFrom).toBe(sightUniforms.uSightFrom);
    expect(shader.uniforms.uSightTo).toBe(sightUniforms.uSightTo);
    expect(shader.uniforms.uSightRadius).toBe(sightUniforms.uSightRadius);
    expect(shader.fragmentShader).toContain('distanceToSightLine');
    expect(shader.fragmentShader).toContain('discard');
    expect(shader.vertexShader).toContain('vWorldPos');
  });

  it('leaves ground cover solid — tufts are never between lens and hero', () => {
    const ferns = new Ferns();
    const material = ferns.groundCover.material as THREE.MeshLambertMaterial;
    const shader = {
      vertexShader: THREE.ShaderLib.lambert.vertexShader,
      fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
      uniforms: {} as Record<string, THREE.IUniform>,
    };
    material.onBeforeCompile!(shader as never, null as never);
    expect(shader.fragmentShader).not.toContain('distanceToSightLine');
  });
});
