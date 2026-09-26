// Hushspores and steam. Both are THREE.Points with one ShaderMaterial and all
// motion computed in the vertex shader, so each system is one draw call and
// zero CPU work per particle.
//
// Density is applied as alpha rather than by culling points: at these counts a
// fully transparent fragment costs nothing, and rewriting the buffer every
// frame to hide a few motes would cost far more.

import * as THREE from 'three';
import { CONFIG } from '../../config';
import { groundHeightAt } from '../island/heightfield';
import { makeRng } from '../../core/math/rng';
import { KETTLE, cellCentre } from '../../data/kettle';
import type { SkyState } from '../sky/skyPalette';
import vertexShader from './motes.vert.glsl?raw';
import fragmentShader from './motes.frag.glsl?raw';

export type MoteOptions = {
  count: number;
  colour: THREE.Color;
  riseSpeed: number;
  riseHeight: number;
  wobble: number;
  size: number;
  additive: boolean;
};

function buildPoints(
  spawns: [number, number][],
  seed: number,
  opts: MoteOptions,
): THREE.Points {
  const rng = makeRng(seed);
  const positions = new Float32Array(opts.count * 3);
  const phases = new Float32Array(opts.count);
  const spawnY = new Float32Array(opts.count);

  for (let i = 0; i < opts.count; i++) {
    const [bx, bz] = spawns[Math.floor(rng() * spawns.length)]!;
    const x = bx + (rng() - 0.5) * 9;
    const z = bz + (rng() - 0.5) * 9;
    positions[i * 3] = x;
    positions[i * 3 + 1] = 0; // replaced in the shader by aSpawnY + rise
    positions[i * 3 + 2] = z;
    phases[i] = rng();
    spawnY[i] = groundHeightAt(x, z) + 0.15;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSpawnY', new THREE.BufferAttribute(spawnY, 1));
  geometry.computeBoundingSphere();
  // The shader lifts points well above the bounding sphere the positions imply.
  geometry.boundingSphere!.radius += opts.riseHeight;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uDensity: { value: 1 },
      uRiseSpeed: { value: opts.riseSpeed },
      uRiseHeight: { value: opts.riseHeight },
      uWobble: { value: opts.wobble },
      uSize: { value: opts.size },
      uSpread: { value: 300 },
      uColour: { value: opts.colour },
    },
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/**
 * Hushspores. World Bible §3: they "lift off the moss and go straight up. Never
 * sideways." 0.35 m/s, a hand's width of wobble, fading out 25 m up. Density
 * ramps from a handful at noon to a steady column at dusk and through the night.
 *
 * §7 calls them the island's quietest rhyme with the dial — something doing one
 * thing, forever, correctly — so the motion is deliberately monotonous.
 */
export function buildHushspores(): THREE.Points {
  const spawns = KETTLE.sporeBanks.map(({ c, r }) => cellCentre(c, r));
  const points = buildPoints([...spawns], CONFIG.seed + 101, {
    count: 500,
    colour: new THREE.Color(CONFIG.palette.steamGrey),
    riseSpeed: 0.35,
    riseHeight: 25,
    wobble: 0.1,
    size: 2.4,
    additive: true,
  });
  points.name = 'hushspores';
  return points;
}

/**
 * Steam off the Warm Stones vents. §7: slow plumes rising eight to twelve
 * metres and thinning out, and it "catches the same sun the shaft does, so it
 * is white at noon and gold at dusk" — which is why the colour is driven by
 * the sun rather than being a fixed white.
 */
export function buildSteam(): THREE.Points {
  const vents: [number, number][] = [
    cellCentre(10, 7),
    cellCentre(11, 7),
    cellCentre(11, 8),
    cellCentre(10, 6),
  ];
  const points = buildPoints(vents, CONFIG.seed + 202, {
    count: 300,
    colour: new THREE.Color(CONFIG.palette.steamGrey),
    riseSpeed: 1.1,
    riseHeight: 11,
    wobble: 0.55,
    size: 14,
    additive: false,
  });
  points.name = 'steam';
  return points;
}

export class Motes {
  readonly hushspores = buildHushspores();
  readonly steam = buildSteam();

  update(elapsed: number, state: SkyState): void {
    const h = (this.hushspores.material as THREE.ShaderMaterial).uniforms;
    h.uTime!.value = elapsed;
    h.uDensity!.value = state.hushsporeDensity;

    const s = (this.steam.material as THREE.ShaderMaterial).uniforms;
    s.uTime!.value = elapsed;
    // Steam is always on; the vents do not care what hour it is.
    s.uDensity!.value = 0.55;
    // White at noon, gold at dusk: the sun colour, lifted so it stays pale.
    (s.uColour!.value as THREE.Color)
      .setRGB(state.sunColour[0], state.sunColour[1], state.sunColour[2], THREE.SRGBColorSpace)
      .lerp(new THREE.Color(CONFIG.palette.steamGrey), 0.55);
  }

  dispose(): void {
    for (const p of [this.hushspores, this.steam]) {
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
  }
}
