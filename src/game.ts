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
import { occlusionAt } from './core/camera/occlusion';
import { framingAt } from './core/camera/framing';
import { groundHeightAt, isWaterAt } from './world/island/heightfield';
import { cellCentre } from './data/kettle';

/** Shape of window.__stillworks. See README, Debugging. */
export type StillworksDebug = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  config: typeof CONFIG;
  stats: StatsOverlay;
  readonly hero: HeroState;
  readonly input: InputState;
  islandBounds: () => THREE.Box3 | null;
  toggleStats: () => void;
  /** Put the hero at a world position, snapped to the ground, velocity zeroed. */
  teleport: (x: number, z: number) => HeroState;
  /** Put the hero at the centre of a 1-based grid cell, e.g. teleportCell(11, 7). */
  teleportCell: (c: number, r: number) => HeroState;
  /**
   * Simulate holding a KeyboardEvent.code for `seconds` of game time, stepping
   * the game synchronously. Returns the hero state when the key is released.
   *
   * Synchronous on purpose. The previous Promise-and-setTimeout version could
   * not work in a hidden tab, where Chrome starves requestAnimationFrame and
   * clamps timers to about once a minute: nothing stepped, and awaiting it hung
   * for 45 s. This version drives the loop itself, so it is deterministic and
   * cannot hang regardless of tab state.
   */
  simulate: (code: string, seconds: number, dt?: number) => HeroState;
  /** Is terrain between the camera and the hero, here and now? */
  occlusion: () => ReturnType<typeof occlusionAt>;
  /** What is actually in frame here: Shim's size, ground extents, rock share. */
  framing: () => ReturnType<typeof framingAt>;
};

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
    debug = false,
  ) {
    this.bundle = createRenderer(canvas);
    this.camera = new FollowCamera();
    this.keyboard = new Keyboard();
    this.stats = new StatsOverlay(uiRoot);
    if (debug) this.stats.toggle();

    this.scene.background = new THREE.Color(CONFIG.sky.noon);
    this.scene.fog = new THREE.Fog(CONFIG.sky.noon, CONFIG.render.fogNear, CONFIG.render.fogFar);

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

  update(dt: number, render = true): void {
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

    if (render) this.bundle.renderer.render(this.scene, this.camera.camera);
  }

  /**
   * Read-only handle for inspection from the browser console.
   *
   * This exists because the engineer on this project cannot see the screen: an
   * observer with a browser needs a way to answer "where is the island, where
   * is the hero, what does the camera think it is looking at" without reading
   * the source. Hero state is a getter because it is replaced every frame.
   * Keep this for the life of the project — see README, Debugging.
   */
  debugHandle(): StillworksDebug {
    const game = this;
    return {
      scene: this.scene,
      camera: this.camera.camera,
      renderer: this.bundle.renderer,
      config: CONFIG,
      stats: this.stats,
      get hero() {
        return game.hero;
      },
      get input() {
        return game.input;
      },
      islandBounds() {
        const island = game.scene.getObjectByName('island');
        return island ? new THREE.Box3().setFromObject(island) : null;
      },
      toggleStats: () => this.stats.toggle(),
      teleport: (x, z) => game.teleport(x, z),
      teleportCell: (c, r) => game.teleport(...cellCentre(c, r)),
      simulate: (code, seconds, dt) => game.simulate(code, seconds, dt),
      occlusion: () => occlusionAt(game.hero.x, game.hero.z),
      framing: () => framingAt(game.hero.x, game.hero.z),
    };
  }

  /** Debug only. Moves the hero without going through the controller. */
  private teleport(x: number, z: number): HeroState {
    this.hero = {
      ...this.hero,
      x,
      z,
      y: groundHeightAt(x, z),
      vx: 0,
      vz: 0,
      speed: 0,
      inWater: isWaterAt(x, z),
    };
    this.camera.snapTo(this.hero);
    return this.hero;
  }

  /** Debug only. Drives the loop directly, so it works in a hidden tab. */
  private simulate(code: string, seconds: number, dt = 1 / 60): HeroState {
    const frames = Math.max(1, Math.round(seconds / dt));
    this.keyboard.injectDown(code);
    for (let i = 0; i < frames; i++) this.update(dt, i === frames - 1);
    this.keyboard.injectUp(code);
    return this.hero;
  }

  dispose(): void {
    this.keyboard.dispose();
    this.shim.dispose();
    this.stats.dispose();
    this.bundle.dispose();
  }
}
