// @pure
// The numbers behind the sound, kept away from WebAudio so they can be tested.
//
// Every sound in M2 is generated: there are no audio files, so decodeAudioData
// is never called and the Safari format question does not arise until M3.

import { CONFIG } from '../../config';

/**
 * Wind gain from altitude and the sky state.
 *
 * World Bible §4-E puts the Canopy Walk "high, cool and open" and §4-B puts the
 * gorge floor quiet, so wind is a function of how far up the gorge you are.
 */
export function windGainAt(heroY: number, skyWindGain: number): number {
  const floor = 5;
  const rim = 24;
  const altitude = Math.min(1, Math.max(0, (heroY - floor) / (rim - floor)));
  return (0.25 + 0.75 * altitude) * skyWindGain;
}

/**
 * Water gain from distance to the nearest water. §7: water is "always moving
 * and always audible", so this never reaches zero anywhere on the island.
 */
export function waterGainAt(distanceToWater: number): number {
  const near = 4;
  const far = 55;
  const t = Math.min(1, Math.max(0, (distanceToWater - near) / (far - near)));
  return 0.12 + 0.88 * (1 - t) * (1 - t);
}

export type FootstepPlan = {
  /** Distance carried forward to the next frame. */
  remainder: number;
  /** How many footsteps to fire this frame. Normally 0 or 1. */
  steps: number;
};

/**
 * Footsteps trigger on DISTANCE, not time, so walking and running are both
 * correct without a second rule and a stopped hero never ticks.
 */
export function planFootsteps(
  carried: number,
  distanceThisFrame: number,
  stride = CONFIG.hero.strideLength,
): FootstepPlan {
  const total = carried + distanceThisFrame;
  const steps = Math.floor(total / stride);
  return { remainder: total - steps * stride, steps };
}

/** Playback rate for a footstep, deterministic from the step index. */
export function footstepRate(index: number, inWater: boolean): number {
  // Deterministic hash rather than Math.random: the same walk sounds the same.
  const h = Math.sin(index * 12.9898) * 43758.5453;
  const jitter = h - Math.floor(h);
  const base = inWater ? 0.82 : 1;
  return base * (0.9 + jitter * 0.2);
}
