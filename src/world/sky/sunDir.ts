// @pure
// Where the sun is. World Bible §7: "The light shaft is the sun" — one
// directional light tracking across the slot, and everything the gorge does
// with light is that one light passing through cliff geometry. No sky keyframe
// fakes a shaft and no second light pretends to be one.
//
// The arc is described by four CONFIG numbers rather than hardcoded, so the
// palette keyframes and the light-probe hours all derive from the same source.

import { CONFIG } from '../../config';
import { daylightFraction } from './dayClock';

const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * Unit vector toward the sun. +x east, +y up, +z south.
 *
 * Built as a great circle from horizon to horizon, tilted so its apex sits at
 * `arcApexElevationDeg` rather than straight overhead — a vertical noon sun
 * casts no shadow at all — then rotated about the vertical by
 * `arcAzimuthOffsetDeg`.
 *
 * The azimuth offset is negative so the sun rises NE and sets SW. A due
 * east-to-west sun sets behind the Spool Yard's rock mass, which blocks the
 * dusk beam to the Warm Stones at every rim height; setting SW sends the last
 * light down the open gorge mouth instead, which is real geometry rather than a
 * cheat and is what §7's dusk beat asks for.
 */
export function sunDirAt(t: number): [number, number, number] {
  const u = daylightFraction(t) * Math.PI; // 0 at sunrise, PI at sunset, on past
  const tilt = deg(90 - CONFIG.sun.arcApexElevationDeg);

  const bx = Math.cos(u);
  const by = Math.sin(u) * Math.cos(tilt);
  const bz = Math.sin(u) * Math.sin(tilt);

  const phi = deg(CONFIG.sun.arcAzimuthOffsetDeg);
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);

  // Rotate about +Y. With a negative offset this carries sunrise toward the NE.
  const x = bx * cos - bz * sin;
  const z = bx * sin + bz * cos;

  const len = Math.hypot(x, by, z);
  return [x / len, by / len, z / len];
}

/** Sun elevation above the horizon, in degrees. Negative after sunset. */
export function sunElevationDeg(t: number): number {
  return (Math.asin(sunDirAt(t)[1]) * 180) / Math.PI;
}
