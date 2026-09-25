// @pure
// Kinematic hero movement. No physics engine: camera-relative input to velocity,
// integrate in the horizontal plane, snap to the ground, and reject a step whose
// slope exceeds the limit. That one rule covers cliffs, the terrace edge and the
// open sea, so there are no invisible walls anywhere on the island.

import { CONFIG } from '../../config';
import { damp, dampAngle } from '../../core/math/damp';
import {
  groundHeightAt,
  slopeBetween,
  isWaterAt,
  cellAt,
  tokenAt,
} from '../../world/island/heightfield';
import { KETTLE, cellCentre } from '../../data/kettle';

export type HeroState = {
  x: number;
  z: number;
  y: number;
  /** Facing, radians. 0 looks north (-z). */
  yaw: number;
  vx: number;
  vz: number;
  speed: number;
  inWater: boolean;
  /** Metres walked, for the footstep trigger. Monotonic. */
  distanceTravelled: number;
};

export type HeroInput = {
  moveX: number;
  moveY: number;
  magnitude: number;
  run: boolean;
};

export function initialHeroState(): HeroState {
  const [x, z] = cellCentre(KETTLE.startCell.c, KETTLE.startCell.r);
  return {
    x,
    z,
    y: groundHeightAt(x, z),
    yaw: 0, // facing north, up the Flooded Stair
    vx: 0,
    vz: 0,
    speed: 0,
    inWater: isWaterAt(x, z),
    distanceTravelled: 0,
  };
}

const LIMIT = CONFIG.hero.slopeLimit;

/** True when a step from a to b is allowed. Strict at the limit. */
function stepAllowed(ax: number, az: number, bx: number, bz: number): boolean {
  return slopeBetween(ax, az, bx, bz) < LIMIT;
}

export function stepHero(
  state: HeroState,
  input: HeroInput,
  cameraYaw: number,
  dt: number,
): HeroState {
  const { walkSpeed, runSpeed, accelDamp, yawDamp, waterSpeedFactor } = CONFIG.hero;

  // Camera-relative: rotate the input basis by the camera's yaw so "up" on the
  // stick is always away from the camera, whatever the camera is doing.
  const cos = Math.cos(cameraYaw);
  const sin = Math.sin(cameraYaw);
  const dirX = input.moveX * cos - input.moveY * sin;
  const dirZ = input.moveX * sin + input.moveY * cos;

  const base = input.run ? runSpeed : walkSpeed;
  const wet = state.inWater ? waterSpeedFactor : 1;
  const targetVx = dirX * base * input.magnitude * wet;
  const targetVz = dirZ * base * input.magnitude * wet;

  const vx = damp(state.vx, targetVx, accelDamp, dt);
  const vz = damp(state.vz, targetVz, accelDamp, dt);

  // Try the full step, then each axis alone, so Shim slides along a wall rather
  // than sticking to it. Three slope probes a frame, which is nothing.
  let x = state.x;
  let z = state.z;
  const wantX = state.x + vx * dt;
  const wantZ = state.z + vz * dt;

  if (stepAllowed(state.x, state.z, wantX, wantZ)) {
    x = wantX;
    z = wantZ;
  } else {
    if (stepAllowed(state.x, state.z, wantX, state.z)) x = wantX;
    if (stepAllowed(x, state.z, x, wantZ)) z = wantZ;
  }

  const movedX = x - state.x;
  const movedZ = z - state.z;
  const moved = Math.hypot(movedX, movedZ);

  // Yaw follows the direction actually travelled, not the direction requested,
  // so Shim faces along a wall while sliding instead of facing into it.
  let yaw = state.yaw;
  if (moved > 1e-5) {
    yaw = dampAngle(state.yaw, Math.atan2(movedX, -movedZ), yawDamp, dt);
  }

  return {
    x,
    z,
    y: groundHeightAt(x, z),
    yaw,
    // Velocity reflects what happened, so a blocked hero decelerates rather
    // than holding a phantom speed into the wall.
    vx: dt > 0 ? movedX / dt : 0,
    vz: dt > 0 ? movedZ / dt : 0,
    speed: dt > 0 ? moved / dt : 0,
    inWater: isWaterAt(x, z),
    distanceTravelled: state.distanceTravelled + moved,
  };
}

/** Current cell and zone token, for the stats overlay and % explored later. */
export function heroCell(state: HeroState): { c: number; r: number; token: string } {
  const { c, r } = cellAt(state.x, state.z);
  return { c, r, token: tokenAt(state.x, state.z) };
}
