import { describe, it, expect } from 'vitest';
import { stepPose, initialPoseMemory, type Pose, type PoseMemory } from './shimPose';
import { CONFIG } from '../../config';

// This suite is how I see Shim move. Every assertion is a line from the
// Character Bible §1 turned into a number.

const run = (
  speed: number,
  seconds: number,
  { dt = 1 / 60, inWater = false, yawRate = 0 } = {},
): { mem: PoseMemory; poses: Pose[] } => {
  let mem = initialPoseMemory();
  const poses: Pose[] = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const r = stepPose(mem, { speed, dt, inWater, yawRate });
    mem = r.mem;
    poses.push(r.pose);
  }
  return { mem, poses };
};

const WALK = CONFIG.hero.walkSpeed;
const RUN = CONFIG.hero.runSpeed;

describe('shimPose', () => {
  it('holds the body dead level through a walk — no bob', () => {
    const ys = run(WALK, 4).poses.map((p) => p.bodyY);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.002);
  });

  it('holds the body dead level through a run too', () => {
    const ys = run(RUN, 4).poses.map((p) => p.bodyY);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.002);
  });

  it('never jumps: no leg angle moves more than 0.35 rad in one frame', () => {
    for (const speed of [0, 1.2, WALK, RUN]) {
      const { poses } = run(speed, 6);
      for (let i = 1; i < poses.length; i++) {
        for (const l of [0, 1] as const) {
          expect(
            Math.abs(poses[i]!.legs[l].thighPitch - poses[i - 1]!.legs[l].thighPitch),
            `thigh ${l} at speed ${speed}`,
          ).toBeLessThan(0.35);
          expect(
            Math.abs(poses[i]!.legs[l].shinPitch - poses[i - 1]!.legs[l].shinPitch),
            `shin ${l} at speed ${speed}`,
          ).toBeLessThan(0.35);
        }
      }
    }
  });

  it('keeps the two legs half a cycle apart', () => {
    const p = run(WALK, 2).poses.at(-1)!;
    expect(p.legs[0].thighPitch).not.toBeCloseTo(p.legs[1].thighPitch, 2);
  });

  it('has exactly three limbs in the pose — two legs and one arm', () => {
    const p = run(WALK, 1).poses.at(-1)!;
    expect(p.legs).toHaveLength(2);
    expect(typeof p.armFold).toBe('number');
  });

  it('puts a wind-down wobble on every fourth walk stride and nowhere else', () => {
    // Measure gait advance per frame; on the wobble stride it varies, elsewhere
    // it is metronomic.
    let mem = initialPoseMemory();
    const perStride = new Map<number, Set<number>>();
    for (let i = 0; i < 60 * 20; i++) {
      const before = mem.gaitPhase + mem.strideCount;
      // Attribute the advance to the stride that PRODUCED it, not the one it
      // may have just rolled into.
      const stride = mem.strideCount % 4;
      const r = stepPose(mem, { speed: WALK, dt: 1 / 60, inWater: false, yawRate: 0 });
      mem = r.mem;
      const delta = Number((mem.gaitPhase + mem.strideCount - before).toFixed(9));
      if (!perStride.has(stride)) perStride.set(stride, new Set());
      perStride.get(stride)!.add(delta);
    }
    // Stride 3 (the fourth) carries two advance rates: the lag and the catch.
    expect(perStride.get(3)!.size).toBeGreaterThan(1);
    // Strides 0-2 are perfectly even.
    for (const s of [0, 1, 2]) expect(perStride.get(s)!.size).toBe(1);
  });

  it('loses no distance to the wobble — the lag and the catch cancel', () => {
    const withWobble = run(WALK, 30).mem;
    const total = withWobble.strideCount + withWobble.gaitPhase;
    const ideal = (WALK / CONFIG.hero.strideLength) * 30;
    expect(total / ideal).toBeGreaterThan(0.97);
    expect(total / ideal).toBeLessThan(1.03);
  });

  it('has no wobble at a run — the mechanism is holding', () => {
    let mem = initialPoseMemory();
    const deltas: number[] = [];
    for (let i = 0; i < 400; i++) {
      const before = mem.gaitPhase + mem.strideCount;
      const r = stepPose(mem, { speed: RUN, dt: 1 / 60, inWater: false, yawRate: 0 });
      mem = r.mem;
      deltas.push(mem.gaitPhase + mem.strideCount - before);
    }
    expect(Math.max(...deltas) - Math.min(...deltas)).toBeLessThan(1e-9);
  });

  it('leans forward 4 to 5 degrees at a run and not at a walk', () => {
    const runPitch = run(RUN, 3).poses.at(-1)!.bodyPitch;
    expect(runPitch).toBeGreaterThan((4 * Math.PI) / 180);
    expect(runPitch).toBeLessThan((5.5 * Math.PI) / 180);
    expect(Math.abs(run(WALK, 3).poses.at(-1)!.bodyPitch)).toBeLessThan((0.3 * Math.PI) / 180);
  });

  it('irises the lens while idle, off a regular beat', () => {
    const { poses } = run(0, 40);
    expect(Math.min(...poses.map((p) => p.irisScale))).toBeCloseTo(2 / 3, 2);

    const events: number[] = [];
    for (let i = 1; i < poses.length; i++) {
      if (poses[i]!.irisScale < 0.999 && poses[i - 1]!.irisScale >= 0.999) events.push(i);
    }
    expect(events.length).toBeGreaterThan(4);
    const gaps = events.slice(1).map((v, i) => v - events[i]!);
    expect(new Set(gaps).size).toBeGreaterThan(1);
  });

  it('keeps the iris between the closed value and fully open', () => {
    for (const p of run(0, 20).poses) {
      expect(p.irisScale).toBeGreaterThanOrEqual(2 / 3 - 1e-9);
      expect(p.irisScale).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('never unfolds the arm while moving', () => {
    expect(Math.max(...run(WALK, 30).poses.map((p) => p.armFold))).toBe(0);
    expect(Math.max(...run(RUN, 30).poses.map((p) => p.armFold))).toBe(0);
  });

  it('unfolds the arm sometimes while idle', () => {
    expect(Math.max(...run(0, 60).poses.map((p) => p.armFold))).toBeGreaterThan(0.9);
  });

  it('slows the click-step by about fifteen per cent in water', () => {
    const dry = run(WALK, 10).mem;
    const wet = run(WALK, 10, { inWater: true }).mem;
    const ratio =
      (wet.strideCount + wet.gaitPhase) / (dry.strideCount + dry.gaitPhase);
    expect(ratio).toBeGreaterThan(0.82);
    expect(ratio).toBeLessThan(0.88);
  });

  it('drifts the tuft even when nothing else moves', () => {
    const yaws = run(0, 10).poses.map((p) => p.tuftYaw);
    expect(Math.max(...yaws) - Math.min(...yaws)).toBeGreaterThan(0.01);
  });

  it('lags the tuft behind a turn', () => {
    const turning = run(WALK, 2, { yawRate: 2 }).poses.at(-1)!;
    const straight = run(WALK, 2).poses.at(-1)!;
    expect(turning.tuftYaw).toBeLessThan(straight.tuftYaw);
  });

  it('is deterministic', () => {
    expect(run(WALK, 5).poses.at(-1)).toEqual(run(WALK, 5).poses.at(-1));
    expect(run(0, 12).mem).toEqual(run(0, 12).mem);
  });

  it('is frame-rate independent in gait distance', () => {
    const a = run(WALK, 6, { dt: 1 / 120 }).mem;
    const b = run(WALK, 6, { dt: 1 / 30 }).mem;
    const ta = a.strideCount + a.gaitPhase;
    const tb = b.strideCount + b.gaitPhase;
    expect(Math.abs(ta - tb) / ta).toBeLessThan(0.02);
  });

  it('never mutates the memory it is given', () => {
    const mem = initialPoseMemory();
    const snapshot = JSON.stringify(mem);
    stepPose(mem, { speed: WALK, dt: 1 / 60, inWater: false, yawRate: 1 });
    expect(JSON.stringify(mem)).toBe(snapshot);
  });
});
