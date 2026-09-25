// @pure
// What is actually in frame, in metres.
//
// "Does the gorge read as a slot" is a composition question, but most of it is
// measurable: how wide a strip of ground the camera sees, whether the frame
// edges land on rock or on more floor, whether any sky is in shot, and how big
// Shim is as a fraction of the viewport. Measuring it means camera numbers can
// be chosen against the reference art's composition rather than guessed and
// screenshotted.
//
// Shares cameraOffset/liftAboveGround with FollowCamera, so it reports the
// camera that actually ships.

import { CONFIG } from '../../config';
import { groundHeightAt } from '../../world/island/heightfield';
import { cameraOffset, liftAboveGround } from './occlusion';

const deg = (d: number): number => (d * Math.PI) / 180;

export type CameraParams = {
  pitchDeg: number;
  yawDeg: number;
  distance: number;
  fovDeg: number;
};

export function currentParams(): CameraParams {
  const { pitchDeg, yawDeg, distance, fovDeg } = CONFIG.camera;
  return { pitchDeg, yawDeg, distance, fovDeg };
}

export type RayHit = { x: number; y: number; z: number; distance: number } | null;

/** March a ray against the height field. Returns the first hit, or null. */
export function marchToGround(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance = 400,
  step = 0.4,
): RayHit {
  for (let t = step; t <= maxDistance; t += step) {
    const x = ox + dx * t;
    const y = oy + dy * t;
    const z = oz + dz * t;
    if (y <= groundHeightAt(x, z)) {
      return { x, y, z, distance: t };
    }
  }
  return null;
}

export type Framing = {
  /** Shim's on-screen height as a fraction of the viewport (0.04 = 4%). */
  shimFraction: number;
  /** Frame height in metres at the hero's distance. */
  frameHeightM: number;
  /** Ground the frame spans left-to-right through the hero, in metres. */
  groundWidthM: number;
  /** Ground the frame spans near-to-far, in metres. */
  groundDepthM: number;
  /** True when the top-centre ray escapes without hitting terrain. */
  skyVisible: boolean;
  /** Height above the hero's feet of whatever the left frame edge lands on. */
  leftEdgeRiseM: number;
  /** Height above the hero's feet of whatever the right frame edge lands on. */
  rightEdgeRiseM: number;
  /** Both frame edges land on ground well above the hero: a slot, not a field. */
  wallsInFrame: boolean;
  /** Share of the frame filled by ground more than `wallRise` above the hero. */
  rockFraction: number;
  /** Highest point, relative to the hero's feet, that appears anywhere in frame. */
  highestRiseM: number;
};

/**
 * Measure the frame at a hero position.
 *
 * `wallRise` is how far above the hero's feet a frame edge must land before it
 * counts as a wall rather than more floor. 4 m is about Shim's height times
 * four — unmistakably a rock face rather than a rise in the ground.
 */
export function framingAt(
  x: number,
  z: number,
  params: CameraParams = currentParams(),
  aspect = 16 / 9,
  wallRise = 4,
): Framing {
  const y = groundHeightAt(x, z);
  const pitch = deg(params.pitchDeg);
  const yaw = deg(params.yawDeg);
  const vFov = deg(params.fovDeg);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

  const { ox, oy, oz } = cameraOffset(params);
  const tx = x;
  const ty = y + 0.6;
  const tz = z;
  const cx = tx + ox;
  const cz = tz + oz;
  const cy = liftAboveGround(cx, ty + oy, cz);

  const frameHeightM = 2 * params.distance * Math.tan(vFov / 2);

  // Basis: forward is camera -> target, right is horizontal, up completes it.
  let fx = tx - cx;
  let fy = ty - cy;
  let fz = tz - cz;
  const flen = Math.hypot(fx, fy, fz);
  fx /= flen;
  fy /= flen;
  fz /= flen;
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const ux = fy * rz - 0 * fz;
  const uy = fz * rx - fx * rz;
  const uz = 0 * fx - fy * rx;
  const ulen = Math.hypot(ux, uy, uz);

  const rayAt = (hAngle: number, vAngle: number): [number, number, number] => {
    const th = Math.tan(hAngle);
    const tv = Math.tan(vAngle);
    const dx = fx + rx * th + (ux / ulen) * tv;
    const dy = fy + 0 * th + (uy / ulen) * tv;
    const dz = fz + rz * th + (uz / ulen) * tv;
    const len = Math.hypot(dx, dy, dz);
    return [dx / len, dy / len, dz / len];
  };

  const cast = (h: number, v: number): RayHit => {
    const [dx, dy, dz] = rayAt(h, v);
    return marchToGround(cx, cy, cz, dx, dy, dz);
  };

  const left = cast(-hFov / 2, 0);
  const right = cast(hFov / 2, 0);
  const near = cast(0, -vFov / 2);
  const far = cast(0, vFov / 2);
  const top = cast(0, vFov / 2);

  const span = (a: RayHit, b: RayHit): number =>
    a && b ? Math.hypot(a.x - b.x, a.z - b.z) : 0;

  const rise = (hit: RayHit): number => (hit ? hit.y - y : 0);

  const leftEdgeRiseM = rise(left);
  const rightEdgeRiseM = rise(right);

  // Sample a grid across the frame: how much of what the player sees is rock
  // standing above them? The edge rays alone miss a wall that fills a corner.
  let rockSamples = 0;
  let totalSamples = 0;
  let highestRiseM = 0;
  const N = 9;
  for (let iv = 0; iv < N; iv++) {
    for (let ih = 0; ih < N; ih++) {
      const v = (iv / (N - 1) - 0.5) * vFov;
      const h = (ih / (N - 1) - 0.5) * hFov;
      const hit = cast(h, v);
      totalSamples += 1;
      if (hit) {
        const rise = hit.y - y;
        if (rise > highestRiseM) highestRiseM = rise;
        if (rise >= wallRise) rockSamples += 1;
      }
    }
  }

  return {
    rockFraction: rockSamples / totalSamples,
    highestRiseM,
    shimFraction: CONFIG.hero.height / frameHeightM,
    frameHeightM,
    groundWidthM: span(left, right),
    groundDepthM: span(near, far),
    skyVisible: top === null,
    leftEdgeRiseM,
    rightEdgeRiseM,
    wallsInFrame: leftEdgeRiseM >= wallRise && rightEdgeRiseM >= wallRise,
  };
}
