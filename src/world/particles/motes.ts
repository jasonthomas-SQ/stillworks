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
  /** Diameter in METRES at spawn. Not pixels. */
  sizeStart: number;
  /** Diameter in metres at the end of the rise. */
  sizeEnd: number;
  /** Largest the sprite may draw, in pixels — hardware caps gl_PointSize. */
  maxPixels: number;
  /** Fraction of the life at which the fade-out begins. */
  fadeStart: number;
  /** Width of the spawn scatter around each bank or vent, in metres. */
  spawnSpread: number;
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
    const spread = opts.spawnSpread;
    const x = bx + (rng() - 0.5) * spread;
    const z = bz + (rng() - 0.5) * spread;
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
      uSizeStart: { value: opts.sizeStart },
      uSizeEnd: { value: opts.sizeEnd },
      uMaxPixels: { value: opts.maxPixels },
      uFadeStart: { value: opts.fadeStart },
      // Replaced every frame from the real drawing buffer and camera FOV.
      uPixelScale: { value: 1000 },
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
    count: 320,
    colour: new THREE.Color(CONFIG.palette.steamGrey),
    riseSpeed: 0.35,
    riseHeight: 25,
    wobble: 0.1,
    // §3 gives 0.06 m. At this camera Shim is about 36 px tall, so a spore is
    // 2 to 4 px — a glint, which is the whole point of them.
    sizeStart: 0.06,
    sizeEnd: 0.06,
    maxPixels: 8,
    fadeStart: 0.55,
    spawnSpread: 9,
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
    count: 150,
    colour: new THREE.Color(CONFIG.palette.steamGrey),
    riseSpeed: 1.1,
    riseHeight: 11,
    wobble: 0.55,
    // A plume element leaves the vent about Shim's size and spreads as it
    // climbs. §7: "slow soft plumes that rise eight to twelve metres and thin
    // out" — thinning is the growth plus the long fade, not a hard cut.
    // Tightened at the M2 re-check: at a 9 m spread and a 3.2 m top size the
    // steam read as bright discs scattered across the whole shelf rather than
    // plumes rising from vents. 2.5 m of spread and a 2.1 m top gives columns.
    sizeStart: 1.0,
    sizeEnd: 2.1,
    maxPixels: 110,
    fadeStart: 0.2,
    spawnSpread: 2.5,
    additive: false,
  });
  points.name = 'steam';
  return points;
}

export class Motes {
  readonly hushspores = buildHushspores();
  readonly steam = buildSteam();

  /**
   * Pixels per metre at one metre of depth: viewportHeight / (2 tan(fov/2)).
   * Taken from the real drawing buffer, so the device pixel ratio is applied
   * exactly once rather than zero times or twice.
   */
  setViewport(drawingBufferHeight: number, fovDeg: number): void {
    const scale = drawingBufferHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    for (const p of [this.hushspores, this.steam]) {
      (p.material as THREE.ShaderMaterial).uniforms.uPixelScale!.value = scale;
    }
  }

  update(elapsed: number, state: SkyState): void {
    const h = (this.hushspores.material as THREE.ShaderMaterial).uniforms;
    h.uTime!.value = elapsed;
    h.uDensity!.value = state.hushsporeDensity;

    const s = (this.steam.material as THREE.ShaderMaterial).uniforms;
    s.uTime!.value = elapsed;
    // Steam is always on; the vents do not care what hour it is. Low alpha:
    // it is vapour, and at full opacity the plume covered half the frame.
    s.uDensity!.value = CONFIG.particles.steamDensity;
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
