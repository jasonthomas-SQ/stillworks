import { describe, it, expect } from 'vitest';
import { inDirectSun, litWindowFor } from './lightProbe';
import {
  tFromHours,
  dawnProbeHour,
  noonProbeHour,
  duskProbeHour,
  lateDuskProbeHour,
} from './dayClock';
import { cellCentre } from '../../data/kettle';

// World Bible §7 names six lighting states and insists they are produced by one
// sun passing through cliff geometry. That makes them assertions rather than a
// visual check. The arc was tuned against these, not the other way round.

const TERRACE = cellCentre(3, 6); // Pell, Canopy Walk
const LOFT = cellCentre(2, 3); // Ossa, Winding Loft
const FLOOR = cellCentre(7, 7); // Fernwell, the Fern Cathedral
const WARM = cellCentre(10, 7); // the Warm Stones vents
const YARD = cellCentre(7, 3); // Spool Yard
const STAIR = cellCentre(6, 11); // the Flooded Stair

describe('the gorge light sequence (World Bible §7)', () => {
  it('dawn: the first sun strikes the terrace and the Loft, the floor stays in shade', () => {
    const t = tFromHours(dawnProbeHour());
    expect(inDirectSun(...TERRACE, t), 'Canopy Walk').toBe(true);
    expect(inDirectSun(...LOFT, t), 'Winding Loft').toBe(true);
    expect(inDirectSun(...FLOOR, t), 'Fernwell floor').toBe(false);
    expect(inDirectSun(...STAIR, t), 'Flooded Stair').toBe(false);
  });

  it('noon: the shaft drops through the slot onto the floor and the yard', () => {
    const t = tFromHours(noonProbeHour());
    expect(inDirectSun(...FLOOR, t), 'Fernwell floor').toBe(true);
    expect(inDirectSun(...YARD, t), 'Spool Yard').toBe(true);
  });

  it('dusk: the Warm Stones hold it, the floor and the terrace have lost it', () => {
    const t = tFromHours(duskProbeHour());
    expect(inDirectSun(...WARM, t), 'Warm Stones').toBe(true);
    expect(inDirectSun(...FLOOR, t), 'Fernwell floor').toBe(false);
    expect(inDirectSun(...TERRACE, t), 'Canopy Walk').toBe(false);
  });

  it('late dusk: the Warm Stones are the last ground on Kettle in the sun', () => {
    const t = tFromHours(lateDuskProbeHour());
    expect(inDirectSun(...WARM, t), 'Warm Stones').toBe(true);
    for (const [name, p] of [
      ['Canopy Walk', TERRACE],
      ['Winding Loft', LOFT],
      ['Fernwell floor', FLOOR],
      ['Spool Yard', YARD],
    ] as const) {
      expect(inDirectSun(...p, t), name).toBe(false);
    }
  });

  it('night: nothing is in direct sun', () => {
    const t = tFromHours(1);
    for (const p of [TERRACE, LOFT, FLOOR, WARM, YARD, STAIR]) {
      expect(inDirectSun(...p, t)).toBe(false);
    }
  });

  // Checkpoint A correction 3: the afternoon state is measured, not asserted.
  // Shading the Fernwell floor by 15:00 would need a west rim near 55 m, which
  // is a different landscape from the one Marlowe wrote.
  it('makes the gorge floor the least sunlit ground on Kettle', () => {
    const floor = litWindowFor(...FLOOR);
    const warm = litWindowFor(...WARM);
    const stair = litWindowFor(...STAIR);

    expect(floor.contiguous).toBe(true);
    expect(floor.start).toBeLessThan(noonProbeHour());
    expect(floor.end).toBeGreaterThan(noonProbeHour());
    expect(floor.hours).toBeLessThan(stair.hours);
    expect(floor.hours).toBeLessThan(warm.hours + 1.5);
  });

  // RECORDED CONFLICT, not a passing state. World Bible §4-A calls the Flooded
  // Stair "first zone to lose the day"; the geometry makes it the last.
  //
  // The Warm Stones dusk beat (§4-C: last light through the notch, across the
  // vents, steam gone gold) needs a low sun reaching x=95 on the east shelf. A
  // westerly beam cannot: the Canopy Walk terrace stands at +17 m and blocks it
  // at any elevation low enough to count as dusk. The only open path is the
  // gorge mouth to the south-west — and the Flooded Stair sits in that mouth,
  // so it is lit by the same beam that lights the Warm Stones.
  //
  // Raising the mouth's west cliff shades the stair and kills the Warm Stones
  // beat with it; measured both ways, it is a straight trade. The Warm Stones
  // beat is the signature one and carries a character, so it wins until
  // Marlowe rules. This test asserts the CURRENT behaviour so the day the
  // ruling lands, it fails and somebody has to look at it.
  it('records that the Flooded Stair shares the Warm Stones dusk beam', () => {
    const t = tFromHours(lateDuskProbeHour());
    expect(inDirectSun(...STAIR, t)).toBe(true);
    expect(litWindowFor(...STAIR).end).toBeGreaterThan(litWindowFor(...TERRACE).end);
  });
});
