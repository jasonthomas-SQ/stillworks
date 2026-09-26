// EVERY onBeforeCompile injection in the codebase lives here and nowhere else.
//
// Injections match on chunk names and chunk contents, both of which can change
// between three releases and neither of which throws when it does: the material
// simply compiles without the injection and the ferns go stiff. Keeping all of
// it in one file makes the blast radius one file, and injections.test.ts
// asserts the anchor is still present in the pinned version.

import * as THREE from 'three';

/** The exact string matched inside ShaderChunk.begin_vertex. */
export const SWAY_ANCHOR = 'vec3 transformed = vec3( position );';

/** One clock shared by every swaying material, so a single write drives them all. */
export const swayUniforms = {
  uSwayTime: { value: 0 },
};

export type SwayOptions = {
  /** Metres of travel at full sway weight. */
  amplitude: number;
  /** Seconds per cycle. */
  period: number;
};

/**
 * Injects a sway into a built-in material at `begin_vertex`.
 *
 * Injection rather than a bespoke ShaderMaterial because lighting, shadows and
 * fog then come for free — and a fern that ignored the day cycle would be worse
 * than one that does not move.
 *
 * Sway is weighted by an explicit `aSwayWeight` attribute, not by uv.y or by
 * local height: the weight is 0 along a trunk and 1 at a frond tip, so trunks
 * provably do not move. A test asserts it.
 */
export function applySway(material: THREE.Material, opts: SwayOptions): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSwayTime = swayUniforms.uSwayTime;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSwayTime;
        attribute float aSwayWeight;
        attribute float aSwayPhase;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float w = aSwayWeight;
          float t = uSwayTime / ${opts.period.toFixed(3)} * 6.2831853 + aSwayPhase * 6.2831853;
          // Two components so the motion is a lean and a twist, not a metronome.
          transformed.x += sin(t) * ${opts.amplitude.toFixed(4)} * w;
          transformed.z += sin(t * 0.63 + 1.7) * ${(opts.amplitude * 0.6).toFixed(4)} * w;
        }`,
      );
  };

  // Injected and uninjected variants of the same material must not collide in
  // the program cache.
  material.customProgramCacheKey = () =>
    `sway:${opts.amplitude.toFixed(4)}:${opts.period.toFixed(3)}`;
  material.needsUpdate = true;
}

/** Advance the shared sway clock. Called once per frame from the composition root. */
export function updateSway(elapsed: number): void {
  swayUniforms.uSwayTime.value = elapsed;
}
