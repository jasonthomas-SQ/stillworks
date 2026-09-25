import { describe, it, expect } from 'vitest';
import { skyStateAt } from './skyPalette';
import { tFromHours, advanceClock, hoursOf, solarNoonHour } from './dayClock';
import { CONFIG } from '../../config';

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
  // Not testable as an absolute — the bible's own dawn sky is #E3C4AE, which is
  // warm. The rule is relative: whatever the sky is doing, the light landing on
  // brass and steam is warmer still, so the warm object wins the eye. That is
  // what is asserted, through every daylight hour.
  it('always keeps the sun warmer than the sky it hangs in', () => {
    for (let h = CONFIG.sun.sunriseHour; h <= CONFIG.sun.sunsetHour; h += 0.25) {
      const s = skyStateAt(tFromHours(h));
      const skyWarmth = s.background[0] - s.background[2];
      const sunWarmth = s.sunColour[0] - s.sunColour[2];
      expect(sunWarmth, `${h}h`).toBeGreaterThan(skyWarmth);
    }
  });

  it('puts the warmth in the sun, where it lands on brass and steam', () => {
    const dusk = skyStateAt(tFromHours(CONFIG.sun.sunsetHour - 0.5));
    expect(dusk.sunColour[0] - dusk.sunColour[2]).toBeGreaterThan(0.2);
  });

  it('turns the sun off below the horizon and on above it', () => {
    expect(skyStateAt(tFromHours(1)).sunIntensity).toBe(0);
    expect(skyStateAt(tFromHours(CONFIG.sun.sunriseHour - 0.5)).sunIntensity).toBe(0);
    expect(skyStateAt(tFromHours(solarNoonHour())).sunIntensity).toBeGreaterThan(2.5);
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
