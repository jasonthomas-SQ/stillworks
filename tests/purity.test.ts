import { describe, it, expect } from 'vitest';

// Read every source file through Vite's own module graph rather than node:fs.
// No @types/node needed, and the guard sees exactly the files that ship.
const sources = import.meta.glob('/src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Files that MUST stay pure. A file quietly dropping its marker is caught here,
// not by the marker scan below, which would simply stop checking it.
const MUST_BE_PURE = [
  '/src/core/math/damp.ts',
  '/src/core/math/rng.ts',
  '/src/core/math/noise.ts',
  '/src/core/input/merge.ts',
  '/src/data/kettle.ts',
  '/src/world/island/heightfield.ts',
  '/src/world/island/reachability.ts',
  '/src/world/island/terrainColour.ts',
  '/src/world/island/islandMesh.geometry.ts',
  '/src/entities/shim/heroController.ts',
  '/src/entities/shim/shimPose.ts',
];

const FORBIDDEN: [RegExp, string][] = [
  [/from\s+['"]three/, "imports 'three'"],
  [/\bwindow\b/, "references 'window'"],
  [/\bdocument\b/, "references 'document'"],
  [/\bnavigator\b/, "references 'navigator'"],
  [/\blocalStorage\b/, "references 'localStorage'"],
];

const isPure = (text: string): boolean => text.startsWith('// @pure');

describe('pure files', () => {
  it('finds source files at all — an empty glob would pass everything silently', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
    expect(sources['/src/config.ts']).toBeDefined();
  });

  it('every file marked // @pure imports no three and touches no DOM', () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
      if (!isPure(text)) continue;
      for (const [rx, why] of FORBIDDEN) {
        if (rx.test(text)) offenders.push(`${path} ${why}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every file that must be pure still carries the marker', () => {
    const missing = MUST_BE_PURE.filter((path) => {
      const text = sources[path];
      // not yet created; the task that creates it adds the marker
      return text !== undefined && !isPure(text);
    });
    expect(missing).toEqual([]);
  });
});
