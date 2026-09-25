// @pure
// Shim's motion, from Character Bible §1 "Motion in words". Pure numbers in,
// pure numbers out: this is the file that lets me see the animation without
// looking at it.
//
// Amplitudes and periods here are starting values, not gospel. If one feels
// wrong on screen it changes here and Marlowe is told what changed.

import { CONFIG } from '../../config';
import { damp, dampAngle } from '../../core/math/damp';
import { makeRng } from '../../core/math/rng';

export type LegPose = {
  thighPitch: number;
  shinPitch: number;
  /** Spring compression, metres. Negative is compressed. */
  footY: number;
};

export type Pose = {
  /** Body height above the hero's ground point. Dead level while moving. */
  bodyY: number;
  /** Forward lean, radians. Only at a run. */
  bodyPitch: number;
  tuftYaw: number;
  tuftPitch: number;
  /** 1 open, 2/3 at the closed end of an iris. */
  irisScale: number;
  /** 0 folded against the flank, 1 fully unfolded. */
  armFold: number;
  legs: [LegPose, LegPose];
};

export type PoseInput = {
  speed: number;
  dt: number;
  inWater: boolean;
  /** Radians per second the body is yawing. Drives tuft lag. */
  yawRate: number;
};

export type PoseMemory = {
  gaitPhase: number;
  strideCount: number;
  elapsed: number;
  irisTimer: number;
  irisPhase: number;
  irisCount: number;
  oilPhase: number;
  bodyPitch: number;
  tuftYaw: number;
  rngState: number;
};

// ---- tuning, all from Character Bible §1 ----

const BODY_Y = 0.45;
const IDLE_SETTLE = 0.015;
const RUN_LEAN_DEG = 4.5;
/** Above this, the mechanism is holding and the wobble disappears. */
const RUN_THRESHOLD = CONFIG.hero.walkSpeed * 1.2;
const WALK_FLOOR = 0.5;
const IRIS_BASE_SEC = 4;
const IRIS_JITTER_SEC = 1.3;
const IRIS_CYCLE_SEC = 0.5;
const IRIS_CLOSED = 2 / 3;
const OIL_CYCLE_SEC = 1.8;
/** Every fourth stride the mechanism nearly runs out of tension. */
const WOBBLE_EVERY = 4;
const WOBBLE_LAG = 0.78;
const WOBBLE_CATCH = 1.09;
const WOBBLE_LAG_FRACTION = 0.3;
const TUFT_DRIFT_PERIOD = 7;
const TUFT_DRIFT_AMPLITUDE = 0.02;

export function initialPoseMemory(): PoseMemory {
  const rng = makeRng(CONFIG.seed);
  return {
    gaitPhase: 0,
    strideCount: 0,
    elapsed: 0,
    irisTimer: IRIS_BASE_SEC * 0.5,
    irisPhase: 0,
    irisCount: 0,
    oilPhase: 0,
    bodyPitch: 0,
    tuftYaw: 0,
    rngState: Math.floor(rng() * 0xffffffff),
  };
}

/** Deterministic jitter that advances with the memory, never Math.random. */
function nextJitter(mem: PoseMemory): { value: number; state: number } {
  const rng = makeRng(mem.rngState);
  const value = rng();
  return { value, state: Math.floor(rng() * 0xffffffff) };
}

/**
 * The wind-down wobble: on every fourth walk stride, the gait lags through the
 * first 30% and catches up over the rest. It nets to zero, so no distance is
 * lost — Shim is metronomic overall, with a hitch inside the beat.
 */
function wobbleFactor(strideCount: number, phase: number, speed: number): number {
  if (speed < WALK_FLOOR || speed > RUN_THRESHOLD) return 1;
  if (strideCount % WOBBLE_EVERY !== WOBBLE_EVERY - 1) return 1;
  return phase < WOBBLE_LAG_FRACTION ? WOBBLE_LAG : WOBBLE_CATCH;
}

export function stepPose(
  mem: PoseMemory,
  input: PoseInput,
): { mem: PoseMemory; pose: Pose } {
  const { speed, dt, inWater, yawRate } = input;
  const moving = speed > WALK_FLOOR;
  const running = speed > RUN_THRESHOLD;

  // ---- gait ----
  const waterFactor = inWater ? CONFIG.hero.waterSpeedFactor : 1;
  const wobble = wobbleFactor(mem.strideCount, mem.gaitPhase, speed);
  const advance = (speed / CONFIG.hero.strideLength) * dt * waterFactor * wobble;

  let gaitPhase = mem.gaitPhase + advance;
  let strideCount = mem.strideCount;
  while (gaitPhase >= 1) {
    gaitPhase -= 1;
    strideCount += 1;
  }

  // ---- iris: roughly every four seconds, never on a fixed beat ----
  let irisTimer = mem.irisTimer - dt;
  let irisPhase = mem.irisPhase;
  let irisCount = mem.irisCount;
  let rngState = mem.rngState;

  if (irisPhase > 0) {
    irisPhase = Math.max(0, irisPhase - dt / IRIS_CYCLE_SEC);
  } else if (irisTimer <= 0) {
    const j = nextJitter(mem);
    rngState = j.state;
    irisTimer = IRIS_BASE_SEC + (j.value * 2 - 1) * IRIS_JITTER_SEC;
    irisPhase = 1;
    irisCount += 1;
  }

  // 1 -> IRIS_CLOSED -> 1 across the cycle.
  const irisT = 1 - irisPhase; // 0..1 through the cycle
  const irisScale = 1 - (1 - IRIS_CLOSED) * Math.sin(irisT * Math.PI);

  // ---- oil gesture: every third or fourth iris, and only while still ----
  let oilPhase = mem.oilPhase;
  if (oilPhase > 0) {
    oilPhase = Math.max(0, oilPhase - dt / OIL_CYCLE_SEC);
  } else if (!moving && irisPhase === 1 && irisCount % 3 === 0) {
    oilPhase = 1;
  }
  const armFold = moving ? 0 : Math.sin((1 - oilPhase) * Math.PI);

  // ---- body: dead level, leaning only at a run ----
  const targetPitch = running ? (RUN_LEAN_DEG * Math.PI) / 180 : 0;
  const bodyPitch = damp(mem.bodyPitch, targetPitch, 6, dt);
  const elapsed = mem.elapsed + dt;
  const bodyY = moving ? BODY_Y : BODY_Y - IDLE_SETTLE;

  // ---- tuft: lags the turn, and never stops drifting ----
  const tuftTarget = -yawRate * 0.12;
  const tuftYaw = dampAngle(mem.tuftYaw, tuftTarget, 5, dt);
  const tuftDrift =
    Math.sin((elapsed / TUFT_DRIFT_PERIOD) * Math.PI * 2) * TUFT_DRIFT_AMPLITUDE;

  // ---- legs: sprung, half a cycle apart ----
  const legs: [LegPose, LegPose] = [leg(gaitPhase, running), leg(gaitPhase + 0.5, running)];

  return {
    mem: {
      gaitPhase,
      strideCount,
      elapsed,
      irisTimer,
      irisPhase,
      irisCount,
      oilPhase,
      bodyPitch,
      tuftYaw,
      rngState,
    },
    pose: {
      bodyY,
      bodyPitch,
      tuftYaw: tuftYaw + tuftDrift,
      tuftPitch: 0.12 + tuftDrift * 0.5,
      irisScale,
      armFold,
      legs,
    },
  };
}

function leg(phase: number, running: boolean): LegPose {
  const p = ((phase % 1) + 1) % 1;
  const theta = p * Math.PI * 2;
  // Shorter stride at a run: a trolley pattering, not a sprint.
  const swing = running ? 0.34 : 0.46;
  const thighPitch = Math.sin(theta) * swing;
  const shinPitch = Math.max(0, Math.sin(theta - 0.9)) * swing * 0.9;
  // Compression through the contact quarter, rebounding out of it.
  const contact = Math.max(0, -Math.sin(theta));
  const footY = -contact * 0.04;
  return { thighPitch, shinPitch, footY };
}
