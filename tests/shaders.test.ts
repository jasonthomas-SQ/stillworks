import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

// Every custom fragment shader in the project, read through Vite's own module
// graph so a new one cannot be added without this test seeing it.
const fragmentShaders = import.meta.glob('/src/**/*.frag.glsl', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const vertexShaders = import.meta.glob('/src/**/*.vert.glsl', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const chunks = THREE.ShaderChunk as unknown as Record<string, string | undefined>;

// A ShaderMaterial writes gl_FragColor in the renderer's WORKING colour space.
// Without colorspace_fragment it ships those linear values straight to an sRGB
// target, so every hand-written shader renders darker than its hex and cannot
// match a built-in material beside it — Odin found sky, water and steam all
// doing exactly that.
describe('custom shaders convert to the output colour space', () => {
  it('finds the shaders at all — an empty glob would pass everything', () => {
    expect(Object.keys(fragmentShaders).length).toBeGreaterThanOrEqual(3);
    expect(Object.keys(vertexShaders).length).toBeGreaterThanOrEqual(3);
  });

  it('still has the colorspace_fragment chunk in the pinned three', () => {
    expect(chunks.colorspace_fragment, 'ShaderChunk.colorspace_fragment').toBeDefined();
    expect(typeof chunks.colorspace_fragment).toBe('string');
  });

  it('includes it in every custom fragment shader', () => {
    for (const [path, src] of Object.entries(fragmentShaders)) {
      expect(src, `${path} is missing #include <colorspace_fragment>`).toContain(
        '#include <colorspace_fragment>',
      );
    }
  });

  it('converts after writing gl_FragColor, and before fog', () => {
    // three's own order: opaque, tonemapping, colorspace, fog. Fog must be
    // applied in the output space or fogged water will not meet fogged terrain.
    for (const [path, src] of Object.entries(fragmentShaders)) {
      const write = src.indexOf('gl_FragColor =');
      const convert = src.indexOf('#include <colorspace_fragment>');
      expect(write, `${path} never writes gl_FragColor`).toBeGreaterThanOrEqual(0);
      expect(convert, `${path} converts before writing gl_FragColor`).toBeGreaterThan(write);

      const fog = src.indexOf('#include <fog_fragment>');
      if (fog >= 0) {
        expect(fog, `${path} fogs before converting`).toBeGreaterThan(convert);
      }
    }
  });

  it('only includes chunks that exist in the pinned three', () => {
    // A renamed chunk resolves to an empty string rather than throwing, so the
    // shader compiles and quietly does less than it should.
    for (const [path, src] of Object.entries({ ...fragmentShaders, ...vertexShaders })) {
      for (const match of src.matchAll(/#include <(\w+)>/g)) {
        const name = match[1]!;
        expect(chunks[name], `${path} includes missing chunk <${name}>`).toBeDefined();
      }
    }
  });

  it('pairs every fog_fragment with its pars declaration', () => {
    for (const [path, src] of Object.entries(fragmentShaders)) {
      if (!src.includes('#include <fog_fragment>')) continue;
      expect(src, `${path} uses fog without fog_pars_fragment`).toContain(
        '#include <fog_pars_fragment>',
      );
    }
  });
});
