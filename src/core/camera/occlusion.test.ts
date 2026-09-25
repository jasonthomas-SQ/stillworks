import { describe, it, expect } from 'vitest';
import { occlusionAt, cameraPositionFor, cameraOffset, MIN_DOLLY } from './occlusion';
import { KETTLE, isWalkableToken, cellCentre, cellKey, zoneOf } from '../../data/kettle';
import { groundHeightAt } from '../../world/island/heightfield';
import { CONFIG } from '../../config';

// Camera occlusion was my top risk at Checkpoint A, on the grounds that I
// cannot look at the screen. It turns out not to need eyes: the camera offset
// is a fixed function of CONFIG and the terrain is a height field, so the
// question "does rock get between the lens and Shim" is answerable at every
// walkable cell, here, offline.
//
// The first run of this sweep found three cells where the camera is inside the
// east cliff south of the Warm Stones — Bram's zone, and the bible's "social
// room". The ground-clearance lift is the fix, and this test is what holds it.

const walkable: { c: number; r: number; zone: string }[] = [];
for (let r = 1; r <= 12; r++) {
  for (let c = 1; c <= 12; c++) {
    const token = KETTLE.grid[r - 1]![c - 1]!;
    if (isWalkableToken(token)) walkable.push({ c, r, zone: zoneOf(token) ?? '?' });
  }
}

describe('camera occlusion across every walkable cell', () => {
  it('never buries the camera in terrain', () => {
    const buried = walkable
      .filter(({ c, r }) => occlusionAt(...cellCentre(c, r)).cameraBuried)
      .map(({ c, r, zone }) => `${cellKey(c, r)} (${zone})`);
    expect(buried).toEqual([]);
  });

  it('never puts terrain between the camera and the hero', () => {
    const blocked = walkable
      .map(({ c, r, zone }) => ({ c, r, zone, o: occlusionAt(...cellCentre(c, r)) }))
      .filter((e) => e.o.blocked)
      .map(
        (e) =>
          `${cellKey(e.c, e.r)} (${e.zone}) intrudes ${e.o.worstIntrusion.toFixed(2)} m at t=${e.o.worstAt.toFixed(2)}`,
      );
    expect(blocked).toEqual([]);
  });

  it('keeps real clearance, not a hairline, on every cell', () => {
    // The margin by which the sight line clears the ground. A cell that only
    // just passes today would fail on any terrain tweak, so record the worst.
    let worst = Infinity;
    let where = '';
    for (const { c, r } of walkable) {
      const o = occlusionAt(...cellCentre(c, r));
      if (-o.worstIntrusion < worst) {
        worst = -o.worstIntrusion;
        where = cellKey(c, r);
      }
    }
    expect(worst, `tightest clearance at ${where}`).toBeGreaterThan(0.2);
  });

  it('holds the camera above the ground everywhere', () => {
    for (const { c, r } of walkable) {
      const [x, z] = cellCentre(c, r);
      const { cx, cy, cz } = cameraPositionFor(x, groundHeightAt(x, z), z);
      expect(cy - groundHeightAt(cx, cz), cellKey(c, r)).toBeGreaterThanOrEqual(
        CONFIG.camera.groundClearance - 1e-6,
      );
    }
  });

  it('derives the offset from CONFIG, at the configured distance', () => {
    const { ox, oy, oz } = cameraOffset();
    expect(Math.hypot(ox, oy, oz)).toBeCloseTo(CONFIG.camera.distance, 6);
    expect(oy).toBeGreaterThan(0); // above
    expect(oz).toBeGreaterThan(0); // and south, so the view looks north
  });

  it('dollies in only where it has to, and never past the floor', () => {
    const dollied = walkable
      .map(({ c, r, zone }) => ({ key: cellKey(c, r), zone, o: occlusionAt(...cellCentre(c, r)) }))
      .filter((e) => e.o.dollyFactor < 0.999);

    for (const e of dollied) {
      expect(e.o.dollyFactor, e.key).toBeGreaterThanOrEqual(MIN_DOLLY - 1e-9);
    }
    // A handful of cells back onto a cliff. If this grows a lot, the camera
    // distance has outrun the terrain and wants revisiting.
    expect(dollied.length).toBeLessThanOrEqual(10);
    // And most of the island is at full distance, so framing is consistent.
    expect(dollied.length / walkable.length).toBeLessThan(0.15);
  });

  it('detects a blockage when one exists — the guard can fail', () => {
    // Negative control. Demand 30 m of clearance under the sight line and every
    // cell must report blocked; if this passes, the sweep above proves nothing.
    const greedy = walkable.map(({ c, r }) =>
      occlusionAt(...cellCentre(c, r), { clearance: 30 }).blocked,
    );
    expect(greedy.every(Boolean)).toBe(true);
  });
});
