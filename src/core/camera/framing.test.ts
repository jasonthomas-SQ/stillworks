import { describe, it, expect } from 'vitest';
import { framingAt } from './framing';
import { cellCentre, KETTLE, isWalkableToken } from '../../data/kettle';
import { CONFIG } from '../../config';

// The M1 visual check reported the frame as "flat green floor edge to edge" at
// Fernwell and at the start cell. It was right: the old camera (60 deg / 16 m /
// 38 deg) put Shim at 8.2% of frame height and rendered 0% rock at three of the
// six named spots. These assertions hold the replacement to the composition
// target taken from the reference art.

const SPOTS: [string, number, number][] = [
  ['Flooded Stair', 5, 12],
  ['Fernwell', 7, 7],
  ['Warm Stones', 11, 7],
  ['Spool Yard', 7, 3],
  ['Canopy Walk', 3, 6],
  ['Winding Loft', 2, 2],
];

describe('framing', () => {
  it('puts Shim between 3% and 5% of frame height', () => {
    for (const [name, c, r] of SPOTS) {
      const f = framingAt(...cellCentre(c, r));
      expect(f.shimFraction, `${name}: ${(f.shimFraction * 100).toFixed(1)}%`).toBeGreaterThan(0.03);
      expect(f.shimFraction, `${name}: ${(f.shimFraction * 100).toFixed(1)}%`).toBeLessThan(0.05);
    }
  });

  it('shows the player a wide strip of ground, not a close-up', () => {
    for (const [name, c, r] of SPOTS) {
      const f = framingAt(...cellCentre(c, r));
      expect(f.groundWidthM, `${name} width`).toBeGreaterThan(25);
      expect(f.groundDepthM, `${name} depth`).toBeGreaterThan(18);
    }
  });

  it('puts rock in frame everywhere the terrain has any', () => {
    // Fernwell is the exception and it is a terrain fact, not a camera one: at
    // r7 the ground is level at +7 m from c4 (x=30) to c11 (x=110), because the
    // talus and the Warm Stones shelf both sit at floor height. The nearest rock
    // is 90 m apart, and framing that would put Shim at 1.8%. The World Bible
    // puts Fernwell's enclosure in the tree ferns — "six to nine metres tall,
    // crowns overlapping" — which arrive in M2, not in the camera.
    for (const [name, c, r] of SPOTS) {
      if (name === 'Fernwell') continue;
      const f = framingAt(...cellCentre(c, r));
      expect(f.rockFraction, `${name} rock ${(f.rockFraction * 100).toFixed(0)}%`).toBeGreaterThan(0.1);
      expect(f.highestRiseM, `${name} highest`).toBeGreaterThan(4);
    }
  });

  it('records the Fernwell gap rather than hiding it', () => {
    const f = framingAt(...cellCentre(7, 7));
    // Locked in so that if M2 vegetation or a terrain change fixes it, the
    // number moves and somebody notices.
    expect(f.rockFraction).toBeLessThan(0.15);
    expect(f.highestRiseM).toBeLessThan(10);
  });

  it('keeps the fixed elevated feel — pitch never shallower than 45 degrees', () => {
    expect(CONFIG.camera.pitchDeg).toBeGreaterThanOrEqual(45);
    expect(CONFIG.camera.pitchDeg).toBeLessThan(60);
  });

  it('never shows sky, and that is geometry not an oversight', () => {
    // From inside a 25 m gorge, a camera pitched 45 degrees or steeper cannot
    // see sky: the top of the frame is at 45 - fov/2 = 26 degrees below the
    // horizon, so it always lands on ground. Sky would need pitch under about
    // 23 degrees, which is not a fixed elevated camera. Asserted so that the
    // constraint is recorded rather than rediscovered.
    const topRayDepressionDeg = CONFIG.camera.pitchDeg - CONFIG.camera.fovDeg / 2;
    expect(topRayDepressionDeg).toBeGreaterThan(0);
    for (const [, c, r] of SPOTS) {
      expect(framingAt(...cellCentre(c, r)).skyVisible).toBe(false);
    }
  });

  it('keeps every walkable cell inside the fog far plane', () => {
    // A frame that fades to fog colour at its far edge reads as mist, not depth.
    for (let r = 1; r <= 12; r++) {
      for (let c = 1; c <= 12; c++) {
        if (!isWalkableToken(KETTLE.grid[r - 1]![c - 1]!)) continue;
        const f = framingAt(...cellCentre(c, r));
        const furthest = CONFIG.camera.distance + f.groundDepthM;
        expect(furthest, `c${c}r${r}`).toBeLessThan(CONFIG.render.fogFar);
      }
    }
  });

  it('starts the fog beyond the visible ground', () => {
    const deepest = Math.max(
      ...SPOTS.map(([, c, r]) => framingAt(...cellCentre(c, r)).groundDepthM),
    );
    expect(CONFIG.render.fogNear).toBeGreaterThan(deepest * 0.5);
  });

  it('keeps the shadow box wider than the visible ground', () => {
    const widest = Math.max(
      ...SPOTS.map(([, c, r]) => framingAt(...cellCentre(c, r)).groundWidthM),
    );
    const deepest = Math.max(
      ...SPOTS.map(([, c, r]) => framingAt(...cellCentre(c, r)).groundDepthM),
    );
    expect(CONFIG.render.shadowBoxHalf * 2).toBeGreaterThan(widest);
    expect(CONFIG.render.shadowBoxHalf * 2).toBeGreaterThan(deepest);
  });
});
