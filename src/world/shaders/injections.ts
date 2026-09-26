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

/**
 * The camera-to-hero sight line, shared by every material that fades out of it.
 *
 * Jason's call at the M2 check: Shim walking under the canopy is wanted — §4-B
 * has "the camera looks down through frond gaps". So the fix for the canopy
 * hiding Shim is not to move the ferns out of the way, which would delete that,
 * but to stipple away only the fronds that come between the lens and Shim.
 */
export const sightUniforms = {
  uSightFrom: { value: [0, 0, 0] as [number, number, number] },
  uSightTo: { value: [0, 0, 0] as [number, number, number] },
  uSightRadius: { value: 2.5 },
};

export type SwayOptions = {
  /** Metres of travel at full sway weight. */
  amplitude: number;
  /** Seconds per cycle. */
  period: number;
  /** Stipple away where this material would hide the hero from the camera. */
  fadeFromSightLine?: boolean;
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
        attribute float aSwayPhase;
        ${opts.fadeFromSightLine ? 'varying vec3 vWorldPos;' : ''}`,
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

    if (opts.fadeFromSightLine) {
      // Capture the swayed, instanced world position so the fade follows the
      // frond rather than the instance origin.
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`,
      );

      shader.uniforms.uSightFrom = sightUniforms.uSightFrom;
      shader.uniforms.uSightTo = sightUniforms.uSightTo;
      shader.uniforms.uSightRadius = sightUniforms.uSightRadius;

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform vec3 uSightFrom;
          uniform vec3 uSightTo;
          uniform float uSightRadius;
          varying vec3 vWorldPos;

          float distanceToSightLine(vec3 p) {
            vec3 ab = uSightTo - uSightFrom;
            float t = clamp(dot(p - uSightFrom, ab) / max(dot(ab, ab), 1e-5), 0.0, 1.0);
            return length(p - (uSightFrom + ab * t));
          }`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          {
            // Stipple, not a soft alpha fade: this material is opaque, and
            // ordered transparency for a hundred instanced crowns would cost
            // far more than a discard. A screen-space dither reads as dappled
            // canopy rather than as a hole punched in the leaves.
            float d = distanceToSightLine(vWorldPos);
            float hide = 1.0 - smoothstep(uSightRadius * 0.55, uSightRadius, d);
            if (hide > 0.01) {
              vec2 c = floor(mod(gl_FragCoord.xy, 4.0));
              float bayer = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
              if (bayer < hide) discard;
            }
          }`,
        );
    }
  };

  // Injected and uninjected variants of the same material must not collide in
  // the program cache.
  material.customProgramCacheKey = () =>
    `sway:${opts.amplitude.toFixed(4)}:${opts.period.toFixed(3)}:${opts.fadeFromSightLine ? 'fade' : 'solid'}`;
  material.needsUpdate = true;
}

/** Advance the shared sway clock. Called once per frame from the composition root. */
export function updateSway(elapsed: number): void {
  swayUniforms.uSwayTime.value = elapsed;
}

/** Point the canopy fade at the current camera and hero. Once per frame. */
export function updateSightLine(
  from: [number, number, number],
  to: [number, number, number],
  radius: number,
): void {
  sightUniforms.uSightFrom.value = from;
  sightUniforms.uSightTo.value = to;
  sightUniforms.uSightRadius.value = radius;
}
