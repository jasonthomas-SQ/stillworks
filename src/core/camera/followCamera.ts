// Fixed-angle elevated follow camera. Yaw is a parameter from day one, so the
// later "gentle rotate" is a config change plus rotating the input basis, which
// stepHero already accepts.
//
// Pitch is deliberately steeper than a typical Tunic-style camera: Kettle is a
// slot with 20 to 34 m walls, and a shallow camera puts rock between the lens
// and Shim. Pitch, distance and FOV are all CONFIG numbers for exactly that
// reason — M1 visual check item 8 decides whether they need to move.

import * as THREE from 'three';
import { CONFIG } from '../../config';
import { damp } from '../math/damp';
import { cameraOffset, resolveCamera } from './occlusion';
import type { HeroState } from '../../entities/shim/heroController';

export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly yaw: number;

  private readonly target = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private lookAheadX = 0;
  private lookAheadZ = 0;
  private dolly = 1;

  constructor() {
    const { fovDeg, near, far, yawDeg } = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(fovDeg, 1, near, far);
    this.yaw = THREE.MathUtils.degToRad(yawDeg);

    // Offset from the hero to the camera, fixed for the whole game. Taken from
    // the pure module so the offline occlusion sweep and the real camera cannot
    // disagree about where the camera is.
    const { ox, oy, oz } = cameraOffset();
    this.offset.set(ox, oy, oz);
  }

  /**
   * Places the camera, dollying in and lifting where rock would otherwise sit
   * between the lens and Shim. The dolly factor is damped so backing against a
   * cliff is a smooth push-in rather than a jump.
   */
  private place(dt = 0): void {
    const solved = resolveCamera(this.target.x, this.target.y, this.target.z);
    this.dolly = dt > 0 ? damp(this.dolly, solved.factor, 8, dt) : solved.factor;

    const x = this.target.x + this.offset.x * this.dolly;
    const z = this.target.z + this.offset.z * this.dolly;
    const y = this.target.y + this.offset.y * this.dolly;
    // Re-resolve the lift at the damped position, or a mid-damp frame can clip.
    this.camera.position.set(x, Math.max(y, solved.cy), z);
    this.camera.lookAt(this.target);
  }

  /** Snap to the hero without damping. For the first frame and after a load. */
  snapTo(hero: HeroState): void {
    this.target.set(hero.x, hero.y + 0.6, hero.z);
    this.place();
  }

  update(hero: HeroState, dt: number): void {
    const { posDamp, lookAhead } = CONFIG.camera;

    // Look-ahead leads the hero slightly in the direction of travel, damped so
    // it eases in rather than snapping when a direction key goes down.
    const speed = Math.max(hero.speed, 1e-6);
    const wantAheadX = (hero.vx / speed) * lookAhead * Math.min(speed / CONFIG.hero.walkSpeed, 1);
    const wantAheadZ = (hero.vz / speed) * lookAhead * Math.min(speed / CONFIG.hero.walkSpeed, 1);
    this.lookAheadX = damp(this.lookAheadX, hero.speed > 0.05 ? wantAheadX : 0, 3, dt);
    this.lookAheadZ = damp(this.lookAheadZ, hero.speed > 0.05 ? wantAheadZ : 0, 3, dt);

    const wantX = hero.x + this.lookAheadX;
    const wantY = hero.y + 0.6;
    const wantZ = hero.z + this.lookAheadZ;

    this.target.set(
      damp(this.target.x, wantX, posDamp, dt),
      damp(this.target.y, wantY, posDamp, dt),
      damp(this.target.z, wantZ, posDamp, dt),
    );

    this.place(dt);
  }

  /**
   * Keeps the sun's shadow box on the hero and snapped to the shadow-map texel
   * grid. Without the snap, flat-shaded shadow edges crawl as the camera moves,
   * which is far more noticeable on hard facets than on smooth geometry.
   */
  frameShadow(light: THREE.DirectionalLight): void {
    const half = CONFIG.render.shadowBoxHalf;
    const cam = light.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = 220;

    const texelSize = (half * 2) / CONFIG.render.shadowMapSize;
    const snappedX = Math.round(this.target.x / texelSize) * texelSize;
    const snappedZ = Math.round(this.target.z / texelSize) * texelSize;

    light.target.position.set(snappedX, this.target.y, snappedZ);
    light.target.updateMatrixWorld();
    cam.updateProjectionMatrix();
  }
}
