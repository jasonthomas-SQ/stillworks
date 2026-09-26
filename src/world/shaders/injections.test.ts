import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applySway, updateSway, swayUniforms, SWAY_ANCHOR } from './injections';

// The version-coupled guard. onBeforeCompile matches on chunk names and chunk
// contents, and when a three bump changes either, NOTHING THROWS — the material
// compiles without the injection and the ferns quietly stop moving. That is
// exactly the class of failure an engineer who cannot see the screen will miss,
// so it gets a test that fails loudly instead.

const compile = (material: THREE.Material): { vertexShader: string; uniforms: Record<string, THREE.IUniform> } => {
  const shader = {
    vertexShader: THREE.ShaderChunk.common + '\n#include <common>\n#include <begin_vertex>',
    fragmentShader: '',
    uniforms: {} as Record<string, THREE.IUniform>,
  };
  material.onBeforeCompile!(shader as never, null as never);
  return shader;
};

describe('sway injection against the pinned three', () => {
  it('still finds the begin_vertex chunk it injects after', () => {
    const chunks = THREE.ShaderChunk as unknown as Record<string, string | undefined>;
    expect(chunks.begin_vertex).toBeDefined();
    expect(chunks.begin_vertex).toContain(SWAY_ANCHOR);
  });

  it('still finds the common chunk it declares uniforms after', () => {
    const chunks = THREE.ShaderChunk as unknown as Record<string, string | undefined>;
    expect(chunks.common).toBeDefined();
  });

  it('actually rewrites the shader — a silent no-op fails here', () => {
    const m = new THREE.MeshLambertMaterial();
    applySway(m, { amplitude: 0.4, period: 7 });
    const shader = compile(m);

    expect(shader.vertexShader).toContain('aSwayWeight');
    expect(shader.vertexShader).toContain('aSwayPhase');
    expect(shader.vertexShader).toContain('uSwayTime');
    expect(shader.vertexShader).toContain('transformed.x +=');
    expect(shader.vertexShader).toContain('transformed.z +=');
  });

  it('shares one clock across every swaying material', () => {
    const a = new THREE.MeshLambertMaterial();
    const b = new THREE.MeshLambertMaterial();
    applySway(a, { amplitude: 0.4, period: 7 });
    applySway(b, { amplitude: 0.1, period: 3 });

    const sa = compile(a);
    const sb = compile(b);
    expect(sa.uniforms.uSwayTime).toBe(sb.uniforms.uSwayTime);

    updateSway(12.25);
    expect(sa.uniforms.uSwayTime!.value).toBe(12.25);
    expect(sb.uniforms.uSwayTime!.value).toBe(12.25);
    expect(swayUniforms.uSwayTime.value).toBe(12.25);
  });

  it('keeps injected and uninjected variants apart in the program cache', () => {
    const plain = new THREE.MeshLambertMaterial();
    const swayed = new THREE.MeshLambertMaterial();
    const other = new THREE.MeshLambertMaterial();
    applySway(swayed, { amplitude: 0.4, period: 7 });
    applySway(other, { amplitude: 0.1, period: 3 });

    expect(swayed.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey());
    expect(swayed.customProgramCacheKey()).not.toBe(other.customProgramCacheKey());
  });

  it('bakes amplitude and period into the source, so they cannot drift', () => {
    const m = new THREE.MeshLambertMaterial();
    applySway(m, { amplitude: 0.42, period: 7.5 });
    const src = compile(m).vertexShader;
    expect(src).toContain('0.4200');
    expect(src).toContain('7.500');
  });

  it('moves nothing where the sway weight is zero — trunks hold still', () => {
    // The injected offsets are both multiplied by w, and w is the attribute.
    const m = new THREE.MeshLambertMaterial();
    applySway(m, { amplitude: 0.4, period: 7 });
    const src = compile(m).vertexShader;
    for (const line of src.split('\n')) {
      if (!/transformed\.[xz]\s*\+=/.test(line)) continue;
      expect(line, 'sway offset not weighted').toMatch(/\*\s*w\s*;/);
    }
  });
});
