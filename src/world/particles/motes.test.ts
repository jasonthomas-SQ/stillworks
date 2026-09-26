import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildHushspores, buildSteam, Motes } from './motes';
import { groundHeightAt } from '../island/heightfield';
import { skyStateAt } from '../sky/skyPalette';
import { tFromHours, solarNoonHour } from '../sky/dayClock';
import { KETTLE, cellCentre } from '../../data/kettle';
import { CONFIG } from '../../config';

describe('hushspores', () => {
  const points = buildHushspores();

  it('spawns on the moss banks the island data names', () => {
    const pos = points.geometry.getAttribute('position');
    const banks = KETTLE.sporeBanks.map(({ c, r }) => cellCentre(c, r));
    for (let i = 0; i < pos.count; i += 17) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const nearest = Math.min(...banks.map(([bx, bz]) => Math.hypot(x - bx, z - bz)));
      expect(nearest, `mote ${i}`).toBeLessThan(8);
    }
  });

  it('starts every mote on the ground, not inside it or above it', () => {
    const pos = points.geometry.getAttribute('position');
    const spawnY = points.geometry.getAttribute('aSpawnY');
    for (let i = 0; i < pos.count; i += 13) {
      const above = spawnY.getX(i) - groundHeightAt(pos.getX(i), pos.getZ(i));
      expect(above, `mote ${i}`).toBeGreaterThan(0);
      expect(above, `mote ${i}`).toBeLessThan(0.4);
    }
  });

  // World Bible §3: "rise dead straight ... never drifting sideways by more
  // than a hand's width", and §7 calls them the island's rhyme with the dial.
  // The shader must have no term that accumulates sideways.
  it('never drifts sideways — the wobble is a sine with no net travel', () => {
    const src = (points.material as THREE.ShaderMaterial).vertexShader;
    const code = src.replace(/\/\/.*$/gm, ' ');
    expect(code).toMatch(/p\.x \+= sin/);
    expect(code).toMatch(/p\.z \+= cos/);

    // Time may only enter a horizontal offset INSIDE a periodic function.
    // sin(uTime * k) is bounded; uTime * k is drift. Strip the sin and cos
    // calls, then no horizontal line may mention uTime at all.
    const withoutPeriodic = code.replace(/\b(sin|cos)\s*\([^)]*\)/g, 'P');
    for (const line of withoutPeriodic.split('\n')) {
      if (!/p\.[xz]\s*\+=/.test(line)) continue;
      expect(line, 'horizontal offset drifts with time').not.toMatch(/uTime/);
    }
    const wobble = (points.material as THREE.ShaderMaterial).uniforms.uWobble!.value as number;
    expect(wobble).toBeLessThanOrEqual(0.12); // a hand's width
  });

  it('rises at the bible speed and fades out at the bible height', () => {
    const u = (points.material as THREE.ShaderMaterial).uniforms;
    expect(u.uRiseSpeed!.value).toBeCloseTo(0.35, 6);
    expect(u.uRiseHeight!.value).toBe(25);
  });

  it('gives every mote its own phase, so the column is never in lockstep', () => {
    const phase = points.geometry.getAttribute('aPhase');
    const seen = new Set<number>();
    for (let i = 0; i < phase.count; i++) seen.add(phase.getX(i));
    expect(seen.size).toBeGreaterThan(phase.count * 0.99);
    // And they span the whole cycle rather than clustering.
    let min = 1;
    let max = 0;
    for (let i = 0; i < phase.count; i++) {
      min = Math.min(min, phase.getX(i));
      max = Math.max(max, phase.getX(i));
    }
    expect(min).toBeLessThan(0.05);
    expect(max).toBeGreaterThan(0.95);
  });

  it('is one draw call with no per-particle CPU work', () => {
    expect(points).toBeInstanceOf(THREE.Points);
    expect(points.geometry.getAttribute('position').count).toBe(500);
  });

  it('is deterministic', () => {
    const a = buildHushspores().geometry.getAttribute('position');
    const b = buildHushspores().geometry.getAttribute('position');
    for (let i = 0; i < 40; i++) expect(a.getX(i)).toBe(b.getX(i));
  });
});

describe('steam', () => {
  const points = buildSteam();

  it('rises from the Warm Stones vents only', () => {
    const pos = points.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i += 11) {
      expect(pos.getX(i), `mote ${i} x`).toBeGreaterThan(85);
      expect(pos.getZ(i), `mote ${i} z`).toBeGreaterThan(50);
      expect(pos.getZ(i), `mote ${i} z`).toBeLessThan(85);
    }
  });

  it('rises eight to twelve metres, per §7', () => {
    const u = (points.material as THREE.ShaderMaterial).uniforms;
    expect(u.uRiseHeight!.value).toBeGreaterThanOrEqual(8);
    expect(u.uRiseHeight!.value).toBeLessThanOrEqual(12);
  });

  it('is not additive — steam is opaque vapour, not glow', () => {
    expect((points.material as THREE.ShaderMaterial).blending).toBe(THREE.NormalBlending);
  });
});

describe('motes driven by the sky', () => {
  const motes = new Motes();
  const uniforms = (p: THREE.Points): Record<string, THREE.IUniform> =>
    (p.material as THREE.ShaderMaterial).uniforms;

  it('ramps hushspores from a handful at noon to a column at dusk and at night', () => {
    motes.update(0, skyStateAt(tFromHours(solarNoonHour())));
    const noon = uniforms(motes.hushspores).uDensity!.value as number;
    motes.update(0, skyStateAt(tFromHours(CONFIG.sun.sunsetHour - 0.5)));
    const dusk = uniforms(motes.hushspores).uDensity!.value as number;
    motes.update(0, skyStateAt(tFromHours(2)));
    const night = uniforms(motes.hushspores).uDensity!.value as number;

    expect(noon).toBeLessThan(0.25);
    expect(dusk).toBeGreaterThan(0.85);
    expect(night).toBeGreaterThan(0.85);
  });

  // §7: steam "catches the same sun the shaft does, so it is white at noon and
  // gold at dusk".
  it('turns the steam gold at dusk and pale at noon', () => {
    motes.update(0, skyStateAt(tFromHours(solarNoonHour())));
    const noon = (uniforms(motes.steam).uColour!.value as THREE.Color).clone();
    motes.update(0, skyStateAt(tFromHours(CONFIG.sun.sunsetHour - 0.5)));
    const dusk = (uniforms(motes.steam).uColour!.value as THREE.Color).clone();

    // Values are linear working-space, where a warm WHITE still reads well
    // above zero — the noon sun hex is #FFF4E0, not pure white. What the bible
    // asks for is the relationship: gold at dusk, white at noon.
    const noonWarmth = noon.r - noon.b;
    const duskWarmth = dusk.r - dusk.b;
    expect(duskWarmth / noonWarmth).toBeGreaterThan(2);
    expect(noonWarmth).toBeLessThan(0.16);
    expect(duskWarmth).toBeGreaterThan(0.25);
  });

  it('keeps steam running at every hour — the vents do not sleep', () => {
    for (const h of [3, 9, 15, 21]) {
      motes.update(0, skyStateAt(tFromHours(h)));
      expect(uniforms(motes.steam).uDensity!.value as number, `${h}h`).toBeGreaterThan(0.3);
    }
  });

  it('advances both systems from one elapsed clock', () => {
    motes.update(12.5, skyStateAt(0.5));
    expect(uniforms(motes.hushspores).uTime!.value).toBe(12.5);
    expect(uniforms(motes.steam).uTime!.value).toBe(12.5);
  });
});
