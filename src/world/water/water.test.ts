import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Water, createWaterMaterial } from './water';
import { groundHeightAt, isWaterAt } from '../island/heightfield';
import { cellCentre } from '../../data/kettle';
import { CONFIG } from '../../config';

// The shader itself cannot run in Node, so what is tested here is everything
// around it: the geometry, the uniform wiring, and the chunk names the shader
// depends on. Those chunk names are the version-coupled part — they fail
// silently on a three bump, so they get a guard.

describe('water material', () => {
  it('still finds the fog chunks it includes', () => {
    const chunks = THREE.ShaderChunk as unknown as Record<string, string | undefined>;
    for (const chunk of ['fog_pars_vertex', 'fog_vertex', 'fog_pars_fragment', 'fog_fragment']) {
      expect(chunks[chunk], `ShaderChunk.${chunk}`).toBeDefined();
      expect(typeof chunks[chunk]).toBe('string');
    }
  });

  it('merges the fog uniforms the chunks expect', () => {
    const m = createWaterMaterial();
    expect(m.uniforms.fogColor).toBeDefined();
    expect(m.uniforms.fogNear).toBeDefined();
    expect(m.uniforms.fogFar).toBeDefined();
    expect(m.fog).toBe(true);
  });

  it('declares every uniform its fragment shader reads', () => {
    const m = createWaterMaterial();
    for (const name of m.fragmentShader.matchAll(/uniform\s+\w+\s+(u\w+)\s*;/g)) {
      expect(m.uniforms[name[1]!], `fragment uniform ${name[1]}`).toBeDefined();
    }
    for (const name of m.vertexShader.matchAll(/uniform\s+\w+\s+(u\w+)\s*;/g)) {
      expect(m.uniforms[name[1]!], `vertex uniform ${name[1]}`).toBeDefined();
    }
  });

  it('is unlit, unglossy and transparent — the brief rules out shiny water', () => {
    const m = createWaterMaterial();
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    // Strip comments first: the shader's own comment says it has no specular
    // and no reflection, and matching prose is not the same as matching code.
    const code = m.fragmentShader.replace(/\/\/.*$/gm, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(code).not.toMatch(/specular|reflect|envMap/i);
  });
});

describe('water geometry', () => {
  const water = new Water();

  it('puts the sea surface at the configured water line', () => {
    expect(water.sea.position.y).toBeCloseTo(CONFIG.units.waterY, 6);
  });

  it('covers every water cell with the sea plane', () => {
    water.sea.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(water.sea);
    for (let r = 1; r <= 12; r++) {
      for (let c = 1; c <= 12; c++) {
        const [x, z] = cellCentre(c, r);
        if (!isWaterAt(x, z)) continue;
        expect(x, `c${c}r${r} x`).toBeGreaterThan(bounds.min.x);
        expect(x, `c${c}r${r} x`).toBeLessThan(bounds.max.x);
        expect(z, `c${c}r${r} z`).toBeGreaterThan(bounds.min.z);
        expect(z, `c${c}r${r} z`).toBeLessThan(bounds.max.z);
      }
    }
  });

  it('samples the sea finely enough for its shortest wave', () => {
    // The shortest sine has a wavelength near 2.6 m; quads coarser than about
    // half that would alias it away entirely.
    const g = water.sea.geometry as THREE.PlaneGeometry;
    const p = g.parameters;
    expect(p.width / p.widthSegments).toBeLessThan(3.2);
  });

  it('runs the stream along the ground, never buried and never floating', () => {
    const pos = water.stream.geometry.getAttribute('position');
    let worstAbove = 0;
    let worstBelow = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const above = y - groundHeightAt(x, z);
      worstAbove = Math.max(worstAbove, above);
      worstBelow = Math.min(worstBelow, above);
    }
    expect(worstBelow).toBeGreaterThan(-0.01); // never sunk into the terrain
    expect(worstAbove).toBeLessThan(0.2); // and never hovering above it
  });

  it('runs the stream from the head of Fernwell into the pool', () => {
    water.stream.geometry.computeBoundingBox();
    const b = water.stream.geometry.boundingBox!;
    expect(b.min.z).toBeLessThan(50); // starts up at r5
    expect(b.max.z).toBeGreaterThan(105); // reaches the stair pool
    // And it loses height on the way down, as a stream should.
    expect(groundHeightAt(65, 45)).toBeGreaterThan(groundHeightAt(60, 110));
  });

  it('shares one material between the sea and the stream — one draw call each', () => {
    expect(water.sea.material).toBe(water.stream.material);
  });

  it('never casts or receives shadows', () => {
    for (const m of [water.sea, water.stream]) {
      expect(m.castShadow).toBe(false);
      expect(m.receiveShadow).toBe(false);
    }
  });
});
