// @pure
// Seeded placement. Deterministic so a reload puts every fern back where it
// was, and so placement can be tested in Node without a renderer.

import { makeRng } from '../../core/math/rng';
import { groundHeightAt, gradientAt, tokenAt } from '../island/heightfield';
import type { Zone } from '../../data/kettle';

export type ScatterPoint = {
  x: number;
  z: number;
  y: number;
  yaw: number;
  scale: number;
  /** Per-instance sway phase, so a stand never moves in lockstep. */
  phase: number;
  gradient: number;
};

export type ScatterOptions = {
  seed: number;
  count: number;
  /** Zone letters to place in. Water cells count as their zone. */
  zones: readonly Zone[];
  maxGradient: number;
  minScale?: number;
  maxScale?: number;
  /** Circles to keep clear: discovery pads, character spots, the stream. */
  exclusions?: readonly { x: number; z: number; radius: number }[];
  /** Keep this far from any other point in the same scatter. */
  minSpacing?: number;
};

const ISLAND_M = 120;

export function scatterPoints(opts: ScatterOptions): ScatterPoint[] {
  const rng = makeRng(opts.seed);
  const out: ScatterPoint[] = [];
  const zones = new Set<string>(opts.zones);
  const minScale = opts.minScale ?? 0.85;
  const maxScale = opts.maxScale ?? 1.15;
  const spacing = opts.minSpacing ?? 0;

  // Bounded attempts: a mask that rejects everything must not hang the build.
  const maxAttempts = opts.count * 60;
  for (let attempt = 0; attempt < maxAttempts && out.length < opts.count; attempt++) {
    const x = rng() * ISLAND_M;
    const z = rng() * ISLAND_M;

    const token = tokenAt(x, z);
    const zone = token === '~' ? 'A' : token;
    if (!zones.has(zone)) continue;

    const gradient = gradientAt(x, z);
    if (gradient > opts.maxGradient) continue;

    let excluded = false;
    for (const e of opts.exclusions ?? []) {
      if (Math.hypot(x - e.x, z - e.z) < e.radius) {
        excluded = true;
        break;
      }
    }
    if (excluded) continue;

    if (spacing > 0) {
      let tooClose = false;
      for (const p of out) {
        if (Math.hypot(x - p.x, z - p.z) < spacing) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
    }

    out.push({
      x,
      z,
      y: groundHeightAt(x, z),
      yaw: rng() * Math.PI * 2,
      scale: minScale + rng() * (maxScale - minScale),
      phase: rng(),
      gradient,
    });
  }

  return out;
}

/** Points arranged in a ring — the Fern Cathedral's eleven tree ferns (§4-B). */
export function ringPoints(
  cx: number,
  cz: number,
  radius: number,
  count: number,
  seed: number,
): ScatterPoint[] {
  const rng = makeRng(seed);
  const out: ScatterPoint[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.12;
    const r = radius * (0.92 + rng() * 0.16);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    out.push({
      x,
      z,
      y: groundHeightAt(x, z),
      yaw: rng() * Math.PI * 2,
      scale: 1 + rng() * 0.2,
      phase: rng(),
      gradient: gradientAt(x, z),
    });
  }
  return out;
}
