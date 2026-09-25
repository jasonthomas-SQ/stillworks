// @pure
// Frame-rate-independent exponential damping. A constant lerp inside an update
// loop ships a game that feels different on a 144 Hz screen; this does not.

export function damp(current: number, target: number, rate: number, dt: number): number {
  if (dt <= 0) return current;
  return target + (current - target) * Math.exp(-rate * dt);
}

/** Damps an angle along the shorter arc, so a turn never takes the long way round. */
export function dampAngle(current: number, target: number, rate: number, dt: number): number {
  if (dt <= 0) return current;
  const TAU = Math.PI * 2;
  let delta = (target - current) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return current + delta * (1 - Math.exp(-rate * dt));
}
