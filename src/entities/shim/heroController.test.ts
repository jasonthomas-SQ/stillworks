import { describe, it, expect } from 'vitest';
import { stepHero, initialHeroState, type HeroInput, type HeroState } from './heroController';
import { CONFIG } from '../../config';
import { cellCentre } from '../../data/kettle';
import { groundHeightAt } from '../../world/island/heightfield';

const still: HeroInput = { moveX: 0, moveY: 0, magnitude: 0, run: false };
const north: HeroInput = { moveX: 0, moveY: -1, magnitude: 1, run: false };
const south: HeroInput = { moveX: 0, moveY: 1, magnitude: 1, run: true };
const west: HeroInput = { moveX: -1, moveY: 0, magnitude: 1, run: true };
const east: HeroInput = { moveX: 1, moveY: 0, magnitude: 1, run: false };

const at = (c: number, r: number): HeroState => {
  const [x, z] = cellCentre(c, r);
  return { ...initialHeroState(), x, z, y: groundHeightAt(x, z), inWater: false };
};

const drive = (s: HeroState, input: HeroInput, frames: number, dt = 1 / 60): HeroState => {
  let cur = s;
  for (let i = 0; i < frames; i++) cur = stepHero(cur, input, 0, dt);
  return cur;
};

describe('heroController', () => {
  it('starts on the dry landing stage at c5 r12, facing north', () => {
    const s = initialHeroState();
    expect(s.x).toBeCloseTo(45, 6);
    expect(s.z).toBeCloseTo(115, 6);
    expect(s.inWater).toBe(false);
    expect(s.yaw).toBe(0);
  });

  it('reaches walk speed and no more', () => {
    // On flat dry ground: walking north from the start cell crosses the stair
    // water, where the 0.85 water factor correctly caps the speed lower.
    const s = drive(at(7, 8), east, 300);
    expect(s.speed).toBeLessThanOrEqual(CONFIG.hero.walkSpeed + 1e-6);
    expect(s.speed).toBeGreaterThan(CONFIG.hero.walkSpeed * 0.95);
  });

  it('reaches run speed when run is held', () => {
    const s = drive(at(7, 8), { ...east, run: true }, 300);
    expect(s.speed).toBeGreaterThan(CONFIG.hero.runSpeed * 0.95);
    expect(s.speed).toBeLessThanOrEqual(CONFIG.hero.runSpeed + 1e-6);
  });

  it('stops within half a second of releasing input', () => {
    const moving = drive(initialHeroState(), north, 120);
    const stopped = drive(moving, still, 30);
    expect(stopped.speed).toBeLessThan(0.05);
  });

  it('is frame-rate independent: 120fps and 30fps land within 5cm over two seconds', () => {
    const a = drive(initialHeroState(), north, 240, 1 / 120);
    const b = drive(initialHeroState(), north, 60, 1 / 30);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.05);
  });

  it('never climbs the Fernwell west wall', () => {
    const s = drive(at(5, 7), west, 600); // c5 r7, gorge floor at 7 m
    expect(s.y).toBeLessThan(11); // the terrace above is at 17 m
  });

  it('never reaches the terrace from the talus at the wall foot', () => {
    // Marlowe's ruling: the talus is standable, the terrace above is not.
    const s = drive(at(4, 7), west, 900);
    expect(s.y).toBeLessThan(11);
  });

  it('never walks off the south edge into deep sea', () => {
    const s = drive(initialHeroState(), south, 900);
    expect(s.z).toBeLessThan(128);
    expect(s.y).toBeGreaterThan(-1);
  });

  it('can wade south past the gorge mouth before stopping', () => {
    // A shoreline, not an invisible wall at the start cell.
    const s = drive(initialHeroState(), south, 900);
    expect(s.z).toBeGreaterThan(118);
  });

  it('slides along a wall instead of sticking to it', () => {
    const nw: HeroInput = { moveX: -0.7071, moveY: -0.7071, magnitude: 1, run: false };
    const start = at(5, 7);
    const s = drive(start, nw, 120);
    expect(start.z - s.z).toBeGreaterThan(1.5); // still made northward progress
  });

  it('reports standing in the stair water, and dry ground as dry', () => {
    expect(stepHero(at(6, 12), still, 0, 1 / 60).inWater).toBe(true);
    expect(stepHero(at(5, 12), still, 0, 1 / 60).inWater).toBe(false); // landing stage
    expect(stepHero(at(7, 8), still, 0, 1 / 60).inWater).toBe(false); // Fernwell
  });

  it('crosses the stair water on the way north out of the start cell', () => {
    const s = drive(initialHeroState(), north, 90);
    expect(s.speed).toBeLessThan(CONFIG.hero.walkSpeed);
    expect(s.speed).toBeGreaterThan(CONFIG.hero.walkSpeed * CONFIG.hero.waterSpeedFactor * 0.95);
  });

  it('applies the water speed factor', () => {
    const wet = { ...at(6, 12), inWater: true };
    const dry = { ...at(7, 8), inWater: false };
    const a = drive(wet, east, 300);
    const b = drive(dry, east, 300);
    expect(a.speed).toBeLessThan(b.speed);
  });

  it('applies input relative to the camera yaw', () => {
    let plain = initialHeroState();
    let rotated = initialHeroState();
    for (let i = 0; i < 60; i++) {
      plain = stepHero(plain, east, 0, 1 / 60);
      rotated = stepHero(rotated, east, Math.PI / 2, 1 / 60);
    }
    expect(plain.x).toBeGreaterThan(initialHeroState().x);
    expect(Math.abs(rotated.x - initialHeroState().x)).toBeLessThan(Math.abs(plain.x - initialHeroState().x));
  });

  it('never yaws while standing still', () => {
    const s = drive(initialHeroState(), still, 60);
    expect(s.yaw).toBe(initialHeroState().yaw);
  });

  it('faces the way it is travelling', () => {
    const s = drive(at(7, 8), east, 60);
    expect(Math.abs(s.yaw - Math.PI / 2)).toBeLessThan(0.2);
  });

  it('accumulates distance monotonically', () => {
    let s = initialHeroState();
    let last = 0;
    for (let i = 0; i < 120; i++) {
      s = stepHero(s, north, 0, 1 / 60);
      expect(s.distanceTravelled).toBeGreaterThanOrEqual(last);
      last = s.distanceTravelled;
    }
    expect(s.distanceTravelled).toBeGreaterThan(3);
  });

  it('keeps the hero on the ground everywhere it can reach', () => {
    let s = initialHeroState();
    const dirs: HeroInput[] = [north, east, west, south];
    for (let leg = 0; leg < 20; leg++) {
      s = drive(s, dirs[leg % 4]!, 90);
      expect(Math.abs(s.y - groundHeightAt(s.x, s.z))).toBeLessThan(1e-9);
    }
  });

  it('never mutates the state it is given', () => {
    const s = initialHeroState();
    const snapshot = JSON.stringify(s);
    stepHero(s, north, 0, 1 / 60);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
