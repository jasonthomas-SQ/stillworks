// @pure
// The day clock. World Bible §7: a full cycle is 12 real minutes, dawn through
// to the next dawn, and a new game starts at 08:00.

import { CONFIG } from '../../config';

const wrap = (t: number): number => ((t % 1) + 1) % 1;

/** Advance normalised time. `scale` 0 pauses; the debug keys use 0 and 1. */
export function advanceClock(t: number, dt: number, scale = 1): number {
  if (scale === 0 || dt === 0) return t;
  return wrap(t + (dt * scale) / CONFIG.clock.dayLengthSec);
}

/** Normalised time as an hour in [0, 24). */
export function hoursOf(t: number): number {
  return wrap(t) * 24;
}

/** Hour of day as normalised time. Accepts values outside 0..24 and wraps. */
export function tFromHours(hours: number): number {
  return wrap(hours / 24);
}

export const solarNoonHour = (): number =>
  (CONFIG.sun.sunriseHour + CONFIG.sun.sunsetHour) / 2;

// Probe hours are DERIVED, never hardcoded. An earlier draft asserted dusk at
// 18:00 against an arc that set at exactly 18:00, so the assertion could not
// pass at any rim height. Moving sunrise or sunset now moves the assertions
// with the arc instead of silently invalidating them.
export const dawnProbeHour = (): number => CONFIG.sun.sunriseHour + 1.8;
export const noonProbeHour = (): number => solarNoonHour();
export const duskProbeHour = (): number => CONFIG.sun.sunsetHour - 1.0;
export const lateDuskProbeHour = (): number => CONFIG.sun.sunsetHour - 0.4;

/** Fraction of the way through daylight: 0 at sunrise, 1 at sunset. */
export function daylightFraction(t: number): number {
  const { sunriseHour, sunsetHour } = CONFIG.sun;
  return (hoursOf(t) - sunriseHour) / (sunsetHour - sunriseHour);
}

export function isDaytime(t: number): boolean {
  const h = hoursOf(t);
  return h >= CONFIG.sun.sunriseHour && h <= CONFIG.sun.sunsetHour;
}
