// The composition root. Every system meets here and nowhere else, and this file
// owns the frame update order.
//
// Order, and the reasons: input first because everything reads it; the hero
// before the pose because the pose is driven by the hero's speed; the camera
// after the hero so it follows this frame's position rather than last frame's;
// the shadow box after the camera because it is framed on the camera target;
// stats last before the render so the counts it reads are the previous frame's
// complete totals.

import * as THREE from 'three';
import { CONFIG } from './config';
import { createRenderer, syncCameraToCanvas, type RendererBundle } from './core/renderer';
import { Keyboard } from './core/input/keyboard';
import { Gamepad_ } from './core/input/gamepad';
import { mergeInput, emptyInput, type InputState } from './core/input/merge';
import { FollowCamera } from './core/camera/followCamera';
import { StatsOverlay } from './core/debug/statsOverlay';
import { buildIslandMesh, buildWaterStandIn } from './world/island/islandMesh';
import { stepHero, initialHeroState, heroCell, type HeroState } from './entities/shim/heroController';
import { stepPose, initialPoseMemory, type PoseMemory } from './entities/shim/shimPose';
import { ShimView } from './entities/shim/shimView';

const ZONE_NAMES: Record<string, string> = {
  A: 'Flooded Stair',
  B: 'Fernwell',
  C: 'Warm Stones',
  D: 'Spool Yard',
  E: 'Canopy Walk',
  F: 'Winding Loft',
  '~': 'Flooded Stair',
  '#': 'off-path',
};

export class Game {
  private readonly bundle: RendererBundle;
  private readonly scene = new THREE.Scene();
  private readonly camera: FollowCamera;
  private readonly keyboard: Keyboard;
  private readonly gamepad = new Gamepad_();
  private readonly shim = new ShimView();
  private readonly stats: StatsOverlay;
  private readonly sun: THREE.DirectionalLight;

  private input: InputState = emptyInput();
  private hero: HeroState = initialHeroState();
  private poseMem: PoseMemory = initialPoseMemory();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
  ) {
    this.bundle = createRenderer(canvas);
    this.camera = new FollowCamera();
    this.keyboard = new Keyboard();
    this.stats = new StatsOverlay(uiRoot);

    this.scene.background = new THREE.Color(CONFIG.sky.noon);
    this.scene.fog = new THREE.Fog(CONFIG.sky.noon, 60, 260);

    this.scene.add(buildIslandMesh());
    this.scene.add(buildWaterStandIn());
    this.scene.add(this.shim.root);

    // M1 lighting: one static noon sun. Replaced wholesale by the day cycle in
    // M2. Physical units — three 0.186 is past the lighting cutover.
    this.sun = new THREE.DirectionalLight(new THREE.Color('#FFF4E0'), 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(CONFIG.render.shadowMapSize, CONFIG.render.shadowMapSize);
    this.sun.shadow.normalBias = CONFIG.render.shadowNormalBias;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(
      new THREE.HemisphereLight(
        new THREE.Color(CONFIG.sky.noon),
        new THREE.Color(CONFIG.palette.fernDeep),
        1,
      ),
    );

    this.camera.snapTo(this.hero);
  }

  update(dt: number): void {
    // 1. input
    const prev = this.input;
    this.input = mergeInput(prev, [this.keyboard.poll(), this.gamepad.poll()]);
    if (this.input.justPressed.stats) this.stats.toggle();

    // 2. hero
    const before = this.hero;
    this.hero = stepHero(
      this.hero,
      {
        moveX: this.input.moveX,
        moveY: this.input.moveY,
        magnitude: this.input.magnitude,
        run: this.input.held.run,
      },
      this.camera.yaw,
      dt,
    );
    const yawRate = dt > 0 ? (this.hero.yaw - before.yaw) / dt : 0;

    // 3. pose, then body
    const posed = stepPose(this.poseMem, {
      speed: this.hero.speed,
      dt,
      inWater: this.hero.inWater,
      yawRate,
    });
    this.poseMem = posed.mem;
    this.shim.write(posed.pose, this.hero.x, this.hero.y, this.hero.z, this.hero.yaw);

    // 4. camera, then the shadow box that is framed on it
    this.camera.update(this.hero, dt);
    this.sun.position.set(this.hero.x + 60, this.hero.y + 90, this.hero.z + 40);
    this.camera.frameShadow(this.sun);

    syncCameraToCanvas(this.camera.camera, this.canvas);

    // 5. stats, then render
    const cell = heroCell(this.hero);
    this.stats.sample(this.bundle.renderer, {
      cell: `c${cell.c}r${cell.r}`,
      zone: ZONE_NAMES[cell.token] ?? cell.token,
      height: `${this.hero.y.toFixed(2)} m`,
      speed: `${this.hero.speed.toFixed(2)} m/s${this.hero.inWater ? ' (water)' : ''}`,
      device: this.input.lastDevice ?? 'none yet',
    });

    this.bundle.renderer.render(this.scene, this.camera.camera);
  }

  dispose(): void {
    this.keyboard.dispose();
    this.shim.dispose();
    this.stats.dispose();
    this.bundle.dispose();
  }
}
