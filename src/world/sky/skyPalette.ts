// @pure
// The sky, as numbers. Four keyframes on the World Bible §8 colours, positioned
// from CONFIG.sun so the palette follows the sun rather than drifting out of
// step with it.
//
// §8's palette rule is a constraint on these numbers, not a note: "Cool wins
// the frame; warm wins the eye. The sky never carries the warmth — brass,
// steam, lamp and vent do." So the dawn and dusk warmth lives in sunColour,
// which lands on brass and steam, and never in the background.

import { CONFIG } from '../../config';
import { hoursOf, solarNoonHour } from './dayClock';
import { sunDirAt } from './sunDir';

export type Rgb = [number, number, number];

export type SkyState = {
  sunColour: Rgb;
  sunIntensity: number;
  hemiSky: Rgb;
  hemiGround: Rgb;
  hemiIntensity: number;
  fogColour: Rgb;
  background: Rgb;
  /** 0 at noon through to 1 at dusk and overnight. Drives the hushspores. */
  hushsporeDensity: number;
  /** Ambient wind gain, louder at night. */
  windGain: number;
};

const hex = (h: string): Rgb => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

const S = CONFIG.sky;
const P = CONFIG.palette;

type Key = { hour: number; state: Omit<SkyState, 'sunIntensity'> };

/** Keyframe hours derived from sunrise and sunset, never hardcoded. */
function keyHours(): { dawn: number; noon: number; dusk: number; night: number } {
  const { sunriseHour, sunsetHour } = CONFIG.sun;
  const nightSpan = 24 - (sunsetHour - sunriseHour);
  return {
    dawn: sunriseHour + 0.5,
    noon: solarNoonHour(),
    dusk: sunsetHour - 0.5,
    night: (sunsetHour + nightSpan / 2) % 24,
  };
}

function keyframes(): Key[] {
  const h = keyHours();
  return [
    {
      hour: h.dawn,
      state: {
        // Warm light, cool sky. The dawn hex is the sky's warmest and it is
        // still cooler than the sun that lands on the terrace.
        sunColour: hex('#FFD9B0'),
        hemiSky: hex(S.dawn),
        hemiGround: hex(P.fernDeep),
        hemiIntensity: 0.75,
        fogColour: hex(S.dawn),
        background: hex(S.dawn),
        // Still high: dawn is the end of the night column, not the start of
        // the daytime handful. The ramp down happens on the way to noon.
        hushsporeDensity: 0.85,
        windGain: 0.5,
      },
    },
    {
      hour: h.noon,
      state: {
        sunColour: hex('#FFF4E0'),
        hemiSky: hex(S.noon),
        hemiGround: hex(P.mossLight),
        hemiIntensity: 1,
        fogColour: hex(S.noon),
        background: hex(S.noon),
        hushsporeDensity: 0.15,
        windGain: 0.35,
      },
    },
    {
      hour: h.dusk,
      state: {
        // §4-C: the last light lies across the vents and makes the steam gold.
        sunColour: hex('#FFB06A'),
        hemiSky: hex(S.dusk),
        hemiGround: hex(P.fernDeep),
        hemiIntensity: 0.7,
        fogColour: hex(S.dusk),
        background: hex(S.dusk),
        hushsporeDensity: 1,
        windGain: 0.6,
      },
    },
    {
      hour: h.night,
      state: {
        sunColour: hex('#8FA6B8'),
        hemiSky: hex(S.night),
        hemiGround: hex(P.fernDeep),
        // Never black. "No darkness the player cannot walk out of" (§2).
        hemiIntensity: 0.5,
        fogColour: hex(S.night),
        background: hex(S.night),
        hushsporeDensity: 1,
        windGain: 0.8,
      },
    },
  ];
}

/** Shortest signed distance between two hours, around the 24-hour circle. */
function hourDelta(from: number, to: number): number {
  let d = (to - from) % 24;
  if (d > 12) d -= 24;
  if (d < -12) d += 24;
  return d;
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export function skyStateAt(t: number): SkyState {
  const hour = hoursOf(t);
  const keys = keyframes();

  // Find the pair this hour sits between, going forward round the circle.
  let from = keys[keys.length - 1]!;
  let to = keys[0]!;
  let best = Infinity;
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i]!;
    const b = keys[(i + 1) % keys.length]!;
    const span = ((b.hour - a.hour) % 24 + 24) % 24;
    const into = ((hour - a.hour) % 24 + 24) % 24;
    if (into <= span && span < best) {
      from = a;
      to = b;
      best = span;
    }
  }

  const span = ((to.hour - from.hour) % 24 + 24) % 24;
  const raw = span === 0 ? 0 : (((hour - from.hour) % 24 + 24) % 24) / span;
  const k = smoothstep(Math.min(1, Math.max(0, raw)));

  // Sun intensity follows the sun's own elevation, so it cannot disagree with
  // where the sun actually is. Zero below the horizon.
  const elevation = sunDirAt(t)[1];
  const sunIntensity = elevation <= 0 ? 0 : 3 * Math.min(1, elevation / 0.35);

  return {
    sunColour: mix(from.state.sunColour, to.state.sunColour, k),
    sunIntensity,
    hemiSky: mix(from.state.hemiSky, to.state.hemiSky, k),
    hemiGround: mix(from.state.hemiGround, to.state.hemiGround, k),
    hemiIntensity:
      from.state.hemiIntensity + (to.state.hemiIntensity - from.state.hemiIntensity) * k,
    fogColour: mix(from.state.fogColour, to.state.fogColour, k),
    background: mix(from.state.background, to.state.background, k),
    hushsporeDensity:
      from.state.hushsporeDensity +
      (to.state.hushsporeDensity - from.state.hushsporeDensity) * k,
    windGain: from.state.windGain + (to.state.windGain - from.state.windGain) * k,
  };
}

export { hourDelta, keyHours };
