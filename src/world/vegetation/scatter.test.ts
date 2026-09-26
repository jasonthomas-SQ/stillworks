import { describe, it, expect } from 'vitest';
import { scatterPoints, ringPoints } from './scatter';
import { tokenAt, gradientAt, groundHeightAt } from '../island/heightfield';
import { cellCentre } from '../../data/kettle';
import { Ferns } from './ferns';
import { CONFIG } from '../../config';

const base = {
  seed: 1,
  count: 200,
  zones: ['B'] as const,
  maxGradient: 0.35,
};

describe('scatter', () => {
  it('is deterministic for a seed', () => {
    expect(scatterPoints(base)).toEqual(scatterPoints(base));
  });

  it('differs for a different seed', () => {
    expect(scatterPoints(base)).not.toEqual(scatterPoints({ ...base, seed: 2 }));
  });

  it('only places inside the requested zones', () => {
    for (const p of scatterPoints(base)) {
      expect(tokenAt(p.x, p.z), `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).toBe('B');
    }
  });

  it('never places on ground steeper than the mask', () => {
    for (const p of scatterPoints(base)) {
      expect(p.gradient).toBeLessThanOrEqual(base.maxGradient);
      expect(gradientAt(p.x, p.z)).toBeLessThanOrEqual(base.maxGradient);
    }
  });

  it('respects exclusion circles', () => {
    const exclusions = [{ x: 65, z: 65, radius: 9 }];
    for (const p of scatterPoints({ ...base, exclusions })) {
      expect(Math.hypot(p.x - 65, p.z - 65)).toBeGreaterThanOrEqual(9);
    }
  });

  it('respects minimum spacing', () => {
    const pts = scatterPoints({ ...base, count: 60, minSpacing: 4 });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.z - pts[j]!.z)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('sits every point on the ground', () => {
    for (const p of scatterPoints(base)) {
      expect(p.y).toBeCloseTo(groundHeightAt(p.x, p.z), 9);
    }
  });

  it('gives every instance its own sway phase', () => {
    const phases = scatterPoints(base).map((p) => p.phase);
    expect(new Set(phases).size).toBeGreaterThan(phases.length * 0.95);
  });

  it('terminates even when the mask rejects everything', () => {
    // A zone that does not exist: must return empty rather than hang.
    const impossible = scatterPoints({ ...base, maxGradient: -1 });
    expect(impossible).toEqual([]);
  });
});

describe('the Fern Cathedral', () => {
  // World Bible §4-B: "eleven tree ferns in a ring wide enough to be a room".
  it('is eleven ferns in a ring at c7 r7', () => {
    const [cx, cz] = cellCentre(7, 7);
    const ring = ringPoints(cx, cz, 8.5, 11, 1);
    expect(ring).toHaveLength(11);
    for (const p of ring) {
      const r = Math.hypot(p.x - cx, p.z - cz);
      expect(r).toBeGreaterThan(7);
      expect(r).toBeLessThan(10);
    }
  });

  it('leaves the middle clear — somebody has put a bench in it', () => {
    const [cx, cz] = cellCentre(7, 7);
    for (const p of ringPoints(cx, cz, 8.5, 11, 1)) {
      expect(Math.hypot(p.x - cx, p.z - cz)).toBeGreaterThan(5);
    }
  });
});

describe('ferns in the scene', () => {
  const ferns = new Ferns();

  it('plants a real stand of tree ferns, including the Cathedral ring', () => {
    expect(ferns.treeFernCount).toBeGreaterThan(80);
    expect(ferns.treeFerns.count).toBe(ferns.treeFernCount);
  });

  it('lays down thousands of ground tufts in one draw call', () => {
    expect(ferns.groundCoverCount).toBeGreaterThan(3000);
    expect(ferns.groundCover.count).toBe(ferns.groundCoverCount);
  });

  it('casts shadows from tree ferns but never from ground cover', () => {
    // A shadow pass re-draws the scene; 5,200 tufts are not worth doubling it.
    expect(ferns.treeFerns.castShadow).toBe(true);
    expect(ferns.groundCover.castShadow).toBe(false);
  });

  it('carries the sway attributes the injection reads', () => {
    for (const m of [ferns.treeFerns, ferns.groundCover]) {
      expect(m.geometry.getAttribute('aSwayWeight'), `${m.name} weight`).toBeDefined();
      expect(m.geometry.getAttribute('aSwayPhase'), `${m.name} phase`).toBeDefined();
    }
  });

  // §7: "Fern fronds sway on a long slow cycle" — and the trunks do not.
  it('gives trunk vertices no sway weight and frond tips full weight', () => {
    const w = ferns.treeFerns.geometry.getAttribute('aSwayWeight');
    let zeros = 0;
    let high = 0;
    for (let i = 0; i < w.count; i++) {
      if (w.getX(i) === 0) zeros += 1;
      if (w.getX(i) > 0.8) high += 1;
    }
    expect(zeros, 'trunk vertices at zero weight').toBeGreaterThan(0);
    expect(high, 'frond tips near full weight').toBeGreaterThan(0);
    for (let i = 0; i < w.count; i++) {
      expect(w.getX(i)).toBeGreaterThanOrEqual(0);
      expect(w.getX(i)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps ferns off the start cell and off the discovery pads', () => {
    const pads: [number, number][] = [
      [5, 12],
      [6, 11],
      [7, 7],
      [11, 7],
      [7, 3],
      [3, 6],
      [2, 2],
    ];
    const m = ferns.groundCover;
    const mat = new Float32Array(16);
    for (const [c, r] of pads) {
      const [px, pz] = cellCentre(c, r);
      for (let i = 0; i < m.count; i += 7) {
        m.instanceMatrix.array.slice(i * 16, i * 16 + 16).forEach((v, k) => (mat[k] = v));
        const d = Math.hypot(mat[12]! - px, mat[14]! - pz);
        expect(d, `tuft ${i} near c${c}r${r}`).toBeGreaterThan(3);
      }
    }
  });

  it('stays inside the triangle budget', () => {
    const tris = (m: typeof ferns.treeFerns): number =>
      (m.geometry.getAttribute('position').count / 3) * m.count;
    const total = tris(ferns.treeFerns) + tris(ferns.groundCover);
    expect(total).toBeLessThan(CONFIG.budget.triangles * 0.6);
  });
});
