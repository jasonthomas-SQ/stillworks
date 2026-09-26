import { describe, it, expect } from 'vitest';
import { skyStateAt } from './skyPalette';
import { tFromHours, advanceClock, hoursOf, solarNoonHour } from './dayClock';
import { CONFIG } from '../../config';
import { sunDirAt } from './sunDir';
import { approximateLit, luminance, warmth, UP } from './shading';
import { terrainColourAt } from '../island/terrainColour';

const dist = (a: number[], b: number[]): number =>
  Math.hypot(...a.map((v, i) => v - b[i]!));

describe('dayClock', () => {
  it('completes exactly one cycle in the configured day length', () => {
    let t = 0;
    for (let i = 0; i < CONFIG.clock.dayLengthSec * 60; i++) t = advanceClock(t, 1 / 60);
    // Compare on the circle: one full cycle lands on either side of 0.
    expect(Math.min(t, 1 - t)).toBeCloseTo(0, 4);
  });

  it('wraps rather than exceeding 1', () => {
    const t = advanceClock(0.999, 10);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(1);
  });

  it('starts a new game at 08:00', () => {
    expect(hoursOf(tFromHours(CONFIG.clock.startHour))).toBeCloseTo(8, 6);
  });

  it('is frame-rate independent', () => {
    let a = 0.2;
    let b = 0.2;
    for (let i = 0; i < 600; i++) a = advanceClock(a, 1 / 60);
    for (let i = 0; i < 150; i++) b = advanceClock(b, 1 / 15);
    expect(a).toBeCloseTo(b, 6);
  });

  it('holds still at scale 0 — the P key', () => {
    expect(advanceClock(0.4, 5, 0)).toBe(0.4);
  });
});

describe('skyPalette', () => {
  it('never pops: no channel moves more than 0.02 in a real second', () => {
    const step = 1 / CONFIG.clock.dayLengthSec;
    for (let t = 0; t < 1; t += step / 4) {
      const a = skyStateAt(t % 1);
      const b = skyStateAt((t + step) % 1);
      expect(dist(a.background, b.background), `t=${t.toFixed(3)}`).toBeLessThan(0.02);
      expect(dist(a.sunColour, b.sunColour)).toBeLessThan(0.02);
      expect(dist(a.fogColour, b.fogColour)).toBeLessThan(0.02);
      // One real second is two game minutes, and intensity necessarily moves
      // fastest at the horizon. 0.12 of 3.0 is a smooth ramp, not a pop.
      expect(Math.abs(a.sunIntensity - b.sunIntensity)).toBeLessThan(0.12);
      expect(Math.abs(a.hushsporeDensity - b.hushsporeDensity)).toBeLessThan(0.05);
    }
  });

  it('is continuous across the midnight wrap', () => {
    expect(dist(skyStateAt(0.99999).background, skyStateAt(0).background)).toBeLessThan(0.002);
    expect(dist(skyStateAt(0.99999).fogColour, skyStateAt(0).fogColour)).toBeLessThan(0.002);
  });

  it('lands on the bible colours at the keyframes', () => {
    const noon = skyStateAt(tFromHours(solarNoonHour())).background;
    expect(noon[0]).toBeCloseTo(0xbf / 255, 3);
    expect(noon[1]).toBeCloseTo(0xd7 / 255, 3);
    expect(noon[2]).toBeCloseTo(0xd2 / 255, 3);
  });

  // World Bible §8: "Cool wins the frame; warm wins the eye."
  //
  // Comparing sun hex to sky hex is not the right test — the bible's own dawn
  // sky (#E3C4AE) is warmer than a desaturated dawn sun, and an unsound
  // assertion is worse than none. What matters is what the player sees: a
  // surface the sun reaches must come out warmer than the same surface in
  // shade. That is asserted below against the shading model.
  it('makes lit ground warmer than shaded ground at every sunlit hour', () => {
    const rock = terrainColourAt(9, 1.2);
    for (let h = CONFIG.sun.sunriseHour; h <= CONFIG.sun.sunsetHour; h += 0.25) {
      const t = tFromHours(h);
      const s = skyStateAt(t);
      if (s.sunIntensity < 0.5) continue;
      const dir = sunDirAt(t);
      const lit = approximateLit(rock, UP, s, dir, true);
      const shaded = approximateLit(rock, UP, s, dir, false);
      expect(warmth(lit), `${h}h lit vs shaded`).toBeGreaterThan(warmth(shaded));
    }
  });

  // The dusk frame came back as one flat orange-brown: shelf, walls and shade
  // all the same sepia. The cause was lighting the world with the sky's own
  // warm hex. Shade at dusk must stay green-grey.
  it('keeps shade cool at dusk, not sepia', () => {
    const t = tFromHours(CONFIG.sun.sunsetHour - 1);
    const s = skyStateAt(t);
    const rock = terrainColourAt(9, 1.2);
    const shaded = approximateLit(rock, UP, s, sunDirAt(t), false);
    expect(warmth(shaded), 'shaded rock at dusk').toBeLessThan(0.02);
    expect(warmth(s.hemiSky), 'dusk hemisphere sky term').toBeLessThan(0);
  });

  // World Bible §2: "No darkness the player cannot walk out of." The first
  // night build left Fernwell fully black at 23:00 with only the stream
  // visible. Moonlight, not darkness.
  it('keeps the night floor readable, and blue-green rather than grey', () => {
    const t = tFromHours(23);
    const s = skyStateAt(t);
    const moss = terrainColourAt(7, 0.1);
    const rock = terrainColourAt(9, 1.2);

    const litMoss = approximateLit(moss, UP, s, sunDirAt(t), false);
    const litRock = approximateLit(rock, UP, s, sunDirAt(t), false);

    expect(luminance(litMoss), 'night moss').toBeGreaterThan(0.1);
    expect(luminance(litRock), 'night rock').toBeGreaterThan(0.1);
    // Still legible as moss and rock, not two identical greys. The gap is
    // small at night by design — moonlight flattens everything — so this is a
    // floor, not a target.
    expect(Math.abs(luminance(litRock) - luminance(litMoss))).toBeGreaterThan(0.01);
    // Blue-green, never grey: green and blue both clearly above red.
    expect(litMoss[1]).toBeGreaterThan(litMoss[0]);
    expect(litMoss[2]).toBeGreaterThan(litMoss[0]);
  });

  // Without tone mapping, anything over 1.0 is lost to pure white. A clipped
  // floor is not a flat-colour look, it is a blown-out one — at the first sun
  // intensity the noon moss came out 255,255,255.
  it('never clips a surface to white at any hour', () => {
    const surfaces: [string, ReturnType<typeof terrainColourAt>][] = [
      ['moss floor', terrainColourAt(7, 0.1)],
      ['rock face', terrainColourAt(9, 1.2)],
      ['high ground', terrainColourAt(22, 0.2)],
    ];
    for (let h = 0; h < 24; h += 0.25) {
      const t = tFromHours(h);
      const s = skyStateAt(t);
      for (const [name, base] of surfaces) {
        const lit = approximateLit(base, UP, s, sunDirAt(t), true);
        for (const c of lit) {
          expect(c, `${name} at ${h}h clipped`).toBeLessThan(0.995);
        }
      }
    }
  });

  it('keeps night darker than noon — readable is not the same as bright', () => {
    const moss = terrainColourAt(7, 0.1);
    const night = tFromHours(23);
    const noon = tFromHours(solarNoonHour());
    const nightLit = approximateLit(moss, UP, skyStateAt(night), sunDirAt(night), false);
    const noonLit = approximateLit(moss, UP, skyStateAt(noon), sunDirAt(noon), true);
    expect(luminance(nightLit)).toBeLessThan(luminance(noonLit) * 0.6);
  });

  it('puts the warmth in the sun, where it lands on brass and steam', () => {
    const dusk = skyStateAt(tFromHours(CONFIG.sun.sunsetHour - 0.5));
    expect(dusk.sunColour[0] - dusk.sunColour[2]).toBeGreaterThan(0.2);
  });

  it('turns the sun off below the horizon and on above it', () => {
    expect(skyStateAt(tFromHours(1)).sunIntensity).toBe(0);
    expect(skyStateAt(tFromHours(CONFIG.sun.sunriseHour - 0.5)).sunIntensity).toBe(0);
    expect(skyStateAt(tFromHours(solarNoonHour())).sunIntensity).toBeCloseTo(
      CONFIG.sun.peakIntensity,
      6,
    );
  });

  // World Bible §2: "No darkness the player cannot walk out of."
  it('never lets the world go black', () => {
    for (let h = 0; h < 24; h += 0.5) {
      const s = skyStateAt(tFromHours(h));
      expect(s.hemiIntensity, `${h}h`).toBeGreaterThanOrEqual(0.5);
      const brightness = Math.max(...s.hemiSky);
      expect(brightness, `${h}h hemi sky`).toBeGreaterThan(0.08);
    }
  });

  it('ramps hushspores from a handful at noon to a column at dusk, and holds it', () => {
    expect(skyStateAt(tFromHours(solarNoonHour())).hushsporeDensity).toBeLessThan(0.25);
    expect(skyStateAt(tFromHours(CONFIG.sun.sunsetHour - 0.5)).hushsporeDensity).toBeGreaterThan(0.85);
    expect(skyStateAt(tFromHours(2)).hushsporeDensity).toBeGreaterThan(0.85);
  });

  it('keeps every channel inside 0..1', () => {
    for (let h = 0; h < 24; h += 0.1) {
      const s = skyStateAt(tFromHours(h));
      for (const c of [...s.background, ...s.sunColour, ...s.fogColour, ...s.hemiSky]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});
